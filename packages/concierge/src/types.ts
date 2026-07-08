/** Concierge multi-turn session state */
export interface ConciergeSession {
  step: "awaiting_date" | "awaiting_time" | "confirming";
  /** ISO date the user picked (YYYY-MM-DD) */
  date?: string;
  /** Available time slots for the chosen date */
  availableSlots?: string[];
  /** The time slot the user selected */
  selectedSlot?: string;
}
