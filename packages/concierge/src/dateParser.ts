/** Parse a date string into a "YYYY-MM-DD" ISO string (SGT). */
export function parseDate(input: string): string | null {
  const lower = input.toLowerCase().trim();
  const now = new Date();
  const sgNow = new Date(
    now.toLocaleString("en-US", { timeZone: "Asia/Singapore" })
  );

  // "today" / "tomorrow"
  if (lower === "today") return toIsoDate(sgNow);
  if (lower === "tomorrow") {
    const d = new Date(sgNow);
    d.setDate(d.getDate() + 1);
    return toIsoDate(d);
  }

  // "next Monday" / "next Tuesday" etc.
  const nextDayMatch = lower.match(
    /^next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/
  );
  if (nextDayMatch) {
    const targetDay = DAYS.indexOf(nextDayMatch[1]);
    const d = new Date(sgNow);
    const currentDay = d.getDay();
    let daysAhead = targetDay - currentDay;
    if (daysAhead <= 0) daysAhead += 7;
    d.setDate(d.getDate() + daysAhead);
    return toIsoDate(d);
  }

  // "YYYY-MM-DD"
  if (/^\d{4}-\d{2}-\d{2}$/.test(lower)) {
    const d = new Date(lower + "T00:00:00+08:00");
    if (!isNaN(d.getTime())) return lower;
  }

  // "DD/MM/YYYY" or "DD-MM-YYYY"
  const dmy = lower.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) {
    const d = new Date(
      parseInt(dmy[3]),
      parseInt(dmy[2]) - 1,
      parseInt(dmy[1])
    );
    if (!isNaN(d.getTime())) return toIsoDate(d);
  }

  // "DD Month" or "Month DD" (e.g. "15 July", "July 15")
  const months: Record<string, number> = {
    january: 1, february: 2, march: 3, april: 4,
    may: 5, june: 6, july: 7, august: 8,
    september: 9, october: 10, november: 11, december: 12,
    jan: 1, feb: 2, mar: 3, apr: 4,
    jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  };

  const dmMonth = lower.match(/^(\d{1,2})\s+([a-z]+)(?:\s+(\d{4}))?$/);
  if (dmMonth) {
    const month = months[dmMonth[2]];
    if (month) {
      const year = dmMonth[3]
        ? parseInt(dmMonth[3])
        : sgNow.getMonth() + 1 > month
        ? sgNow.getFullYear() + 1
        : sgNow.getFullYear();
      return `${year}-${String(month).padStart(2, "0")}-${String(parseInt(dmMonth[1])).padStart(2, "0")}`;
    }
  }

  const mdMonth = lower.match(/^([a-z]+)\s+(\d{1,2})(?:\s+(\d{4}))?$/);
  if (mdMonth) {
    const month = months[mdMonth[1]];
    if (month) {
      const year = mdMonth[3]
        ? parseInt(mdMonth[3])
        : sgNow.getMonth() + 1 > month
        ? sgNow.getFullYear() + 1
        : sgNow.getFullYear();
      return `${year}-${String(month).padStart(2, "0")}-${String(parseInt(mdMonth[2])).padStart(2, "0")}`;
    }
  }

  return null;
}

/** Format a "YYYY-MM-DD" string as a human-readable date, e.g. "15 July 2026". */
export function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.toLocaleDateString("en-SG", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────

const DAYS = [
  "sunday", "monday", "tuesday", "wednesday",
  "thursday", "friday", "saturday",
];

function toIsoDate(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Singapore" }); // en-CA gives YYYY-MM-DD
}
