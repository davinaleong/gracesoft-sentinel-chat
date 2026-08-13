import { describe, expect, it } from "vitest";
import type { ConversationState, NormalizedMessage } from "@gracesoft-sentinel/core";
import { handleMessage } from "./handle-message.js";
import { formatSlotLabel } from "./booking-state.js";
import {
  calendarWithBusyWindows,
  fakeAiProviderAnswering,
  fullyAvailableCalendarProvider,
  TEST_BUSINESS_CONFIG,
  TEST_FAQ_BLUEPRINT,
} from "./test-support.js";
import { dayjs } from "./time.js";
import type { ConciergeContext } from "./booking-state.js";

// Friday 2026-05-01, 10:00 Asia/Singapore (business hours: Mon-Fri 09:00-18:00,
// Sat 09:00-13:00, Sun closed, with 2 May carved out as a holiday exception).
const NOW = dayjs.tz("2026-05-01T10:00:00", "Asia/Singapore").toDate();

const OPENING_MESSAGE = TEST_FAQ_BLUEPRINT.ai_disclosure.opening_message;

function makeMessage(overrides: Partial<NormalizedMessage> = {}): NormalizedMessage {
  return {
    id: "msg-1",
    channel: "whatsapp",
    senderId: "client-1",
    timestamp: NOW.toISOString(),
    raw: {},
    ...overrides,
  };
}

/** Fresh session: the AI disclosure has not been given yet. */
function makeState(context: Record<string, unknown> = {}): ConversationState {
  return {
    sessionId: "session-1",
    channel: "whatsapp",
    userId: "client-1",
    agent: "concierge",
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    context,
  };
}

/** A session where the AI disclosure has already been given, for tests that don't care about it. */
function makeDisclosedState(context: Record<string, unknown> = {}): ConversationState {
  return makeState({ ...context, aiDisclosed: true });
}

