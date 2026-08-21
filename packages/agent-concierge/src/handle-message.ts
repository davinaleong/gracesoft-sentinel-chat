import type {
  AIProvider,
  Booking,
  BusinessConfig,
  CalendarProvider,
  ConversationState,
  NormalizedMessage,
  NormalizedResponse,
} from "@gracesoft-sentinel/core";
import type { Dayjs } from "dayjs";
import { resolveDayHours, isWithinHours } from "./business-hours.js";
import { extractAppointmentId, generateAppointmentId } from "./appointment-id.js";
import { parseBookingRequest } from "./booking-intent.js";
import {
  bookingsMadeToday,
  DAILY_BOOKING_LIMIT,
  formatSlotLabel,
  incrementBookingsToday,
  isAffirmative,
  isNegative,
  isRejectingCandidates,
  resolveSlotSelection,
  toBookingCandidates,
  withContext,
  type ConciergeContext,
} from "./booking-state.js";
import type { FaqGroundingBlueprint } from "./faq-matcher.js";
import { answerFaq } from "./faq-matcher.js";
import { DEFAULT_SLOT_DURATION_MINUTES, findNextAvailableSlots, isSlotAvailable } from "./slot-engine.js";
import { businessNow, dayjs, inBusinessTz } from "./time.js";

export interface ConciergeHandleMessageInput {
  message: NormalizedMessage;
  state: ConversationState;
  businessConfig: BusinessConfig;
  calendarProvider: CalendarProvider;
  aiProvider: AIProvider;
  faqBlueprint: FaqGroundingBlueprint;
  /** Injection point for deterministic tests; defaults to the real clock. */
  now?: Date;
}

export interface ConciergeHandleMessageResult {
  response: NormalizedResponse;
  state: ConversationState;
}

function offerSlotsResponse(
  slots: { start: string; end: string }[],
  timezone: string,
  state: ConversationState,
  promptText: string,
  extraContext: Partial<ConciergeContext> = {}
): ConciergeHandleMessageResult {
  const candidates = toBookingCandidates(slots);
  return {
    response: {
      text: promptText,
      quickReplies: candidates.map((c) => ({ id: c.id, label: formatSlotLabel(c.start, timezone) })),
    },
    state: withContext(state, { bookingCandidates: candidates, ...extraContext }),
  };
}

/**
 * Every call site inside handleBookingRequest offers slots for a brand new
 * booking, never a continuation of a reschedule — reschedulingBookingId
 * must be explicitly cleared here, not just left to withContext's merge,
 * or a chatter who abandoned an earlier reschedule offer (candidates shown
 * but never picked, then asked for a completely new booking instead) would
 * have their new candidate list corrupted by a stale marker: picking one
 * would silently move the old booking rather than creating a new one.
 */
const CLEAR_RESCHEDULE_CONTEXT: Partial<ConciergeContext> = { reschedulingBookingId: undefined };

const BOOKING_FAILED_MESSAGE =
  "Sorry, I couldn't complete that booking right now — please try again in a moment, or let us know if it keeps happening.";
const DAILY_LIMIT_MESSAGE =
  "You've reached today's booking limit for new appointments — please contact us directly if this is urgent, or try again tomorrow.";
const NO_BOOKING_FOUND_MESSAGE = "I couldn't find a booking with that appointment ID — could you double-check it?";

/**
 * The last instant a booking or reschedule may land on, per the business's
 * own `maxBookingHorizonDays` policy. `undefined` when the business hasn't
 * set one — i.e. no cap beyond the slot engine's own default search
 * horizon (`DEFAULT_HORIZON_DAYS`).
 */
function maxAdvanceBookingDate(businessConfig: BusinessConfig, now: Dayjs): Dayjs | undefined {
  return businessConfig.maxBookingHorizonDays === undefined
    ? undefined
    : now.add(businessConfig.maxBookingHorizonDays, "day").endOf("day");
}

/**
 * Shrinks the slot engine's search horizon so a capped business never has
 * slots suggested past its own `maxBookingHorizonDays`, regardless of
 * where the search starts from. `undefined` (no cap set) lets
 * `findNextAvailableSlots` fall back to its own `DEFAULT_HORIZON_DAYS`.
 */
function boundedHorizonDays(maxDate: Dayjs | undefined, from: Dayjs): number | undefined {
  return maxDate ? Math.max(maxDate.diff(from.startOf("day"), "day"), 0) : undefined;
}

function tooFarAheadMessage(maxDate: Dayjs): string {
  return `We're only able to book appointments up to ${maxDate.format("ddd, D MMM")} in advance — could you pick an earlier date?`;
}

