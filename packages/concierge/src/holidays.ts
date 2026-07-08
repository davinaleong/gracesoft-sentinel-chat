/** Singapore public holidays (hardcoded for 2025–2026) */
const SINGAPORE_HOLIDAYS: Set<string> = new Set([
  // 2025
  "2025-01-01", // New Year's Day
  "2025-01-29", // Chinese New Year
  "2025-01-30", // Chinese New Year (Day 2)
  "2025-04-18", // Good Friday
  "2025-05-01", // Labour Day
  "2025-05-12", // Vesak Day
  "2025-06-07", // Hari Raya Haji
  "2025-08-09", // National Day
  "2025-10-20", // Deepavali
  "2025-12-25", // Christmas Day

  // 2026
  "2026-01-01", // New Year's Day
  "2026-02-17", // Chinese New Year
  "2026-02-18", // Chinese New Year (Day 2)
  "2026-04-03", // Good Friday
  "2026-05-01", // Labour Day
  "2026-05-27", // Hari Raya Haji
  "2026-05-31", // Vesak Day
  "2026-08-10", // National Day (observed; Aug 9 falls on Sunday)
  "2026-11-09", // Deepavali
  "2026-12-25", // Christmas Day
]);

/** Returns true if the ISO date string is a Singapore public holiday. */
export function isPublicHoliday(isoDate: string): boolean {
  return SINGAPORE_HOLIDAYS.has(isoDate);
}

/** Returns true if the Date is a weekend (Saturday or Sunday). */
export function isWeekend(date: Date): boolean {
  const day = date.getDay(); // 0 = Sunday, 6 = Saturday
  return day === 0 || day === 6;
}
