/** Cook single-turn session state */
export interface CookSession {
  /** Set only when Cook was activated via menu (no photo yet) */
  step: "awaiting_photo";
}