/** Creates a brand-new booking: generates its appointment id, enforces the daily cap, and reports both back to the chatter. */
async function createNewBooking(params: {
  calendarProvider: CalendarProvider;
  businessConfig: BusinessConfig;
  message: NormalizedMessage;
  start: string;
  end: string;
  state: ConversationState;
  now: Dayjs;
}): Promise<ConciergeHandleMessageResult> {
  const context = (params.state.context ?? {}) as ConciergeContext;
  if (bookingsMadeToday(context, params.now) >= DAILY_BOOKING_LIMIT) {
    return { response: { text: DAILY_LIMIT_MESSAGE }, state: withContext(params.state, { bookingCandidates: undefined, ...CLEAR_RESCHEDULE_CONTEXT }) };
  }

  const appointmentId = generateAppointmentId();
  let booking: Booking;
  try {
    booking = await params.calendarProvider.createBooking({
      calendarId: params.businessConfig.calendarId,
      start: params.start,
      end: params.end,
      timezone: params.businessConfig.timezone,
      summary: `${appointmentId} ${params.message.channel}`,
      appointmentId,
      attendee: { contact: params.message.senderId },
    });
  } catch (err) {
    // A calendar API failure (auth, network, quota) must never surface as a
    // silent failure — the ack already happened at the channel layer, so
    // without this the chatter would simply get no response at all.
    console.error("[agent-concierge] createBooking failed:", err);
    return { response: { text: BOOKING_FAILED_MESSAGE }, state: withContext(params.state, { bookingCandidates: undefined, ...CLEAR_RESCHEDULE_CONTEXT }) };
  }

  const label = formatSlotLabel(booking.start, params.businessConfig.timezone);
  return {
    response: {
      text: `You're booked for ${label}. Your appointment ID is ${booking.appointmentId} — please keep this, you'll need it to check or change this booking later.`,
    },
    state: withContext(params.state, {
      bookingCandidates: undefined,
      lastAppointmentId: booking.appointmentId,
      bookingsToday: incrementBookingsToday(context, params.now),
      ...CLEAR_RESCHEDULE_CONTEXT,
    }),
  };
}

/** Moves an already-existing booking (found via appointment id) to a newly selected slot. */
async function moveExistingBooking(params: {
  calendarProvider: CalendarProvider;
  businessConfig: BusinessConfig;
  bookingId: string;
  start: string;
  end: string;
  state: ConversationState;
}): Promise<ConciergeHandleMessageResult> {
  let booking: Booking;
  try {
    booking = await params.calendarProvider.updateBooking({
      calendarId: params.businessConfig.calendarId,
      id: params.bookingId,
      start: params.start,
      end: params.end,
      timezone: params.businessConfig.timezone,
    });
  } catch (err) {
    console.error("[agent-concierge] updateBooking failed:", err);
    return {
      response: { text: BOOKING_FAILED_MESSAGE },
      state: withContext(params.state, { bookingCandidates: undefined, reschedulingBookingId: undefined }),
    };
  }

  const label = formatSlotLabel(booking.start, params.businessConfig.timezone);
  return {
    response: { text: `Your appointment (${booking.appointmentId}) has been moved to ${label}. See you then!` },
    state: withContext(params.state, {
      bookingCandidates: undefined,
      reschedulingBookingId: undefined,
      lastAppointmentId: booking.appointmentId,
    }),
  };
}

async function handlePendingSelection(params: {
  context: ConciergeContext;
  message: NormalizedMessage;
  businessConfig: BusinessConfig;
  calendarProvider: CalendarProvider;
  state: ConversationState;
  now: Dayjs;
}): Promise<ConciergeHandleMessageResult | undefined> {
  const candidates = params.context.bookingCandidates;
  if (!candidates || candidates.length === 0) return undefined;

  const selected = resolveSlotSelection({
    candidates,
    quickReplyId: params.message.quickReplyId,
    text: params.message.text,
  });
  if (selected) {
    if (params.context.reschedulingBookingId) {
      return moveExistingBooking({
        calendarProvider: params.calendarProvider,
        businessConfig: params.businessConfig,
        bookingId: params.context.reschedulingBookingId,
        start: selected.start,
        end: selected.end,
        state: params.state,
      });
    }
    return createNewBooking({
      calendarProvider: params.calendarProvider,
      businessConfig: params.businessConfig,
      message: params.message,
      start: selected.start,
      end: selected.end,
      state: params.state,
      now: params.now,
    });
  }

  if (params.message.text && isRejectingCandidates(params.message.text)) {
    // Search from after the last rejected candidate's end, so the next
    // batch is guaranteed to be genuinely different slots, not a repeat.
    // Works identically for a reschedule in progress: reschedulingBookingId
    // survives untouched, since withContext merges rather than replaces.
    const lastCandidate = candidates[candidates.length - 1]!;
    const slots = await findNextAvailableSlots({
      calendarProvider: params.calendarProvider,
      calendarId: params.businessConfig.calendarId,
      businessHours: params.businessConfig.businessHours,
      timezone: params.businessConfig.timezone,
      // Business-timezone-aware, not a plain dayjs(iso) parse — the latter's
      // field getters (.hour(), .startOf('day')) fall back to the *system*
      // timezone (whatever the deployment host/container happens to be,
      // e.g. UTC), not the business's. When candidate generation needs to
      // roll into a following day, that mismatch silently offsets "9am
      // open" by the gap between the two zones (8h for Asia/Singapore vs.
      // UTC) rather than raising an error, so it's easy to miss without a
      // regression test pinned to a non-UTC business timezone.
      //
      // inBusinessTz (dayjs(iso).tz(zone)), not dayjs.tz(iso, zone): the
      // latter's *string* form parses iso's wall-clock digits as already
      // being in `zone`, ignoring its embedded offset entirely — it's for
      // parsing a naive local time, not re-viewing an existing instant.
      from: inBusinessTz(lastCandidate.end, params.businessConfig.timezone),
      horizonDays: boundedHorizonDays(
        maxAdvanceBookingDate(params.businessConfig, params.now),
        inBusinessTz(lastCandidate.end, params.businessConfig.timezone)
      ),
    });
    if (slots.length === 0) {
      return {
        response: { text: "I'm not finding any other openings right now — could you let us know a date or time that works for you?" },
        state: withContext(params.state, { bookingCandidates: undefined }),
      };
    }
    return offerSlotsResponse(slots, params.businessConfig.timezone, params.state, "No worries — here are some other options:");
  }

  return undefined;
}

