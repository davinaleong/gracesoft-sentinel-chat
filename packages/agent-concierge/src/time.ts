import dayjsBase from "dayjs";
import timezone from "dayjs/plugin/timezone.js";
import utc from "dayjs/plugin/utc.js";

dayjsBase.extend(utc);
dayjsBase.extend(timezone);

export const dayjs = dayjsBase;
export type { Dayjs } from "dayjs";

/**
 * The business's own "now", in the business's configured timezone —
 * bookings are always reasoned about in this timezone regardless of the
 * client's apparent locale or phrasing.
 */
export function businessNow(businessTimezone: string, at: Date = new Date()): dayjsBase.Dayjs {
  return dayjs(at).tz(businessTimezone);
}

/** Parses an ISO instant and views it in the business's timezone. */
export function inBusinessTz(iso: string, businessTimezone: string): dayjsBase.Dayjs {
  return dayjs(iso).tz(businessTimezone);
}
