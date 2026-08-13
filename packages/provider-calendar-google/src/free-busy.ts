import type { AvailabilitySlot } from "@gracesoft-sentinel/core";

/**
 * `CalendarProvider.getAvailability` returns *free* windows (see core's
 * dogfood fake and `agent-concierge`'s `isSlotAvailable`), but the Google
 * Calendar `freebusy` API reports *busy* periods — this inverts one into
 * the other within the queried `[from, to)` range.
 */
export function invertBusyToFree(
  from: string,
  to: string,
  busy: { start?: string | null; end?: string | null }[]
): AvailabilitySlot[] {
  const fromMs = new Date(from).getTime();
  const toMs = new Date(to).getTime();
  if (fromMs >= toMs) return [];

  const sorted = busy
    .filter((b): b is { start: string; end: string } => Boolean(b.start && b.end))
    .map((b) => ({ start: new Date(b.start).getTime(), end: new Date(b.end).getTime() }))
    .filter((b) => b.end > fromMs && b.start < toMs)
    .sort((a, b) => a.start - b.start);

  const free: AvailabilitySlot[] = [];
  let cursor = fromMs;
  for (const b of sorted) {
    if (b.start > cursor) {
      free.push({ start: new Date(cursor).toISOString(), end: new Date(b.start).toISOString() });
    }
    cursor = Math.max(cursor, b.end);
  }
  if (cursor < toMs) {
    free.push({ start: new Date(cursor).toISOString(), end: new Date(toMs).toISOString() });
  }
  return free;
}