async function handleBookingRequest(params: {
  text: string;
  message: NormalizedMessage;
  businessConfig: BusinessConfig;
  calendarProvider: CalendarProvider;
  state: ConversationState;
  now: Dayjs;
}): Promise<ConciergeHandleMessageResult> {
  const { businessConfig, calendarProvider, state, now } = params;
  const parsed = parseBookingRequest(params.text, now);
  const businessHours = businessConfig.businessHours;
  const maxDate = maxAdvanceBookingDate(businessConfig, now);

  // An explicit date beyond the business's own cap is a dead end no matter
  // whether a time was also given — check it once, up front, rather than
  // duplicating the same guard in both the date+time and date-only branches
  // below (and running a search that could only ever come back empty).
  if (parsed.date && maxDate && dayjs.tz(parsed.date, businessConfig.timezone).isAfter(maxDate)) {
    return { response: { text: tooFarAheadMessage(maxDate) }, state: withContext(state, CLEAR_RESCHEDULE_CONTEXT) };
  }

  if (parsed.date && parsed.time) {
    const start = dayjs.tz(`${parsed.date} ${parsed.time}`, businessConfig.timezone);
    const end = start.add(DEFAULT_SLOT_DURATION_MINUTES, "minute");
    const dayHours = resolveDayHours(businessHours, start);
    const available =
      dayHours !== null && isWithinHours(start, dayHours)
        ? await isSlotAvailable({ calendarProvider, calendarId: businessConfig.calendarId, start, end, timezone: businessConfig.timezone })
        : false;

    if (available) {
      return createNewBooking({
        calendarProvider,
        businessConfig,
        message: params.message,
        start: start.toISOString(),
        end: end.toISOString(),
        state,
        now,
      });
    }

    const slots = await findNextAvailableSlots({
      calendarProvider,
      calendarId: businessConfig.calendarId,
      businessHours,
      timezone: businessConfig.timezone,
      from: start,
      horizonDays: boundedHorizonDays(maxDate, start),
    });
    return offerSlotsResponse(slots, businessConfig.timezone, state, "That slot isn't available. Here are the next options:", CLEAR_RESCHEDULE_CONTEXT);
  }

  if (parsed.date && !parsed.time) {
    const from = dayjs.tz(parsed.date, businessConfig.timezone).startOf("day");
    const slots = await findNextAvailableSlots({
      calendarProvider,
      calendarId: businessConfig.calendarId,
      businessHours,
      timezone: businessConfig.timezone,
      from,
      horizonDays: boundedHorizonDays(maxDate, from),
    });
    return offerSlotsResponse(slots, businessConfig.timezone, state, "Here are the next available slots on or after that date:", CLEAR_RESCHEDULE_CONTEXT);
  }

  if (!parsed.date && parsed.time) {
    const todayAtRequestedTime = dayjs.tz(`${now.format("YYYY-MM-DD")} ${parsed.time}`, businessConfig.timezone);
    const todayHours = resolveDayHours(businessHours, now);
    const requestedTimeIsWithinTodayHours = todayHours !== null && isWithinHours(todayAtRequestedTime, todayHours);

    if (requestedTimeIsWithinTodayHours && !todayAtRequestedTime.isBefore(now)) {
      const end = todayAtRequestedTime.add(DEFAULT_SLOT_DURATION_MINUTES, "minute");
      const available = await isSlotAvailable({
        calendarProvider,
        calendarId: businessConfig.calendarId,
        start: todayAtRequestedTime,
        end,
        timezone: businessConfig.timezone,
      });
      if (available) {
        return createNewBooking({
          calendarProvider,
          businessConfig,
          message: params.message,
          start: todayAtRequestedTime.toISOString(),
          end: end.toISOString(),
          state,
          now,
        });
      }
      // Today unavailable at that time — roll forward; the engine will skip
      // to the next business day if nothing else today is free.
      const slots = await findNextAvailableSlots({
        calendarProvider,
        calendarId: businessConfig.calendarId,
        businessHours,
        timezone: businessConfig.timezone,
        from: now,
        horizonDays: boundedHorizonDays(maxDate, now),
      });
      return offerSlotsResponse(slots, businessConfig.timezone, state, "That time isn't available today. Here are the next options:", CLEAR_RESCHEDULE_CONTEXT);
    }

    // Outside office hours (or today is closed) — no same-day assumption,
    // go straight to the next business day.
    const from = now.add(1, "day").startOf("day");
    const slots = await findNextAvailableSlots({
      calendarProvider,
      calendarId: businessConfig.calendarId,
      businessHours,
      timezone: businessConfig.timezone,
      from,
      horizonDays: boundedHorizonDays(maxDate, from),
    });
    return offerSlotsResponse(slots, businessConfig.timezone, state, "That's outside our hours. Here are the next available slots:", CLEAR_RESCHEDULE_CONTEXT);
  }

  const slots = await findNextAvailableSlots({
    calendarProvider,
    calendarId: businessConfig.calendarId,
    businessHours,
    timezone: businessConfig.timezone,
    from: now,
    horizonDays: boundedHorizonDays(maxDate, now),
  });
  return offerSlotsResponse(slots, businessConfig.timezone, state, "Here are the next available slots:", CLEAR_RESCHEDULE_CONTEXT);
}

