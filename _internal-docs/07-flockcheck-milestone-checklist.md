# GraceSoft FlockCheck — Milestone Checklist

**Milestone Checklist**

Companion build plan for **FlockCheck** (cell group member tracker: photo-based enrollment, group-photo attendance, member particulars, birthday lookups), following the exact package/contract discipline already proven by **Sentinel Concierge** and **Sentinel Cook** in this monorepo.

Reference decisions carried over unchanged from the existing platform:

- Same monorepo (pnpm workspaces), same "packages structured as if independent repos" rule
- No package reaches into another's internals — only through `@gracesoft-sentinel/core` contracts
- Same boundary-linting (dependency-cruiser) and Changesets discipline, extended rather than re-invented

What's reused as-is, with **no changes needed**:

- `channel-whatsapp`, `channel-telegram` — both already normalize inbound photos into `NormalizedMessage` media (proven by Cook's dish-photo flow); a cell group photo is just another inbound image
- `provider-ai-openai` / `provider-ai-gemini` — reused for any free-text query parsing (e.g. "when's Mary's birthday", "remove John Tan") via `chatComplete`, same as Concierge's intent detection
- `provider-session-redis`, `logging-postgres`, `logging` — reused unchanged for conversation state and structured/PII-redacted logging

What's genuinely new: face-photo enrollment and matching is a capability neither existing agent has, so it needs new `core` contracts and new provider packages — this is the FlockCheck equivalent of Concierge's `CalendarProvider` or Cook's Drive/Pinecone work.

Open decisions flagged (not silently assumed) are called out inline as `⚠` items — resolve these before or during the relevant milestone, don't guess.

---

# Milestone 0 — Core Contract Extensions (`@gracesoft-sentinel/core`)

### Goal

Extend `core` with the channel-agnostic contracts FlockCheck needs, purely additive — zero breaking changes to the interfaces Concierge/Cook already depend on.

### Deliverables

- `FaceMatchProvider` interface (`enrollFace`, `matchFaces`) + Zod schemas
- `MemberDirectoryProvider` interface (`createMember`, `getMember`, `listMembers`, `removeMember`, `recordAttendance`, `getAttendanceHistory`, `getUpcomingBirthdays`) + Zod schemas
- `PhotoStorageProvider` interface (`storePhoto`, `getPhoto`, `deletePhoto`) + Zod schemas
- `ConsentRecord` shape (method, timestamp, capturedBy) embedded in `MemberDirectoryProvider`'s create-member input
- Shared contract test suites for all three new interfaces (`runFaceMatchProviderContractTests`, `runMemberDirectoryProviderContractTests`, `runPhotoStorageProviderContractTests`)

### Checklist

- [ ] Define `FaceMatchProvider` interface + Zod schemas (`EnrollFaceInput/Result`, `MatchFacesInput/Result`, confidence score field required — not optional, since low-confidence handling is safety-critical)
- [ ] Define `MemberDirectoryProvider` interface + Zod schemas, including `ConsentRecord`
- [ ] Define `PhotoStorageProvider` interface + Zod schemas
- [ ] Write shared contract test suite for each of the three new interfaces
- [ ] Run full existing test suite (Concierge + Cook) unmodified — confirm nothing broke
- [ ] Changeset: minor version bump on `core` (additive only)

---

# Milestone 1 — Agent Core (`agent-flockcheck`)

### Goal

Extract/author FlockCheck's conversational logic as a pure, platform-agnostic package — no WhatsApp, no Telegram, no vendor SDK, no direct Postgres — same shape as `agent-concierge`/`agent-cook`.

### Deliverables

- Enrollment state machine: photo → full name → birth date, repeatable per new member, each step validated before advancing
- Consent capture step wired into enrollment (explicit chatter confirmation before a photo/birthdate is persisted anywhere)
- Group-photo attendance flow: `FaceMatchProvider.matchFaces()` → resolve matches against `MemberDirectoryProvider` → alphabetically-sorted attendance list
- Regularity calculation per member (attendance percentage) — ⚠ **open decision:** define the window (rolling last N sessions? last 90 days? since join date?) before building; document whichever is chosen in this file once decided
- Join-date display alongside each member in attendance output
- Unrecognized-face handling: a face in the group photo that doesn't match any enrolled member prompts to enroll them, rather than silently dropping or misattributing them
- Member-particulars query flow (name, birthdate, join date, regularity)
- Remove-member flow: explicit confirm-before-delete step, naming exactly what will be deleted
- Upcoming-birthdays query flow (configurable lookahead window, e.g. next 30 days)
- `handleMessage()` public entry point

### Checklist

- [ ] Enrollment state machine (photo/name/birthdate, repeatable, per-step validation)
- [ ] Consent capture step (logged, not just displayed)
- [ ] Group-photo attendance flow (match → resolve → alphabetical list)
- [ ] Regularity definition decided (⚠ above) and implemented
- [ ] Join-date included in attendance output
- [ ] Unrecognized-face fallback (offers enrollment, never silent-drops or auto-assumes identity)
- [ ] Member-particulars query, access-gated to the chatter role (see Milestone 5 for enforcement point)
- [ ] Remove-member flow with explicit confirm step naming what gets deleted
- [ ] Upcoming-birthdays query
- [ ] `handleMessage()` public entry point
- [ ] Confirm zero imports from `channel-*`/`provider-*` packages (boundary lint)
- [ ] Unit test suite runnable with zero network calls (mock providers)

---

# Milestone 2 — Member Directory Provider (`provider-member-store-postgres`)

### Goal

Postgres-backed system of record for the roster, attendance history, and consent log — the FlockCheck equivalent of `provider-calendar-google`.

### Deliverables

- Schema: `members`, `attendance_records`, `consent_log` tables
- `PostgresMemberDirectoryProvider` implementing full CRUD + attendance recording + regularity/birthday queries
- Passes `MemberDirectoryProvider` contract suite from Milestone 0

### Checklist

- [ ] Design schema (`members`, `attendance_records`, `consent_log`)
- [ ] Implement `PostgresMemberDirectoryProvider`
- [ ] Run shared contract test suite against it
- [ ] Verify `removeMember` performs a real, hard delete with no orphaned rows across all three tables
- [ ] Confirm encryption-at-rest for birthdate and other PII columns (or explicitly document reliance on infra-level disk encryption, same honesty standard as the rest of this checklist)

---

# Milestone 3 — Face Match Provider (`provider-face-match-<vendor>`)

### Goal

Wrap a real face-recognition vendor behind `FaceMatchProvider` so the agent never touches a vendor SDK directly — same pattern as `provider-ai-openai`/`provider-ai-gemini` being interchangeable behind `AIProvider`.

### Deliverables

- `<Vendor>FaceMatchProvider` implementing `enrollFace`/`matchFaces` — ⚠ **open decision:** vendor choice (AWS Rekognition vs Azure Face API vs a self-hosted model); document the rationale here once decided, same as the Gemini-vs-Anthropic call in the main platform's Milestone 11
- Passes `FaceMatchProvider` contract suite
- Confidence-threshold handling: a low-confidence match is treated as unrecognized, never surfaced as a confident wrong identification

### Checklist

- [ ] Vendor decision made + rationale documented
- [ ] Implement provider against `FaceMatchProvider` interface
- [ ] Run shared contract test suite against it
- [ ] Confidence threshold tuned and tested (no false-positive identification in test fixtures)
- [ ] Multi-face-per-photo handling: a group photo with N people produces N independent match attempts, not a single first-match-wins result

---

# Milestone 4 — Photo Storage Provider (`provider-photo-storage-<vendor>`)

### Goal

Encrypted-at-rest storage for enrollment photos, kept as its own provider rather than folded into the face-match vendor or the member-directory database — same separation-of-concerns discipline as the platform's existing Drive-I/O-vs-Pinecone split.

### Deliverables

- `storePhoto`/`getPhoto`/`deletePhoto` implementation — ⚠ candidate: S3 with server-side encryption for production, or encrypted Postgres `bytea` as a lower-effort MVP; decide and document
- Passes `PhotoStorageProvider` contract suite
- `deletePhoto` verified as genuinely unrecoverable, not a soft-delete flag

### Checklist

- [ ] Implement provider against `PhotoStorageProvider` interface
- [ ] Run shared contract test suite against it
- [ ] Confirm encryption at rest
- [ ] Confirm `deletePhoto` is unrecoverable — this is the technical backbone of the erasure-request path in Milestone 6

---

# Milestone 5 — Service Wiring (`apps/flockcheck-service`)

### Goal

Compose agent + channels + providers into a deployable service, same shape as `concierge-service`/`cook-service`.

### Deliverables

- `flockcheck-service`: wires `agent-flockcheck` to `channel-whatsapp` + `channel-telegram` + `provider-ai-openai` (or gemini) + `provider-face-match-<vendor>` + `provider-member-store-postgres` + `provider-photo-storage-<vendor>`
- Env-driven config resolution
- Chatter-role access control enforced at the service layer, not just assumed by convention — ⚠ **open decision:** is "chatter" one designated cell leader per group, or anyone who messages the bot? this determines the access-control model and must be settled before this milestone is built, not after

### Checklist

- [ ] Build `flockcheck-service` composition root
- [ ] Confirm `channel-whatsapp`/`channel-telegram` need zero code changes (group-photo media download already proven by Cook's dish-photo path)
- [ ] Wire `provider-session-redis` for conversation state (reused unchanged)
- [ ] Wire `logging-postgres` (reused; PII redaction rules extended per Milestone 6, not just phone/email)
- [ ] Chatter-role definition settled (⚠ above) and access control implemented + enforced
- [ ] Env validation via Zod
- [ ] docker-compose entry added

---

# Milestone 6 — Consent & Biometric Data Hardening

### Goal

FlockCheck handles special-category personal data (face photos, birthdates) that neither Concierge nor Cook ever touched. The platform's existing Milestone 10 hardening (rate limiting, prompt-injection guards, PII redaction, structured logging) is necessary but not sufficient once biometric data is in scope — this milestone is the gap-fill.

### Deliverables

- Explicit consent capture at enrollment, logged with timestamp and method (built in Milestone 1/0, verified end-to-end here)
- Retention policy: defined and enforced, not left implicit — ⚠ **open decision:** e.g. auto-flag (not auto-delete) records after N months of member inactivity for the cell leader to review; pick a concrete N with the user, don't invent one silently
- Data subject access/erasure path: a member (via their cell leader) can request full export or full deletion, and both must actually reach all three stores — member directory, photo storage, **and** the face-match vendor's own enrolled-face record (a three-system delete, easy to under-scope to just one)
- PII redaction in logs extended to cover names and birthdates, not only phone/email (the platform's existing `redactPii` was written for Concierge/Cook's data shape, not this one)
- Query audit trail: every particulars/attendance/birthday query logged (who asked, what was returned, when) — reviewed so the audit log itself doesn't become a second place the same sensitive data leaks in plaintext

### Checklist

- [ ] Consent capture verified end-to-end (enrollment → logged record, queryable later)
- [ ] Retention policy decided (⚠ above) and documented as an explicit, signed-off decision
- [ ] Full erasure path deletes from member directory, photo storage, **and** vendor-side face enrollment — tested as one combined operation, not three independent ones that can partially fail silently
- [ ] Data export path for a member's own particulars (human-readable, not a raw DB dump)
- [ ] `redactPii` extended to cover names/birthdates in log output
- [ ] Query audit log implemented and reviewed for its own PII exposure risk
- [ ] Access-control test: a sender who isn't the recognized chatter cannot retrieve particulars or trigger a removal

---

# Milestone 7 — Legal & Compliance Pages

### Goal

FlockCheck-specific Privacy Policy/T&C, same structural pattern as `legal-concierge`/`legal-cook`, but with an explicit biometric-data section given the higher regulatory bar (GDPR Art. 9 special category data; Singapore PDPA's stricter treatment of biometric data).

### Deliverables

- `packages/legal-flockcheck` — Privacy Policy + T&C naming face photos and birthdates as collected data categories, biometric processing called out as its own distinct purpose (not folded into a generic "we collect your data" clause)
- `apps/legal-site` routes: `/flockcheck/privacy`, `/flockcheck/terms`
- WhatsApp/Telegram bot bio or `/start` message linking to the policy

### Checklist

- [ ] Draft FlockCheck Privacy Policy, with an explicit biometric-data section (what's collected, why, retention period from Milestone 6, deletion rights)
- [ ] Draft FlockCheck T&C
- [ ] Effective-date/version field
- [ ] Scaffold `packages/legal-flockcheck`
- [ ] Wire into `apps/legal-site` at its two routes
- [ ] Automated keyword checks for PDPA-required notice elements, plus a check specifically for the biometric-data disclosure (mirroring `legal-content.test.ts`'s existing pattern, extended)
- [ ] Human legal-sufficiency review flagged explicitly — draft status until reviewed, same as the existing legal packages
- [ ] Deploy + submit for WhatsApp/Telegram verification — blocked on live deploy + real accounts, same pattern as the platform's existing Milestone 9

---

# Milestone 8 — Future / Optional

- [ ] Multi-cell-group support: one deployment serving many cell groups, mirroring the platform's existing multi-tenant `BusinessConfig` pattern (keyed the same way, by `businessChannelId`)
- [ ] Session-date disambiguation: prompt for/confirm which meeting date a group photo corresponds to, rather than assuming "today" — this materially affects whether the regularity calculation (Milestone 1) is correct, so resolve it as early as practical rather than deferring it here by default
- [ ] Bulk enrollment (CSV + photo-batch import) for onboarding an existing cell group all at once instead of one member at a time
- [ ] Proactive weekly digest ("3 birthdays this week", "2 members below 50% attendance") pushed to the chatter rather than only available on query

---

# Suggested Build Order

1. Milestone 0 — Core contract extensions
2. Milestone 1 — Agent core (can start in parallel with Milestone 0 against interface stubs, same as the platform's own Milestone 2/3 parallelism)
3. Milestone 2 & 3 & 4 (parallel) — Member directory, face match, photo storage providers
4. Milestone 5 — Service wiring
5. Milestone 6 — Consent & biometric data hardening (do this **before** any real cell group's data is enrolled — not a post-launch cleanup item)
6. Milestone 7 — Legal & compliance pages (needed before any real WhatsApp Business verification/App Review submission, same as the platform's existing Milestone 9)
7. Milestone 8 — Future work
