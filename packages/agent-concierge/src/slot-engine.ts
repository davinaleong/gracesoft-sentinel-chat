import type { Dayjs } from "dayjs";
import type { AvailabilitySlot, BusinessHours, CalendarProvider } from "@gracesoft-sentinel/core";
import { resolveDayHours, withTimeOfDay } from "./business-hours.js";
import { dayjs } from "./time.js";

export const DEFAULT_SLOT_DURATION_MINUTES = 30;
export const DEFAULT_SLOT_STEP_MINUTES = 30;
export const DEFAULT_HORIZON_DAYS = 14;
export const DEFAULT_SLOT_COUNT = 3;

function roundUpToStep(date: Dayjs, stepMinutes: number): Dayjs {
  const rounded = date.second(0).millisecond(0);
  const minutesSinceMidnight = rounded.hour() * 60 + rounded.minute();
  const remainder = minutesSinceMidnight % stepMinutes;
  if (remainder === 0) return rounded;
  return rounded.add(stepMinutes - remainder, "minute");
}

/**
 * Walks forward from `from`, day by day, generating slot-start candidates
 * that fall within business hours for each day — skipping non-business
 * days entirely (weekly closure or a dated exception). This is what makes
 * "next 3 slots" correctly roll over a public holiday to the following
 * open day instead of offering a slot on a closed date.
 */
export function generateCandidateSlotStarts(params: {
  businessHours: BusinessHours;
  from: Dayjs;
  slotDurationMinutes?: number;
  slotStepMinutes?: number;
  horizonDays?: number;
}): Dayjs[] {
  const slotDurationMinutes = params.slotDurationMinutes ?? DEFAULT_SLOT_DURATION_MINUTES;
  const slotStepMinutes = params.slotStepMinutes ?? DEFAULT_SLOT_STEP_MINUTES;
  const horizonDays = params.horizonDays ?? DEFAULT_HORIZON_DAYS;
  const candidates: Dayjs[] = [];

  for (let dayOffset = 0; dayOffset <= horizonDays; dayOffset++) {
    const day = params.from.add(dayOffset, "day").startOf("day");
    const hours = resolveDayHours(params.businessHours, day);
    if (!hours) continue;

    const open = withTimeOfDay(day, hours.open);
    const close = withTimeOfDay(day, hours.close);

    let slotStart = dayOffset === 0 ? roundUpToStep(params.from, slotStepMinutes) : open;
    if (slotStart.isBefore(open)) slotStart = open;

    while (!slotStart.add(slotDurationMinutes, "minute").isAfter(close)) {
      if (!slotStart.isBefore(params.from)) {
        candidates.push(slotStart);
      }
      slotStart = slotStart.add(slotStepMinutes, "minute");
    }
  }

  return candidates;
}

function isCoveredByWindow(start: Dayjs, end: Dayjs, windows: AvailabilitySlot[]): boolean {
  return windows.some((w) => !start.isBefore(dayjs(w.start)) && !end.isAfter(dayjs(w.end)));
}

export async function isSlotAvailable(params: {
  calendarProvider: CalendarProvider;
  calendarId: string;
  start: Dayjs;
  end: Dayjs;
  timezone: string;
}): Promise<boolean> {
  const windows = await params.calendarProvider.getAvailability({
    calendarId: params.calendarId,
    from: params.start.toISOString(),
    to: params.end.toISOString(),
    timezone: params.timezone,
  });
  return isCoveredByWindow(params.start, params.end, windows);
}

/**
 * The slot-recommendation engine: business-hours/day aware, correctly
 * rolls over excluded dates to the next open day, and only offers slots the
 * calendar provider actually reports as free.
 */
export async function findNextAvailableSlots(params: {
  calendarProvider: CalendarProvider;
  calendarId: string;
  businessHours: BusinessHours;
  timezone: string;
  from: Dayjs;
  count?: number;
  slotDurationMinutes?: number;
  horizonDays?: number;
}): Promise<AvailabilitySlot[]> {
  const slotDurationMinutes = params.slotDurationMinutes ?? DEFAULT_SLOT_DURATION_MINUTES;
  const count = params.count ?? DEFAULT_SLOT_COUNT;

  const candidates = generateCandidateSlotStarts({
    businessHours: params.businessHours,
    from: params.from,
    slotDurationMinutes,
    horizonDays: params.horizonDays,
  });
  if (candidates.length === 0) return [];

  const firstCandidate = candidates[0]!;
  const lastCandidate = candidates[candidates.length - 1]!;
  const freeWindows = await params.calendarProvider.getAvailability({
    calendarId: params.calendarId,
    from: firstCandidate.toISOString(),
    to: lastCandidate.add(slotDurationMinutes, "minute").toISOString(),
    timezone: params.timezone,
  });

  const result: AvailabilitySlot[] = [];
  for (const candidate of candidates) {
    const end = candidate.add(slotDurationMinutes, "minute");
    if (isCoveredByWindow(candidate, end, freeWindows)) {
      result.push({ start: candidate.toISOString(), end: end.toISOString() });
      if (result.length === count) break;
    }
  }
  return result;
}