// "my" is optional throughout — "change appointment" (no possessive) is at
// least as natural as "change my appointment", especially in Singlish
// phrasing, which tends to drop possessives/subjects entirely.
const RESCHEDULE_INTENT_PATTERN =
  /\b(reschedul\w*|(?:change|move|shift|postpone) (?:my )?(?:appointment|appt|booking)|different time for (?:my )?(?:appointment|appt|booking)|change (?:the )?time of (?:my )?(?:appointment|appt|booking))\b/i;

function looksLikeRescheduleRequest(text: string): boolean {
  return RESCHEDULE_INTENT_PATTERN.test(text);
}

const RESET_PATTERN = /^\s*\/start\b|^\s*(hi|hello|hey)\b|\b(cancel|never ?mind|forget it|start over)\b/i;

/**
 * Whether `text` looks like the chatter has moved on to something else,
 * rather than answering what we last asked them (their appointment id, or
 * yes/no to a suggested one). Without this, "awaiting appointment id" had
 * no way out: every later message — including /start or a brand new
 * booking request — got swallowed as a failed id lookup, trapping the
 * conversation until a valid id finally showed up.
 */
function looksLikeFreshTopic(text: string, now: Dayjs): boolean {
  if (!text) return false;
  if (RESET_PATTERN.test(text)) return true;
  if (looksLikeRescheduleRequest(text)) return true;
  if (looksLikeCancelRequest(text)) return true;
  const parsed = parseBookingRequest(text, now);
  return parsed.hasBookingIntent || parsed.date !== undefined || parsed.time !== undefined;
}

/** Offers 3 new slots for an already-located booking; the current slot is never among them since the calendar itself already shows it as busy. */
/** Runs a slot search and turns it into either "no openings" or a candidate-picker response — the tail shared by every path through `offerRescheduleSlots`. */
async function offerRescheduleCandidates(params: {
  booking: Booking;
  businessConfig: BusinessConfig;
  calendarProvider: CalendarProvider;
  state: ConversationState;
  from: Dayjs;
  maxDate: Dayjs | undefined;
  promptText: string;
}): Promise<ConciergeHandleMessageResult> {
  const slots = await findNextAvailableSlots({
    calendarProvider: params.calendarProvider,
    calendarId: params.businessConfig.calendarId,
    businessHours: params.businessConfig.businessHours,
    timezone: params.businessConfig.timezone,
    from: params.from,
    horizonDays: boundedHorizonDays(params.maxDate, params.from),
  });
  if (slots.length === 0) {
    return {
      response: { text: "I couldn't find any other openings right now — please try again later, or let us know a date/time you'd prefer." },
      state: withContext(params.state, { awaitingAppointmentId: undefined, pendingRescheduleConfirmationId: undefined }),
    };
  }

  const candidates = toBookingCandidates(slots);
  return {
    response: {
      text: params.promptText,
      quickReplies: candidates.map((c) => ({ id: c.id, label: formatSlotLabel(c.start, params.businessConfig.timezone) })),
    },
    state: withContext(params.state, {
      bookingCandidates: candidates,
      reschedulingBookingId: params.booking.id,
      lastAppointmentId: params.booking.appointmentId,
      awaitingAppointmentId: undefined,
      pendingRescheduleConfirmationId: undefined,
    }),
  };
}

/**
 * Offers new times for an already-located booking. When the chatter named
 * a specific date/time ("...to next Tuesday", "...to 3pm on the 26th"),
 * that's honored as the search anchor — or, if date+time together land on
 * an actually-free slot, the booking is moved there directly, the same
 * "auto-book an exact available slot" shortcut `handleBookingRequest` uses
 * for a fresh booking. With no date/time mentioned, falls back to the
 * previous default: whichever is later, right now or the booking's own
 * current start (never offered *earlier* than what's already booked).
 */
