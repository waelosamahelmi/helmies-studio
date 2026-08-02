# Data retention

This documents what is actually stored, for how long, and — the point of
writing it now rather than only in `/privacy` — where the code does not yet
match what `/privacy` (§7, "Data Retention and Deletion") promises users.
`/privacy` is legal copy and is out of scope to rewrite here; this doc exists
so an operator (or a future engineer) can see the gap plainly instead of
discovering it during an actual deletion request.

## What is stored today

| Data | Table(s) | Retention today |
|---|---|---|
| Account (name, email, role, credits mirror) | `User` | Indefinite — no automatic deletion or inactivity sweep exists. |
| Sessions / OAuth accounts | `Session`, `Account` (NextAuth adapter tables) | Indefinite, tied to the `User` row. |
| Wallet balance and ledger | `CreditWallet`, `CreditLedger`, `CreditReservation` | Indefinite. This is the financial record of record — see `src/lib/wallet.js`'s header; there is no reason to delete it while an account exists, and every reconciliation guarantee (`src/lib/reconciliation.js`) depends on the ledger being complete. |
| Generations (prompt, params, output URL, cost) | `Generation` | Indefinite. A user can delete individual gallery items (per `/privacy`), which is a plain row delete — not exercised by any automated sweep. |
| Durable job queue history | `GenerationJob` | **30 days** after reaching a terminal state (`succeeded`/`failed`/`dead`) — `src/lib/job-queue.js`'s `pruneTerminalJobs`, run by the automation cron (`docs/runbook-ops.md`). Non-terminal (`queued`/`running`) rows are never candidates regardless of age. This is the one retention sweep in this codebase that is both implemented **and** actually running on a schedule. |
| Uploaded/generated media (image, video, audio files) | Object storage (S3-compatible) or local disk (`src/lib/storage/`) | Indefinite. `/privacy` states "Uploaded files are automatically deleted after generation completes" — **this is not implemented.** Nothing in `src/lib/storage/ingest.js`, the local driver, or the S3 driver deletes the source upload once a generation finishes; ingested outputs and the assets they're built from persist exactly like generation history above. |
| Audit log | `AuditLog` | Indefinite. This is intentional — it's the compliance/security trail (admin actions, auto-suspend/auto-disable actions, Phase 7's maintenance-mode and provider-kill-switch changes), not a candidate for automatic pruning. |
| Rate-limit counters | `RateLimit`, `AnonRateLimit` | Rolling window per endpoint (`checkRateLimit`/`checkAnonLimit`, `src/lib/security.js` / `src/lib/rate-limit.js`) — old rows are overwritten in place on the next window, not explicitly deleted, but they carry no meaningful history once their window has passed. |
| Stripe event idempotency ledger | `StripeEvent` | Indefinite. Small, append-only, exists purely to make webhook processing idempotent (`src/app/api/stripe/webhook/route.js`) — not a candidate for pruning without re-litigating whether an old Stripe event could ever be redelivered. |

## What the retention sweeps actually delete today

Exactly one: `pruneTerminalJobs` (30-day terminal `GenerationJob` rows, above).
Everything else described as automation in `src/lib/automation.js`
(`autoDisableFailingModels`, `autoSuspendAbusiveUsers`,
`sweepExpiredReservations`, `sweepTimedOutJobs`) is a state-transition or
money-safety sweep, not a retention/deletion sweep — none of them delete
rows, they resolve or disable them.

## What is not yet implemented

**Media retention.** No sweep deletes uploaded source files or generated
media after any age, despite `/privacy` promising automatic deletion "after
generation completes." Every file ingested via `src/lib/storage/` (local or
S3) persists indefinitely today. Building this requires: deciding the actual
retention window, confirming nothing else (gallery display, template
previews, downstream `Asset` rows) still references a file before deleting
it, and deciding whether "after generation completes" means the *source*
upload only or generated outputs too — `/privacy`'s wording is ambiguous on
this and should be reconciled with whatever gets built, not the other way
around.

**User export.** No endpoint or admin action produces a machine-readable
export of a user's data (the GDPR "Portability" right `/privacy` §6
promises). Today this would be handled manually (direct DB query) if
someone actually requested it — there is no tooling.

**User deletion (the "right to be forgotten").** No self-service "delete my
account" flow and no admin-triggered equivalent exist in code. `/privacy`
promises deletion of personal data, User Content, and Generated Content
within 30 days of an account-deletion request, and separately promises
inactive free accounts "may be deleted after 12 months of inactivity" — **no
automation implements the inactivity sweep either.** Today, either promise
being honored means an operator manually deleting rows across `User`,
`Generation`, `Asset`, `CreditWallet`/`CreditLedger`/`CreditReservation`,
`AgentRun`, `Workflow`, `ProjectMemory`, `ApiKey`, and the object-storage
files those rows reference — with no tooling to do it consistently, verify
completeness, or avoid breaking FK constraints partway through. This is the
single largest gap between what `/privacy` commits to and what the product
actually does, and should be prioritized before it is tested by a real GDPR
erasure request rather than by an audit.

## What this means for `RELEASE_STATUS.md`

None of the three gaps above are new in this phase — they predate Phase 7 and
are documented here for the first time because Task 5 is explicitly about
writing down the truth rather than assuming it's fine. They are called out
plainly in `RELEASE_STATUS.md` rather than silently passed over.
