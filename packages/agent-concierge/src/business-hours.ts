import type { Dayjs } from "dayjs";
import type { BusinessHours, DayHours, Weekday } from "@gracesoft-sentinel/core";

const WEEKDAY_BY_DAYJS_INDEX: Weekday[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export function weekdayOf(date: Dayjs): Weekday {
  return WEEKDAY_BY_DAYJS_INDEX[date.day()]!;
}

/**
 * Resolves a date to its opening hours, `null` if closed. Dated exceptions
 * always win over the weekly map — this is the mechanism that fixes the
 * "2 May excluded" bug: the weekly map is never mutated, an exception is
 * just consulted first.
 */
export function resolveDayHours(businessHours: BusinessHours, date: Dayjs): DayHours | null {
  const dateStr = date.format("YYYY-MM-DD");
  const exception = businessHours.exceptions.find((e) => e.date === dateStr);
  if (exception) {
    return exception.hours;
  }
  return businessHours.weekly[weekdayOf(date)] ?? null;
}

/** Parses "HH:mm" against a reference date, in that date's local wall-clock time. */
export function withTimeOfDay(date: Dayjs, hhmm: string): Dayjs {
  const [hours, minutes] = hhmm.split(":").map(Number);
  return date.hour(hours ?? 0).minute(minutes ?? 0).second(0).millisecond(0);
}

export function isWithinHours(date: Dayjs, hours: DayHours): boolean {
  const open = withTimeOfDay(date, hours.open);
  const close = withTimeOfDay(date, hours.close);
  return !date.isBefore(open) && !date.isAfter(close);
}