async function offerRescheduleSlots(params: {
  booking: Booking;
  businessConfig: BusinessConfig;
  calendarProvider: CalendarProvider;
  state: ConversationState;
  now: Dayjs;
  requestedDate?: string;
  requestedTime?: string;
}): Promise<ConciergeHandleMessageResult> {
  const { businessConfig, calendarProvider, state, now, booking, requestedDate, requestedTime } = params;
  const businessHours = businessConfig.businessHours;
  const maxDate = maxAdvanceBookingDate(businessConfig, now);

  if (requestedDate && maxDate && dayjs.tz(requestedDate, businessConfig.timezone).isAfter(maxDate)) {
    return {
      response: { text: tooFarAheadMessage(maxDate) },
      state: withContext(state, { awaitingAppointmentId: undefined, pendingRescheduleConfirmationId: undefined }),
    };
  }

  if (requestedDate && requestedTime) {
    const start = dayjs.tz(`${requestedDate} ${requestedTime}`, businessConfig.timezone);
    const end = start.add(DEFAULT_SLOT_DURATION_MINUTES, "minute");
    const dayHours = resolveDayHours(businessHours, start);
    const available =
      !start.isBefore(now) && dayHours !== null && isWithinHours(start, dayHours)
        ? await isSlotAvailable({ calendarProvider, calendarId: businessConfig.calendarId, start, end, timezone: businessConfig.timezone })
        : false;

    if (available) {
      return moveExistingBooking({
        calendarProvider,
        businessConfig,
        bookingId: booking.id,
        start: start.toISOString(),
        end: end.toISOString(),
        state,
      });
    }

    return offerRescheduleCandidates({
      booking,
      businessConfig,
      calendarProvider,
      state,
      from: start.isBefore(now) ? now : start,
      maxDate,
      promptText: "That slot isn't available. Here are the next options:",
    });
  }

  let from: Dayjs;
  if (requestedDate) {
    const requested = dayjs.tz(requestedDate, businessConfig.timezone).startOf("day");
    from = requested.isBefore(now) ? now : requested;
  } else {
    // Search from whichever is later: right now, or the booking's own
    // current start. "Now" alone isn't enough — a booking made for next
    // week, rescheduled today, would otherwise get offered slots *earlier*
    // than the one already booked (still genuinely future, just not what
    // "change my appointment" means: moving it, not stepping backwards).
    const bookingStart = inBusinessTz(booking.start, businessConfig.timezone);
    from = bookingStart.isAfter(now) ? bookingStart : now;
  }

  return offerRescheduleCandidates({
    booking,
    businessConfig,
    calendarProvider,
    state,
    from,
    maxDate,
    promptText: `Sure — here are some other times for ${booking.appointmentId}:`,
  });
}

async function lookupAndOfferReschedule(params: {
  appointmentId: string;
  businessConfig: BusinessConfig;
  calendarProvider: CalendarProvider;
  state: ConversationState;
  now: Dayjs;
  requestedDate?: string;
  requestedTime?: string;
}): Promise<ConciergeHandleMessageResult> {
  const booking = await params.calendarProvider.findBookingByAppointmentId({
    calendarId: params.businessConfig.calendarId,
    appointmentId: params.appointmentId,
  });
  if (!booking) {
    return {
      response: { text: NO_BOOKING_FOUND_MESSAGE },
      state: withContext(params.state, { awaitingAppointmentId: true, pendingRescheduleConfirmationId: undefined }),
    };
  }
  return offerRescheduleSlots({
    booking,
    businessConfig: params.businessConfig,
    calendarProvider: params.calendarProvider,
    state: params.state,
    now: params.now,
    requestedDate: params.requestedDate,
    requestedTime: params.requestedTime,
  });
}

/**
 * Handles every step of "chatter wants to change their appointment" that
 * happens *before* slots are offered — verifying which appointment id
 * they mean. Once a booking is located, `bookingCandidates` +
 * `reschedulingBookingId` take over and `handlePendingSelection` drives
 * the rest, same as a fresh booking.
 *
 * Per the "frictionless retrieval" design: the appointment id is treated as
 * the closest thing this system has to proof of ownership, so it's never
 * acted on without either being typed directly or explicitly confirmed —
 * `lastAppointmentId` (this same chatter's own most recent booking, within
 * this session) is offered only as a suggestion, never auto-applied.
 */
async function handleReschedulePreOffer(params: {
  context: ConciergeContext;
  text: string;
  businessConfig: BusinessConfig;
  calendarProvider: CalendarProvider;
  state: ConversationState;
  now: Dayjs;
}): Promise<ConciergeHandleMessageResult | undefined> {
  const { context, text, businessConfig, calendarProvider, state, now } = params;
  // Parsed once and threaded through every path below that resolves an
  // appointment id, so "change appointment GS-XXXX-XXXX to next Tuesday"
  // (id and date in the same message) honors the requested date instead of
  // always defaulting to the soonest opening.
  const { date: requestedDate, time: requestedTime } = parseBookingRequest(text, now);

  if (context.awaitingAppointmentId) {
    const appointmentId = extractAppointmentId(text) ?? text.trim().toUpperCase();
    return lookupAndOfferReschedule({ appointmentId, businessConfig, calendarProvider, state, now, requestedDate, requestedTime });
  }

  if (context.pendingRescheduleConfirmationId) {
    const suggested = context.pendingRescheduleConfirmationId;
    const typedId = extractAppointmentId(text);
    if (typedId) {
      return lookupAndOfferReschedule({ appointmentId: typedId, businessConfig, calendarProvider, state, now, requestedDate, requestedTime });
    }
    if (isAffirmative(text)) {
      return lookupAndOfferReschedule({ appointmentId: suggested, businessConfig, calendarProvider, state, now, requestedDate, requestedTime });
    }
    if (isNegative(text)) {
      return {
        response: { text: "No problem — what's your appointment ID?" },
        state: withContext(state, { awaitingAppointmentId: true, pendingRescheduleConfirmationId: undefined }),
      };
    }
    return {
      response: { text: `Just to confirm — did you mean appointment ${suggested}? Reply yes or no, or send the correct appointment ID.` },
      state,
    };
  }

  if (!looksLikeRescheduleRequest(text)) return undefined;

  const typedId = extractAppointmentId(text);
  if (typedId) {
    return lookupAndOfferReschedule({ appointmentId: typedId, businessConfig, calendarProvider, state, now, requestedDate, requestedTime });
  }

  if (context.lastAppointmentId) {
    return {
      response: { text: `Looks like you might mean ${context.lastAppointmentId} — is that the one? (yes/no, or send the correct appointment ID)` },
      state: withContext(state, { pendingRescheduleConfirmationId: context.lastAppointmentId }),
    };
  }

  return {
    response: { text: "Sure — what's your appointment ID? You'll find it in your original booking confirmation." },
    state: withContext(state, { awaitingAppointmentId: true }),
  };
}

