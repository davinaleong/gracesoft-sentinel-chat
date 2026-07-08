import type { AppInput, AppOutput } from "@sentinel/gateway-core";
import type { ConciergeSession } from "./types";
import { getAvailableSlots, createBooking, type CalendarConfig } from "./calendar";
import { parseDate, formatDate } from "./dateParser";
import { isPublicHoliday, isWeekend } from "./holidays";

const INTRO =
  `👋 Welcome to *Concierge*!\n\n` +
  `I can help you book an appointment.\n\n` +
  `What date would you like? You can say:\n` +
  `• *tomorrow*\n` +
  `• *next Monday*\n` +
  `• *15 July* or *2026-07-15*\n\n` +
  `(Mon–Fri only, excluding public holidays)`;

const INVALID_DATE =
  `I couldn't understand that date. Please try:\n` +
  `• *tomorrow* / *next Monday*\n` +
  `• *15 July* or *2026-07-15*`;

const NOT_AVAILABLE =
  `Sorry, there are no available slots on that date.\n` +
  `It may be a public holiday, weekend, or fully booked.\n\n` +
  `Please try another date.`;

const INVALID_SLOT = `Please reply with the *number* of the slot you'd like (e.g. *1*).`;

export async function handleConcierge(
  input: AppInput<ConciergeSession>,
  calendarConfig: CalendarConfig
): Promise<AppOutput<ConciergeSession>> {
  const { text, from, session } = input;

  // ── First call (session === null) ──────────────────────────────────────
  if (session === null) {
    return {
      reply: INTRO,
      session: { step: "awaiting_date" },
      status: "active",
    };
  }

  const t = (text ?? "").trim();

  // ── Step: awaiting_date ────────────────────────────────────────────────
  if (session.step === "awaiting_date") {
    const isoDate = parseDate(t);

    if (!isoDate) {
      return { reply: INVALID_DATE, session, status: "active" };
    }

    // Reject weekends and public holidays immediately (before API call)
    const date = new Date(isoDate + "T00:00:00+08:00");
    if (isWeekend(date) || isPublicHoliday(isoDate)) {
      return {
        reply:
          `${formatDate(isoDate)} is a weekend or public holiday. ` +
          `Please choose a weekday.`,
        session,
        status: "active",
      };
    }

    // Reject dates in the past
    const today = new Date();
    const todayIso = today.toLocaleDateString("en-CA", {
      timeZone: "Asia/Singapore",
    });
    if (isoDate < todayIso) {
      return {
        reply: `That date has passed. Please choose a future date.`,
        session,
        status: "active",
      };
    }

    const slots = await getAvailableSlots(isoDate, calendarConfig);

    if (slots.length === 0) {
      return { reply: NOT_AVAILABLE, session, status: "active" };
    }

    const slotList = slots
      .map((s, i) => `  ${i + 1}. ${s}`)
      .join("\n");

    return {
      reply:
        `Available slots on *${formatDate(isoDate)}*:\n\n` +
        `${slotList}\n\n` +
        `Reply with the number of your preferred slot.`,
      session: {
        step: "awaiting_time",
        date: isoDate,
        availableSlots: slots,
      },
      status: "active",
    };
  }

  // ── Step: awaiting_time ────────────────────────────────────────────────
  if (session.step === "awaiting_time") {
    const slots = session.availableSlots ?? [];
    const idx = parseInt(t, 10) - 1;

    if (isNaN(idx) || idx < 0 || idx >= slots.length) {
      const slotList = slots.map((s, i) => `  ${i + 1}. ${s}`).join("\n");
      return {
        reply: `${INVALID_SLOT}\n\nAvailable slots:\n${slotList}`,
        session,
        status: "active",
      };
    }

    const slot = slots[idx];

    return {
      reply:
        `You've selected *${slot}* on *${formatDate(session.date!)}*.\n\n` +
        `Shall I confirm this booking? Reply *yes* or *no*.`,
      session: {
        step: "confirming",
        date: session.date,
        availableSlots: slots,
        selectedSlot: slot,
      },
      status: "active",
    };
  }

  // ── Step: confirming ───────────────────────────────────────────────────
  if (session.step === "confirming") {
    const answer = t.toLowerCase();

    if (answer === "no" || answer === "n") {
      return {
        reply: `No problem! What date would you like instead?`,
        session: { step: "awaiting_date" },
        status: "active",
      };
    }

    if (answer !== "yes" && answer !== "y") {
      return {
        reply: `Please reply *yes* to confirm or *no* to choose a different time.`,
        session,
        status: "active",
      };
    }

    // Create the booking
    try {
      const result = await createBooking(
        session.date!,
        session.selectedSlot!,
        from,
        calendarConfig
      );

      return {
        reply:
          `✅ *Appointment confirmed!*\n\n` +
          `📅 ${formatDate(session.date!)} at ${session.selectedSlot}\n` +
          `🔖 Reference: *${result.reference}*\n\n` +
          `See you then! 👋`,
        session: null,
        status: "done",
      };
    } catch (err) {
      console.error("[concierge] Failed to create booking:", err);
      return {
        reply:
          `Sorry, I couldn't create the booking right now. ` +
          `Please try again in a moment.`,
        session,
        status: "active",
      };
    }
  }

  // Fallback (should not happen)
  return { reply: INTRO, session: { step: "awaiting_date" }, status: "active" };
}
