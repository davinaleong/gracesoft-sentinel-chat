import { randomInt } from "node:crypto";

/**
 * Crockford's Base32 alphabet — excludes I, L, O, U specifically to avoid
 * visual confusion with 1, 1, 0, and profanity, respectively. A chatter
 * reading this off a screen or dictating it over a voice note needs it to
 * be unambiguous, not just short.
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const GROUP_SIZE = 4;
const GROUP_COUNT = 2;

/**
 * The appointment id is both the chatter-facing booking reference *and*,
 * per the reschedule flow, the closest thing this system has to a proof of
 * ownership — so it needs enough entropy to resist casual guessing (32^8 ≈
 * 40 bits), not just enough to avoid accidental collisions.
 */
export function generateAppointmentId(): string {
  const groups: string[] = [];
  for (let g = 0; g < GROUP_COUNT; g++) {
    let group = "";
    for (let i = 0; i < GROUP_SIZE; i++) {
      group += ALPHABET[randomInt(ALPHABET.length)];
    }
    groups.push(group);
  }
  return `GS-${groups.join("-")}`;
}

const APPOINTMENT_ID_PATTERN = new RegExp(`\\bGS-[${ALPHABET}]{${GROUP_SIZE}}-[${ALPHABET}]{${GROUP_SIZE}}\\b`, "i");

/** Finds an appointment-id-shaped token anywhere in free text, case-insensitively. */
export function extractAppointmentId(text: string): string | undefined {
  const match = text.match(APPOINTMENT_ID_PATTERN);
  return match ? match[0].toUpperCase() : undefined;
}