const CANCEL_APPOINTMENT_INTENT_PATTERN = /\b(cancel|call off) (?:my |the )?(?:appointment|appt|booking)\b/i;

function looksLikeCancelRequest(text: string): boolean {
  return CANCEL_APPOINTMENT_INTENT_PATTERN.test(text);
}

const CANCEL_FAILED_MESSAGE =
  "Sorry, I couldn't cancel that booking right now — please try again in a moment, or let us know if it keeps happening.";

/**
 * The word "cancel" is genuinely ambiguous across this codebase: as a
 * bare reset keyword (see RESET_PATTERN) it means "drop what we were
 * doing", but as a reply to "cancel your appointment? yes/no" it
 * unambiguously means "yes, do it" — the same word, opposite meaning,
 * disambiguated entirely by which question is currently pending. This
 * check exists only for that second, narrower context.
 */
function confirmsCancellation(text: string): boolean {
  return isAffirmative(text) || /\bcancel\b/i.test(text);
}

function abortsCancellation(text: string): boolean {
  return isNegative(text) || /\b(keep it|keep my appointment|don'?t cancel)\b/i.test(text);
}

// Same idea as RESET_PATTERN, minus the bare "cancel" keyword: escaping the
// pendingCancelBookingId gate (see handleMessageInner) must never trigger
// on the word "cancel" itself, since that's exactly what confirms the
// cancellation there — only used once confirmsCancellation/abortsCancellation
// have both already failed to match, so nothing containing "cancel" ever
// reaches this check in practice.
const RESET_PATTERN_WITHOUT_CANCEL = /^\s*\/start\b|^\s*(hi|hello|hey)\b|\b(never ?mind|forget it|start over)\b/i;

function looksLikeFreshTopicExcludingBareCancel(text: string, now: Dayjs): boolean {
  if (!text) return false;
  if (RESET_PATTERN_WITHOUT_CANCEL.test(text)) return true;
  if (looksLikeRescheduleRequest(text)) return true;
  const parsed = parseBookingRequest(text, now);
  return parsed.hasBookingIntent || parsed.date !== undefined || parsed.time !== undefined;
}

async function askCancelConfirmation(params: {
  booking: Booking;
  businessConfig: BusinessConfig;
  state: ConversationState;
}): Promise<ConciergeHandleMessageResult> {
  const label = formatSlotLabel(params.booking.start, params.businessConfig.timezone);
  return {
    response: {
      text: `Just to confirm — cancel your appointment ${params.booking.appointmentId} (${label})? This can't be undone. Reply yes to confirm, or no to keep it.`,
    },
    state: withContext(params.state, {
      pendingCancelBookingId: params.booking.id,
      lastAppointmentId: params.booking.appointmentId,
      awaitingCancelAppointmentId: undefined,
      pendingCancelConfirmationId: undefined,
    }),
  };
}

async function lookupAndAskCancelConfirmation(params: {
  appointmentId: string;
  businessConfig: BusinessConfig;
  calendarProvider: CalendarProvider;
  state: ConversationState;
}): Promise<ConciergeHandleMessageResult> {
  const booking = await params.calendarProvider.findBookingByAppointmentId({
    calendarId: params.businessConfig.calendarId,
    appointmentId: params.appointmentId,
  });
  if (!booking) {
    return {
      response: { text: NO_BOOKING_FOUND_MESSAGE },
      state: withContext(params.state, { awaitingCancelAppointmentId: true, pendingCancelConfirmationId: undefined }),
    };
  }
  return askCancelConfirmation({ booking, businessConfig: params.businessConfig, state: params.state });
}

/**
 * Mirrors handleReschedulePreOffer's shape, plus one extra step: an
 * explicit "are you sure?" before the irreversible delete happens.
 * Reschedule doesn't need this (moving a booking is trivially undoable —
 * just move it again); cancellation isn't undoable at all, so the extra
 * confirmation earns its keep here specifically.
 *
 * `pendingCancelBookingId` is deliberately *not* covered by
 * `looksLikeFreshTopic`'s escape hatch (see handleMessageInner) — a bare
 * "cancel" reply to *this* question means "yes", not "let's talk about
 * something else", so this step needs full, uninterrupted control over
 * how its own yes/no is interpreted.
 */
async function handleCancelPreOffer(params: {
  context: ConciergeContext;
  text: string;
  businessConfig: BusinessConfig;
  calendarProvider: CalendarProvider;
  state: ConversationState;
}): Promise<ConciergeHandleMessageResult | undefined> {
  const { context, text, businessConfig, calendarProvider, state } = params;

  if (context.pendingCancelBookingId) {
    // Abort is checked before confirm, deliberately: a false "confirm"
    // permanently deletes a booking, a false "abort" just means asking
    // again — so on any ambiguity this must fail toward the safer outcome.
    // This is also what makes "don't cancel" safe despite containing the
    // literal word "cancel" (which confirmsCancellation alone would match).
    if (abortsCancellation(text)) {
      return {
        response: { text: "No problem — your appointment is still booked." },
        state: withContext(state, { pendingCancelBookingId: undefined }),
      };
    }
    if (confirmsCancellation(text)) {
      try {
        await calendarProvider.cancelBooking({ calendarId: businessConfig.calendarId, id: context.pendingCancelBookingId });
      } catch (err) {
        console.error("[agent-concierge] cancelBooking failed:", err);
        return { response: { text: CANCEL_FAILED_MESSAGE }, state: withContext(state, { pendingCancelBookingId: undefined }) };
      }
      return {
        response: { text: "Your appointment has been cancelled. Let us know if you'd like to book a new one." },
        state: withContext(state, { pendingCancelBookingId: undefined, lastAppointmentId: undefined }),
      };
    }
    return { response: { text: "Reply yes to confirm cancelling, or no to keep your appointment." }, state };
  }

  if (context.awaitingCancelAppointmentId) {
    const appointmentId = extractAppointmentId(text) ?? text.trim().toUpperCase();
    return lookupAndAskCancelConfirmation({ appointmentId, businessConfig, calendarProvider, state });
  }

  if (context.pendingCancelConfirmationId) {
    const suggested = context.pendingCancelConfirmationId;
    const typedId = extractAppointmentId(text);
    if (typedId) {
      return lookupAndAskCancelConfirmation({ appointmentId: typedId, businessConfig, calendarProvider, state });
    }
    if (isAffirmative(text)) {
      return lookupAndAskCancelConfirmation({ appointmentId: suggested, businessConfig, calendarProvider, state });
    }
    if (isNegative(text)) {
      return {
        response: { text: "No problem — what's your appointment ID?" },
        state: withContext(state, { awaitingCancelAppointmentId: true, pendingCancelConfirmationId: undefined }),
      };
    }
    return {
      response: { text: `Just to confirm — did you mean appointment ${suggested}? Reply yes or no, or send the correct appointment ID.` },
      state,
    };
  }

  if (!looksLikeCancelRequest(text)) return undefined;

  const typedId = extractAppointmentId(text);
  if (typedId) {
    return lookupAndAskCancelConfirmation({ appointmentId: typedId, businessConfig, calendarProvider, state });
  }

  if (context.lastAppointmentId) {
    return {
      response: { text: `Looks like you might mean ${context.lastAppointmentId} — is that the one? (yes/no, or send the correct appointment ID)` },
      state: withContext(state, { pendingCancelConfirmationId: context.lastAppointmentId }),
    };
  }

  return {
    response: { text: "Sure — what's your appointment ID? You'll find it in your original booking confirmation." },
    state: withContext(state, { awaitingCancelAppointmentId: true }),
  };
}

function escalate(
  state: ConversationState,
  message: NormalizedMessage,
  responseText: string
): ConciergeHandleMessageResult {
  return {
    response: { text: responseText },
    state: withContext(state, { lastEscalatedMessage: message.text }),
  };
}

const VOICE_NOTE_FAILED_MESSAGE = "Sorry, I couldn't process that voice note. Could you try typing your message instead?";

/**
 * A voice note has no `text` — only `media` with an audio item. Transcribing
 * it here (rather than at the channel/service layer) mirrors how
 * `agent-cook` already owns its own `visionAnalyze` call for photos: each
 * agent decides for itself which of `AIProvider`'s capabilities its inputs
 * need, rather than the channel/service layer needing to know per-agent
 * media-handling rules. Once transcribed, the resulting text flows through
 * the exact same pipeline as a typed message — including the free-text
 * slot-selection fallback, so "I'll take the second one" works whether
 * typed or spoken.
 */
class VoiceNoteTranscriptionError extends Error {}

async function resolveVoiceNote(message: NormalizedMessage, aiProvider: AIProvider): Promise<NormalizedMessage> {
  if (message.text) return message;
  const audio = message.media?.find((m) => m.type === "audio" && m.url);
  if (!audio?.url) return message;

  try {
    const transcription = await aiProvider.transcribeAudio({ audio: { url: audio.url } });
    return { ...message, text: transcription.text };
  } catch (err) {
    console.error("[agent-concierge] transcribeAudio failed:", err);
    throw new VoiceNoteTranscriptionError();
  }
}

async function handleMessageInner(input: ConciergeHandleMessageInput): Promise<ConciergeHandleMessageResult> {
  const { businessConfig, calendarProvider, aiProvider, faqBlueprint } = input;

  let message: NormalizedMessage;
  try {
    message = await resolveVoiceNote(input.message, aiProvider);
  } catch (err) {
    if (err instanceof VoiceNoteTranscriptionError) {
      return { response: { text: VOICE_NOTE_FAILED_MESSAGE }, state: input.state };
    }
    throw err;
  }

  const now = businessNow(businessConfig.timezone, input.now);
  const text = message.text ?? "";

  let state = input.state;
  let context = (state.context ?? {}) as ConciergeContext;

  // Escape hatch: don't trap the chatter forever in "awaiting your
  // appointment id" / "is that the one?" once they've clearly moved on to
  // something else. Clearing here (rather than deeper in
  // handleReschedulePreOffer/handleCancelPreOffer) means the rest of this
  // turn's dispatch below sees a clean context and processes the message
  // normally.
  const hasEscapableTrap =
    context.awaitingAppointmentId ||
    context.pendingRescheduleConfirmationId ||
    context.awaitingCancelAppointmentId ||
    context.pendingCancelConfirmationId;
  if (hasEscapableTrap && looksLikeFreshTopic(text, now)) {
    state = withContext(state, {
      awaitingAppointmentId: undefined,
      pendingRescheduleConfirmationId: undefined,
      awaitingCancelAppointmentId: undefined,
      pendingCancelConfirmationId: undefined,
    });
    context = state.context as ConciergeContext;
  }

  // pendingCancelBookingId gets its own, narrower escape check: a bare
  // "cancel" reply there means "yes, confirm" (see confirmsCancellation),
  // so it can't share looksLikeFreshTopic's generic "cancel" trigger.
  //
  // Priority is deliberately abort > fresh-topic > confirm, not "confirm
  // blocks everything else": confirmsCancellation matches on isAffirmative,
  // which (for the reschedule flow's lower-stakes use) treats a bare "can"
  // as a Singlish yes — so an ordinary sentence like "can I book a
  // different appointment" would otherwise satisfy confirmsCancellation
  // and never even reach this escape check, silently cancelling a booking
  // the chatter never asked to cancel. An explicit abort ("no", "don't
  // cancel") still wins over a fresh topic, so "no, don't cancel, and
  // book me something else" keeps the booking rather than guessing.
  if (context.pendingCancelBookingId && !abortsCancellation(text) && looksLikeFreshTopicExcludingBareCancel(text, now)) {
    state = withContext(state, { pendingCancelBookingId: undefined });
    context = state.context as ConciergeContext;
  }

  const pendingSelectionResult = await handlePendingSelection({
    context,
    message,
    businessConfig,
    calendarProvider,
    state,
    now,
  });
  if (pendingSelectionResult) return pendingSelectionResult;

  const rescheduleResult = await handleReschedulePreOffer({
    context,
    text,
    businessConfig,
    calendarProvider,
    state,
    now,
  });
  if (rescheduleResult) return rescheduleResult;

  const cancelResult = await handleCancelPreOffer({
    context,
    text,
    businessConfig,
    calendarProvider,
    state,
  });
  if (cancelResult) return cancelResult;

  const parsed = parseBookingRequest(text, now);
  const looksLikeBookingRequest = parsed.hasBookingIntent || parsed.date !== undefined || parsed.time !== undefined;

  if (looksLikeBookingRequest) {
    return handleBookingRequest({
      text,
      message,
      businessConfig,
      calendarProvider,
      state,
      now,
    });
  }

  const answer = await answerFaq(text, faqBlueprint, aiProvider);
  if (answer.escalate) {
    return escalate(state, message, answer.text);
  }
  return { response: { text: answer.text }, state: withContext(state, {}) };
}

/**
 * The blueprint's `ai_disclosure` is a compliance requirement, not a style
 * choice: the chatter must be told they're talking to an AI at the start of
 * every new conversation. Applied as a wrapper so every response path
 * (booking, FAQ, escalation) gets it exactly once per session, without each
 * branch needing to remember to do it itself.
 *
 * `aiDisclosed` is re-stamped onto the outgoing state on *every* turn once
 * set, not only the turn it's first set on — defense in depth alongside
 * `withContext`'s merge semantics, since this is a compliance requirement
 * where "silently regressed" is worse than "redundantly reapplied".
 */
function withAiDisclosure(
  input: ConciergeHandleMessageInput,
  result: ConciergeHandleMessageResult
): ConciergeHandleMessageResult {
  if (!input.faqBlueprint.ai_disclosure.required) return result;

  const alreadyDisclosed = Boolean((input.state.context as ConciergeContext | undefined)?.aiDisclosed);
  const context = { ...(result.state.context as ConciergeContext), aiDisclosed: true };

  if (alreadyDisclosed) {
    return { ...result, state: { ...result.state, context } };
  }

  const opening = input.faqBlueprint.ai_disclosure.opening_message;
  const priorText = result.response.text;
  return {
    response: {
      ...result.response,
      text: priorText ? `${opening}\n\n${priorText}` : opening,
    },
    state: { ...result.state, context },
  };
}

export async function handleMessage(input: ConciergeHandleMessageInput): Promise<ConciergeHandleMessageResult> {
  const result = await handleMessageInner(input);
  return withAiDisclosure(input, result);
}
