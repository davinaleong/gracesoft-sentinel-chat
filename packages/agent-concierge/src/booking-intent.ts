import type { Dayjs } from "dayjs";

const BOOKING_INTENT_PATTERN = /\b(book|booking|appt|appointment|reserve|reservation|slot)\b/i;

const WEEKDAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

const MONTH_NAMES = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

export interface ParsedBookingRequest {
  hasBookingIntent: boolean;
  /** "YYYY-MM-DD", if a date was mentioned or implied (e.g. "today"). */
  date?: string;
  /** "HH:mm" 24h, if a time was mentioned. */
  time?: string;
}

function parseExplicitDate(text: string, now: Dayjs): string | undefined {
  const monthPattern = MONTH_NAMES.map((m) => m.slice(0, 3)).join("|");
  // A trailing 4-digit year is optional and, when present, pins the date
  // exactly rather than leaving it to the "roll forward" inference below —
  // "4 Jan 2028" must mean 2028 even though the nearest upcoming 4 Jan
  // (this year or next) might be a different year entirely.
  const yearSuffix = `(?:,?\\s+(\\d{4}))?`;

  const dayThenMonth = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${monthPattern})[a-z]*${yearSuffix}\\b`, "i");
  const monthThenDay = new RegExp(`\\b(${monthPattern})[a-z]*\\s+(\\d{1,2})(?:st|nd|rd|th)?${yearSuffix}\\b`, "i");

  let day: number | undefined;
  let monthAbbr: string | undefined;
  let year: number | undefined;

  const m1 = text.match(dayThenMonth);
  if (m1) {
    day = Number(m1[1]);
    monthAbbr = m1[2]!.toLowerCase();
    year = m1[3] ? Number(m1[3]) : undefined;
  } else {
    const m2 = text.match(monthThenDay);
    if (m2) {
      monthAbbr = m2[1]!.toLowerCase();
      day = Number(m2[2]);
      year = m2[3] ? Number(m2[3]) : undefined;
    }
  }

  if (day === undefined || monthAbbr === undefined) return undefined;

  const monthIndex = MONTH_NAMES.findIndex((m) => m.startsWith(monthAbbr));
  if (monthIndex === -1) return undefined;

  let candidate = now
    .year(year ?? now.year())
    .month(monthIndex)
    .date(day)
    .startOf("day");
  // A bare "4 May" with no explicit year means the next such date, not one
  // already past — but an explicit year is taken literally, past or future.
  if (year === undefined && candidate.isBefore(now.startOf("day"))) {
    candidate = candidate.add(1, "year");
  }
  return candidate.format("YYYY-MM-DD");
}

function parseRelativeDate(text: string, now: Dayjs): string | undefined {
  const lower = text.toLowerCase();

  if (/\btoday\b/.test(lower)) return now.format("YYYY-MM-DD");
  if (/\btomorrow\b/.test(lower)) return now.add(1, "day").format("YYYY-MM-DD");

  const weekdayMatch = lower.match(/\b(next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
  if (weekdayMatch) {
    const isNext = Boolean(weekdayMatch[1]);
    const targetIndex = WEEKDAY_NAMES.indexOf(weekdayMatch[2]!);
    let daysAhead = (targetIndex - now.day() + 7) % 7;
    if (isNext) daysAhead += 7;
    return now.add(daysAhead, "day").format("YYYY-MM-DD");
  }

  return undefined;
}

function parseTime(text: string): string | undefined {
  const twelveHour = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (twelveHour) {
    let hour = Number(twelveHour[1]);
    const minute = Number(twelveHour[2] ?? "0");
    const meridiem = twelveHour[3]!.toLowerCase();
    if (meridiem === "pm" && hour !== 12) hour += 12;
    if (meridiem === "am" && hour === 12) hour = 0;
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }

  const twentyFourHour = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (twentyFourHour) {
    const hour = Number(twentyFourHour[1]);
    const minute = Number(twentyFourHour[2]);
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }

  return undefined;
}

/**
 * Deterministic, rule-based date/time extraction — not an LLM call, so it's
 * free, fast, and trivially unit-testable with zero network calls. Covers
 * the phrasings this checklist's scenarios exercise; free-form NLU beyond
 * that is a candidate for an `AIProvider`-backed upgrade later, not a
 * requirement here.
 */
export function parseBookingRequest(text: string, now: Dayjs): ParsedBookingRequest {
  const hasBookingIntent = BOOKING_INTENT_PATTERN.test(text);
  const date = parseExplicitDate(text, now) ?? parseRelativeDate(text, now);
  const time = parseTime(text);
  return { hasBookingIntent, date, time };
}