describe("handleMessage — no date/time given", () => {
  it("returns the next 3 available slots", async () => {
    const result = await handleMessage({
      message: makeMessage({ text: "I'd like to book something" }),
      state: makeDisclosedState(),
      businessConfig: TEST_BUSINESS_CONFIG,
      calendarProvider: fullyAvailableCalendarProvider(),
      aiProvider: fakeAiProviderAnswering("unused"),
      faqBlueprint: TEST_FAQ_BLUEPRINT,
      now: NOW,
    });
    expect(result.response.quickReplies).toHaveLength(3);
    expect((result.state.context as ConciergeContext).bookingCandidates).toHaveLength(3);
  });

  it("creates a booking for the correct slot when the client picks slot 2", async () => {
    const calendarProvider = fullyAvailableCalendarProvider();
    const aiProvider = fakeAiProviderAnswering("unused");
    const first = await handleMessage({
      message: makeMessage({ text: "book something" }),
      state: makeDisclosedState(),
      businessConfig: TEST_BUSINESS_CONFIG,
      calendarProvider,
      aiProvider,
      faqBlueprint: TEST_FAQ_BLUEPRINT,
      now: NOW,
    });
    const slot2 = (first.state.context as ConciergeContext).bookingCandidates![1]!;

    const second = await handleMessage({
      message: makeMessage({ quickReplyId: "slot-2" }),
      state: first.state,
      businessConfig: TEST_BUSINESS_CONFIG,
      calendarProvider,
      aiProvider,
      faqBlueprint: TEST_FAQ_BLUEPRINT,
      now: NOW,
    });

    expect(second.response.text).toMatch(/you're booked/i);
    expect(calendarProvider.createBookingCalls).toHaveLength(1);
    expect(calendarProvider.createBookingCalls[0]!.start).toBe(slot2.start);
  });

  it("falls through to a re-prompt when the client rejects all 3 offered slots", async () => {
    const calendarProvider = fullyAvailableCalendarProvider();
    const aiProvider = fakeAiProviderAnswering("unused");
    const first = await handleMessage({
      message: makeMessage({ text: "book something" }),
      state: makeDisclosedState(),
      businessConfig: TEST_BUSINESS_CONFIG,
      calendarProvider,
      aiProvider,
      faqBlueprint: TEST_FAQ_BLUEPRINT,
      now: NOW,
    });

    const second = await handleMessage({
      message: makeMessage({ text: "none of those work for me" }),
      state: first.state,
      businessConfig: TEST_BUSINESS_CONFIG,
      calendarProvider,
      aiProvider,
      faqBlueprint: TEST_FAQ_BLUEPRINT,
      now: NOW,
    });

    expect(second.response.text).toMatch(/what date or time would suit you better/i);
    expect(calendarProvider.createBookingCalls).toHaveLength(0);
    expect((second.state.context as ConciergeContext).bookingCandidates).toBeUndefined();
  });
});

describe("handleMessage — date + time given", () => {
  it("creates a booking directly when the slot is available", async () => {
    const calendarProvider = fullyAvailableCalendarProvider();
    const result = await handleMessage({
      message: makeMessage({ text: "book for 4 May at 11am" }),
      state: makeDisclosedState(),
      businessConfig: TEST_BUSINESS_CONFIG,
      calendarProvider,
      aiProvider: fakeAiProviderAnswering("unused"),
      faqBlueprint: TEST_FAQ_BLUEPRINT,
      now: NOW,
    });

    expect(result.response.text).toMatch(/you're booked/i);
    expect(calendarProvider.createBookingCalls).toHaveLength(1);
    expect(calendarProvider.createBookingCalls[0]!.start).toBe(
      dayjs.tz("2026-05-04 11:00", "Asia/Singapore").toISOString()
    );
  });

  it("returns the next 3 available slots when the requested slot is unavailable", async () => {
    const requestedStart = dayjs.tz("2026-05-04 11:00", "Asia/Singapore");
    const calendarProvider = calendarWithBusyWindows([
      { start: requestedStart.toISOString(), end: requestedStart.add(30, "minute").toISOString() },
    ]);
    const result = await handleMessage({
      message: makeMessage({ text: "book for 4 May at 11am" }),
      state: makeDisclosedState(),
      businessConfig: TEST_BUSINESS_CONFIG,
      calendarProvider,
      aiProvider: fakeAiProviderAnswering("unused"),
      faqBlueprint: TEST_FAQ_BLUEPRINT,
      now: NOW,
    });

    expect(result.response.text).toMatch(/isn't available/i);
    expect(result.response.quickReplies).toHaveLength(3);
    expect(calendarProvider.createBookingCalls).toHaveLength(0);
  });
});

describe("handleMessage — date only given", () => {
  it("returns the next 3 slots on or after that date", async () => {
    const result = await handleMessage({
      message: makeMessage({ text: "book for 4 May" }),
      state: makeDisclosedState(),
      businessConfig: TEST_BUSINESS_CONFIG,
      calendarProvider: fullyAvailableCalendarProvider(),
      aiProvider: fakeAiProviderAnswering("unused"),
      faqBlueprint: TEST_FAQ_BLUEPRINT,
      now: NOW,
    });

    expect(result.response.quickReplies).toHaveLength(3);
    const context = result.state.context as ConciergeContext;
    expect(context.bookingCandidates![0]!.start).toBe(dayjs.tz("2026-05-04 09:00", "Asia/Singapore").toISOString());
  });
});

describe("handleMessage — time only given", () => {
  it("within office hours: assumes today and books directly if available", async () => {
    const result = await handleMessage({
      message: makeMessage({ text: "book at 11am" }),
      state: makeDisclosedState(),
      businessConfig: TEST_BUSINESS_CONFIG,
      calendarProvider: fullyAvailableCalendarProvider(),
      aiProvider: fakeAiProviderAnswering("unused"),
      faqBlueprint: TEST_FAQ_BLUEPRINT,
      now: NOW,
    });

    expect(result.response.text).toMatch(/you're booked/i);
  });

  it("today unavailable at that time: rolls over to the next business day", async () => {
    // Block out the rest of today from NOW to close.
    const closeToday = dayjs.tz("2026-05-01 18:00", "Asia/Singapore");
    const calendarProvider = calendarWithBusyWindows([
      { start: dayjs(NOW).toISOString(), end: closeToday.toISOString() },
    ]);
    const result = await handleMessage({
      message: makeMessage({ text: "book at 10:30am" }),
      state: makeDisclosedState(),
      businessConfig: TEST_BUSINESS_CONFIG,
      calendarProvider,
      aiProvider: fakeAiProviderAnswering("unused"),
      faqBlueprint: TEST_FAQ_BLUEPRINT,
      now: NOW,
    });

    expect(result.response.text).toMatch(/isn't available today/i);
    const context = result.state.context as ConciergeContext;
    // 2 May (Sat) is a holiday exception and 3 May (Sun) is closed weekly —
    // rollover must land on 4 May, not either of those.
    expect(context.bookingCandidates![0]!.start).toBe(dayjs.tz("2026-05-04 09:00", "Asia/Singapore").toISOString());
  });

  it("outside office hours: goes straight to next-day slots, no same-day assumption", async () => {
    const result = await handleMessage({
      message: makeMessage({ text: "book at 8pm" }),
      state: makeDisclosedState(),
      businessConfig: TEST_BUSINESS_CONFIG,
      calendarProvider: fullyAvailableCalendarProvider(),
      aiProvider: fakeAiProviderAnswering("unused"),
      faqBlueprint: TEST_FAQ_BLUEPRINT,
      now: NOW,
    });

    expect(result.response.text).toMatch(/outside our hours/i);
    const context = result.state.context as ConciergeContext;
    expect(context.bookingCandidates![0]!.start).toBe(dayjs.tz("2026-05-04 09:00", "Asia/Singapore").toISOString());
  });
});

describe("handleMessage — regression: business-hours map excludes non-business days", () => {
  it("'this Saturday' (2 May, a holiday exception) rolls over correctly to 4 May", async () => {
    const result = await handleMessage({
      message: makeMessage({ text: "Can I make a booking for this Saturday?" }),
      state: makeDisclosedState(),
      businessConfig: TEST_BUSINESS_CONFIG,
      calendarProvider: fullyAvailableCalendarProvider(),
      aiProvider: fakeAiProviderAnswering("unused"),
      faqBlueprint: TEST_FAQ_BLUEPRINT,
      now: NOW,
    });

    const context = result.state.context as ConciergeContext;
    const firstOffered = dayjs(context.bookingCandidates![0]!.start).tz("Asia/Singapore");
    expect(firstOffered.format("YYYY-MM-DD")).toBe("2026-05-04");
  });
});

describe("handleMessage — timezone & formatting consistency", () => {
  it("creates the booking in the business's configured timezone regardless of phrasing", async () => {
    const calendarProvider = fullyAvailableCalendarProvider();
    await handleMessage({
      message: makeMessage({ text: "book for 4 May at 11am" }),
      state: makeDisclosedState(),
      businessConfig: TEST_BUSINESS_CONFIG,
      calendarProvider,
      aiProvider: fakeAiProviderAnswering("unused"),
      faqBlueprint: TEST_FAQ_BLUEPRINT,
      now: NOW,
    });
    expect(calendarProvider.createBookingCalls[0]!.timezone).toBe("Asia/Singapore");
  });

  it("the slot label shown at offer time matches the exact instant booked at confirmation time", async () => {
    const calendarProvider = fullyAvailableCalendarProvider();
    const aiProvider = fakeAiProviderAnswering("unused");
    const first = await handleMessage({
      message: makeMessage({ text: "book something" }),
      state: makeDisclosedState(),
      businessConfig: TEST_BUSINESS_CONFIG,
      calendarProvider,
      aiProvider,
      faqBlueprint: TEST_FAQ_BLUEPRINT,
      now: NOW,
    });
    const offeredLabel = first.response.quickReplies![1]!.label;
    const candidate = (first.state.context as ConciergeContext).bookingCandidates![1]!;
    expect(offeredLabel).toBe(formatSlotLabel(candidate.start, TEST_BUSINESS_CONFIG.timezone));

    const second = await handleMessage({
      message: makeMessage({ quickReplyId: "slot-2" }),
      state: first.state,
      businessConfig: TEST_BUSINESS_CONFIG,
      calendarProvider,
      aiProvider,
      faqBlueprint: TEST_FAQ_BLUEPRINT,
      now: NOW,
    });
    expect(calendarProvider.createBookingCalls[0]!.start).toBe(candidate.start);
    expect(second.response.text).toContain(formatSlotLabel(candidate.start, TEST_BUSINESS_CONFIG.timezone));
  });
});

describe("handleMessage — FAQ logic", () => {
  it("returns the model's grounded answer for a known question", async () => {
    const answerText = "We're open Monday to Friday 9am-6pm and Saturday 9am-1pm.";
    const result = await handleMessage({
      message: makeMessage({ text: "What are your opening hours?" }),
      state: makeDisclosedState(),
      businessConfig: TEST_BUSINESS_CONFIG,
      calendarProvider: fullyAvailableCalendarProvider(),
      aiProvider: fakeAiProviderAnswering(answerText, false),
      faqBlueprint: TEST_FAQ_BLUEPRINT,
      now: NOW,
    });
    expect(result.response.text).toBe(answerText);
  });

  it("escalates rather than guessing when the model has no confident answer", async () => {
    const handoff = TEST_FAQ_BLUEPRINT.escalation_policy.example_handoff_response;
    const result = await handleMessage({
      message: makeMessage({ text: "Do you sell coffee?" }),
      state: makeDisclosedState(),
      businessConfig: TEST_BUSINESS_CONFIG,
      calendarProvider: fullyAvailableCalendarProvider(),
      aiProvider: fakeAiProviderAnswering(handoff, true),
      faqBlueprint: TEST_FAQ_BLUEPRINT,
      now: NOW,
    });
    expect(result.response.text).toBe(handoff);
  });

  it("escalates rather than returning a shaky low-confidence answer", async () => {
    const handoff = TEST_FAQ_BLUEPRINT.escalation_policy.example_handoff_response;
    const result = await handleMessage({
      message: makeMessage({ text: "hi there" }),
      state: makeDisclosedState(),
      businessConfig: TEST_BUSINESS_CONFIG,
      calendarProvider: fullyAvailableCalendarProvider(),
      aiProvider: fakeAiProviderAnswering(handoff, true),
      faqBlueprint: TEST_FAQ_BLUEPRINT,
      now: NOW,
    });
    expect(result.response.text).toBe(handoff);
  });

  it("escalation preserves conversation context so the client doesn't repeat themselves", async () => {
    const result = await handleMessage({
      message: makeMessage({ text: "Do you sell coffee?" }),
      state: makeDisclosedState(),
      businessConfig: TEST_BUSINESS_CONFIG,
      calendarProvider: fullyAvailableCalendarProvider(),
      aiProvider: fakeAiProviderAnswering("handoff message", true),
      faqBlueprint: TEST_FAQ_BLUEPRINT,
      now: NOW,
    });
    expect((result.state.context as ConciergeContext).lastEscalatedMessage).toBe("Do you sell coffee?");
  });
});

describe("handleMessage — AI disclosure", () => {
  it("prepends the disclosure to the very first response of a new conversation", async () => {
    const result = await handleMessage({
      message: makeMessage({ text: "What are your opening hours?" }),
      state: makeState(), // fresh session, not yet disclosed
      businessConfig: TEST_BUSINESS_CONFIG,
      calendarProvider: fullyAvailableCalendarProvider(),
      aiProvider: fakeAiProviderAnswering("We're open weekdays.", false),
      faqBlueprint: TEST_FAQ_BLUEPRINT,
      now: NOW,
    });
    expect(result.response.text).toBe(`${OPENING_MESSAGE}\n\nWe're open weekdays.`);
    expect((result.state.context as ConciergeContext).aiDisclosed).toBe(true);
  });

  it("applies to the booking path too, since it's the start of the conversation regardless of intent", async () => {
    const result = await handleMessage({
      message: makeMessage({ text: "book something" }),
      state: makeState(),
      businessConfig: TEST_BUSINESS_CONFIG,
      calendarProvider: fullyAvailableCalendarProvider(),
      aiProvider: fakeAiProviderAnswering("unused"),
      faqBlueprint: TEST_FAQ_BLUEPRINT,
      now: NOW,
    });
    expect(result.response.text?.startsWith(OPENING_MESSAGE)).toBe(true);
    // The booking flow's own state (candidates) must still survive alongside the disclosure flag.
    expect((result.state.context as ConciergeContext).bookingCandidates).toHaveLength(3);
  });

  it("does not repeat the disclosure on a later turn in the same session", async () => {
    const calendarProvider = fullyAvailableCalendarProvider();
    const aiProvider = fakeAiProviderAnswering("We're open weekdays.", false);
    const first = await handleMessage({
      message: makeMessage({ text: "What are your opening hours?" }),
      state: makeState(),
      businessConfig: TEST_BUSINESS_CONFIG,
      calendarProvider,
      aiProvider,
      faqBlueprint: TEST_FAQ_BLUEPRINT,
      now: NOW,
    });

    const second = await handleMessage({
      message: makeMessage({ text: "And your location?" }),
      state: first.state,
      businessConfig: TEST_BUSINESS_CONFIG,
      calendarProvider,
      aiProvider,
      faqBlueprint: TEST_FAQ_BLUEPRINT,
      now: NOW,
    });

    expect(second.response.text).not.toContain(OPENING_MESSAGE);
  });
});
