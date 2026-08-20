/**
 * Contract-test-suite entry point — separate from the package's main
 * entry (`.`) on purpose. These functions import `vitest`; the interfaces
 * and schemas under `.` must stay importable from production code without
 * ever pulling `vitest`'s module-level side effects along with them.
 */
export { runChannelAdapterContractTests } from "./channel-adapter-contract.js";
export type { ChannelAdapterContractFixture } from "./channel-adapter-contract.js";
export { runAIProviderContractTests } from "./ai-provider-contract.js";
export { runCalendarProviderContractTests } from "./calendar-provider-contract.js";
export { runSessionStoreContractTests } from "./session-store-contract.js";
