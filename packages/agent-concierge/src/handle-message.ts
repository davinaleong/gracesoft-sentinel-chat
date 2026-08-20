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
import { businessNow, dayjs } from "./time.js";

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
  promptText: string
): ConciergeHandleMessageResult {
  const candidates = toBookingCandidates(slots);
  return {
    response: {
      text: promptText,
      quickReplies: candidates.map((c) => ({ id: c.id, label: formatSlotLabel(c.start, timezone) })),
    },
    state: withContext(state, { bookingCandidates: candidates }),
  };
}

const BOOKING_FAILED_MESSAGE =
  "Sorry, I couldn't complete that booking right now — please try again in a moment, or let us know if it keeps happening.";
const DAILY_LIMIT_MESSAGE =
  "You've reached today's booking limit for new appointments — please contact us directly if this is urgent, or try again tomorrow.";
const NO_BOOKING_FOUND_MESSAGE = "I couldn't find a booking with that appointment ID — could you double-check it?";

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
    return { response: { text: DAILY_LIMIT_MESSAGE }, state: withContext(params.state, { bookingCandidates: undefined }) };
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
    return { response: { text: BOOKING_FAILED_MESSAGE }, state: withContext(params.state, { bookingCandidates: undefined }) };
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
      from: dayjs(lastCandidate.end),
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
    });
    return offerSlotsResponse(slots, businessConfig.timezone, state, "That slot isn't available. Here are the next options:");
  }

  if (parsed.date && !parsed.time) {
    const from = dayjs.tz(parsed.date, businessConfig.timezone).startOf("day");
    const slots = await findNextAvailableSlots({
      calendarProvider,
      calendarId: businessConfig.calendarId,
      businessHours,
      timezone: businessConfig.timezone,
      from,
    });
    return offerSlotsResponse(slots, businessConfig.timezone, state, "Here are the next available slots on or after that date:");
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
      });
      return offerSlotsResponse(slots, businessConfig.timezone, state, "That time isn't available today. Here are the next options:");
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
    });
    return offerSlotsResponse(slots, businessConfig.timezone, state, "That's outside our hours. Here are the next available slots:");
  }

  const slots = await findNextAvailableSlots({
    calendarProvider,
    calendarId: businessConfig.calendarId,
    businessHours,
    timezone: businessConfig.timezone,
    from: now,
  });
  return offerSlotsResponse(slots, businessConfig.timezone, state, "Here are the next available slots:");
}

const RESCHEDULE_INTENT_PATTERN =
  /\b(reschedul\w*|change my (?:appointment|booking)|move my (?:appointment|booking)|different time for my (?:appointment|booking)|change (?:the )?time of my (?:appointment|booking))\b/i;

function looksLikeRescheduleRequest(text: string): boolean {
  return RESCHEDULE_INTENT_PATTERN.test(text);
}

/** Offers 3 new slots for an already-located booking; the current slot is never among them since the calendar itself already shows it as busy. */
async function offerRescheduleSlots(params: {
  booking: Booking;
  businessConfig: BusinessConfig;
  calendarProvider: CalendarProvider;
  state: ConversationState;
  now: Dayjs;
}): Promise<ConciergeHandleMessageResult> {
  const slots = await findNextAvailableSlots({
    calendarProvider: params.calendarProvider,
    calendarId: params.businessConfig.calendarId,
    businessHours: params.businessConfig.businessHours,
    timezone: params.businessConfig.timezone,
    from: params.now,
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
      text: `Sure — here are some other times for ${params.booking.appointmentId}:`,
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

async function lookupAndOfferReschedule(params: {
  appointmentId: string;
  businessConfig: BusinessConfig;
  calendarProvider: CalendarProvider;
  state: ConversationState;
  now: Dayjs;
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

  if (context.awaitingAppointmentId) {
    const appointmentId = extractAppointmentId(text) ?? text.trim().toUpperCase();
    return lookupAndOfferReschedule({ appointmentId, businessConfig, calendarProvider, state, now });
  }

  if (context.pendingRescheduleConfirmationId) {
    const suggested = context.pendingRescheduleConfirmationId;
    const typedId = extractAppointmentId(text);
    if (typedId) {
      return lookupAndOfferReschedule({ appointmentId: typedId, businessConfig, calendarProvider, state, now });
    }
    if (isAffirmative(text)) {
      return lookupAndOfferReschedule({ appointmentId: suggested, businessConfig, calendarProvider, state, now });
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
    return lookupAndOfferReschedule({ appointmentId: typedId, businessConfig, calendarProvider, state, now });
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
  const context = (input.state.context ?? {}) as ConciergeContext;

  const pendingSelectionResult = await handlePendingSelection({
    context,
    message,
    businessConfig,
    calendarProvider,
    state: input.state,
    now,
  });
  if (pendingSelectionResult) return pendingSelectionResult;

  const text = message.text ?? "";

  const rescheduleResult = await handleReschedulePreOffer({
    context,
    text,
    businessConfig,
    calendarProvider,
    state: input.state,
    now,
  });
  if (rescheduleResult) return rescheduleResult;

  const parsed = parseBookingRequest(text, now);
  const looksLikeBookingRequest = parsed.hasBookingIntent || parsed.date !== undefined || parsed.time !== undefined;

  if (looksLikeBookingRequest) {
    return handleBookingRequest({
      text,
      message,
      businessConfig,
      calendarProvider,
      state: input.state,
      now,
    });
  }

  const answer = await answerFaq(text, faqBlueprint, aiProvider);
  if (answer.escalate) {
    return escalate(input.state, message, answer.text);
  }
  return { response: { text: answer.text }, state: withContext(input.state, {}) };
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
