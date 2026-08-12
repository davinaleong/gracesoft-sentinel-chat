import type {
  BusinessConfig,
  CalendarProvider,
  ConversationState,
  NormalizedMessage,
  NormalizedResponse,
} from "@gracesoft-sentinel/core";
import { resolveDayHours, isWithinHours } from "./business-hours.js";
import { parseBookingRequest } from "./booking-intent.js";
import {
  formatSlotLabel,
  isRejectingCandidates,
  resolveSlotSelection,
  toBookingCandidates,
  type ConciergeContext,
} from "./booking-state.js";
import type { FaqEntry } from "./faq-matcher.js";
import { matchFaq } from "./faq-matcher.js";
import { DEFAULT_SLOT_DURATION_MINUTES, findNextAvailableSlots, isSlotAvailable } from "./slot-engine.js";
import { businessNow, dayjs } from "./time.js";

export interface ConciergeHandleMessageInput {
  message: NormalizedMessage;
  state: ConversationState;
  businessConfig: BusinessConfig;
  calendarProvider: CalendarProvider;
  faqBlueprint: FaqEntry[];
  /** Injection point for deterministic tests; defaults to the real clock. */
  now?: Date;
}

export interface ConciergeHandleMessageResult {
  response: NormalizedResponse;
  state: ConversationState;
}

function withContext(state: ConversationState, context: ConciergeContext): ConversationState {
  return { ...state, context, updatedAt: new Date().toISOString() };
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

async function confirmBooking(params: {
  calendarProvider: CalendarProvider;
  businessConfig: BusinessConfig;
  message: NormalizedMessage;
  start: string;
  end: string;
  state: ConversationState;
}): Promise<ConciergeHandleMessageResult> {
  const booking = await params.calendarProvider.createBooking({
    calendarId: params.businessConfig.calendarId,
    start: params.start,
    end: params.end,
    timezone: params.businessConfig.timezone,
    summary: `Booking via ${params.message.channel}`,
    attendee: { contact: params.message.senderId },
  });

  const label = formatSlotLabel(booking.start, params.businessConfig.timezone);
  return {
    response: { text: `You're booked for ${label}. See you then!` },
    state: withContext(params.state, {}),
  };
}

async function handlePendingSelection(params: {
  context: ConciergeContext;
  message: NormalizedMessage;
  businessConfig: BusinessConfig;
  calendarProvider: CalendarProvider;
  state: ConversationState;
}): Promise<ConciergeHandleMessageResult | undefined> {
  const candidates = params.context.bookingCandidates;
  if (!candidates || candidates.length === 0) return undefined;

  const selected = resolveSlotSelection({
    candidates,
    quickReplyId: params.message.quickReplyId,
    text: params.message.text,
  });
  if (selected) {
    return confirmBooking({
      calendarProvider: params.calendarProvider,
      businessConfig: params.businessConfig,
      message: params.message,
      start: selected.start,
      end: selected.end,
      state: params.state,
    });
  }

  if (params.message.text && isRejectingCandidates(params.message.text)) {
    return {
      response: { text: "No worries — what date or time would suit you better?" },
      state: withContext(params.state, {}),
    };
  }

  return undefined;
}

async function handleBookingRequest(params: {
  text: string;
  message: NormalizedMessage;
  businessConfig: BusinessConfig;
  calendarProvider: CalendarProvider;
  state: ConversationState;
  now: ReturnType<typeof businessNow>;
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
      return confirmBooking({
        calendarProvider,
        businessConfig,
        message: params.message,
        start: start.toISOString(),
        end: end.toISOString(),
        state,
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
        return confirmBooking({
          calendarProvider,
          businessConfig,
          message: params.message,
          start: todayAtRequestedTime.toISOString(),
          end: end.toISOString(),
          state,
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

function escalate(state: ConversationState, message: NormalizedMessage): ConciergeHandleMessageResult {
  return {
    response: { text: "Let me get one of our team to help with that — they'll follow up shortly." },
    state: withContext(state, { lastEscalatedMessage: message.text }),
  };
}

export async function handleMessage(input: ConciergeHandleMessageInput): Promise<ConciergeHandleMessageResult> {
  const { message, businessConfig, calendarProvider, faqBlueprint } = input;
  const now = businessNow(businessConfig.timezone, input.now);
  const context = (input.state.context ?? {}) as ConciergeContext;

  const pendingSelectionResult = await handlePendingSelection({
    context,
    message,
    businessConfig,
    calendarProvider,
    state: input.state,
  });
  if (pendingSelectionResult) return pendingSelectionResult;

  const text = message.text ?? "";
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

  const match = matchFaq(text, faqBlueprint);
  if (match) {
    return { response: { text: match.entry.answer }, state: withContext(input.state, context) };
  }

  return escalate(input.state, message);
}
