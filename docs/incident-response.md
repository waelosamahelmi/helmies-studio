# Incident response

Who actually gets paged today: **no one, automatically.** There is no paging
integration wired up (see `docs/runbook-ops.md`'s alert-thresholds section
below and `RELEASE_STATUS.md` — Gate F). This doc defines the severity
vocabulary and the escalation path for when a human notices a problem
(dashboard check, user report, or a log line someone happened to read), so
that a real incident isn't the first time anyone has thought about how to
triage one.

## Severity levels

**SEV-1 — money or data at risk, right now.**
Examples: Stripe webhook failures piling up (a payment landed, credits
didn't); `reconciliation.drifted` nonzero and growing; the worker down long
enough that `oldestQueuedAgeSec` has been climbing for 10+ minutes; a
security incident in progress (credential leak, active exploitation);
the app or DB is down for all users.
**Response:** page immediately (see "who to page" below), no waiting for a
scheduled check-in. Open `docs/runbook-ops.md` and the relevant sweep/runbook
section (jobs, reconciliation, maintenance mode) and start there.

**SEV-2 — degraded but not actively losing money/data.**
Examples: one provider (KIE or Alibaba) failing consistently but the other
still serving; a single stuck generation a user reported; elevated (but not
runaway) generation failure rate; a non-critical a11y regression on a core
journey.
**Response:** handle during business hours unless it's clearly trending
toward SEV-1 (e.g. a "one provider failing" pattern that's also pushing
`oldestQueuedAgeSec` up because the fallback chain is exhausted too).

**SEV-3 — cosmetic or isolated.**
Examples: a moderate axe violation (heading order, landmark structure — see
`tests/e2e/a11y.spec.mjs`'s non-gating findings); a single user's one-off
report that doesn't reproduce; a dead-code finding
(`npm run check:dead-code`).
**Response:** normal backlog triage.

## Who to page

There is currently one operator: **the founder/admin account holder**
(the same person who can reach Admin → Operator controls). There is no
on-call rotation, no secondary, and no paging service (PagerDuty/Opsgenie/
etc.) integrated — "paging" today means a direct message or phone call. This
is a real gap for anything beyond a single-operator project and should be
the first thing revisited if a second person joins operations.

## First five commands (SEV-1, before anything else)

Run these in order — they establish "is money actively at risk" before you
start investigating root cause:

```bash
# 1. Is the app up at all?
curl -s -o /dev/null -w '%{http_code}\n' https://studio.helmies.fi/

# 2. Is the worker alive, and is the queue backing up?
#    (oldestQueuedAgeSec is the number that matters most here)
curl -s https://studio.helmies.fi/api/admin/metrics \
  -H "Cookie: <admin session cookie>" | jq '.jobs, .reconciliation, .webhooks'

# 3. Is PM2's view consistent with #2?
pm2 list
pm2 logs helmies-worker --lines 50

# 4. Are Stripe events actually landing and being processed?
#    (webhooks.stripeEventsProcessed from #2 should be moving if
#    checkouts/renewals are happening; check Stripe's own dashboard for
#    delivery failures if it looks stalled)

# 5. If money is confirmed at risk (drift, stuck reservations, a stuck
#    queue): reach for the specific runbook section immediately —
#    docs/runbook-ops.md ("Worker down", "Reconciliation drift") and
#    docs/runbook-jobs.md — rather than debugging from first principles
#    under pressure.
```

If steps 1–2 both look healthy, downgrade from "actively investigating a
SEV-1" to "confirm and monitor" — most reported issues are SEV-2 once you've
established the app and the queue are actually fine.

## Maintenance mode as a containment tool

If an incident requires stopping new state changes while you investigate
(a bad deploy, a data-integrity concern, a provider actively corrupting
output) — turn maintenance mode on (`docs/runbook-ops.md`). It is the
fastest available "stop the bleeding" lever: `/studio` and every
state-changing API call 503 immediately, while provider callbacks, Stripe
events, and the admin console you're using to investigate all keep working.
Turn it off the moment the investigation is complete or contained — it has
no auto-expiry.

## After the incident

There is no formal postmortem template yet. At minimum, record: what
happened, when it was noticed vs. when it started (check `AuditLog` and the
relevant metrics for the actual start time — don't rely on memory), what
stopped it, and whether it was caught by a human noticing a dashboard number
or purely by a user report (the latter is a signal an alert threshold in
`docs/runbook-ops.md`'s alert-thresholds section should have caught it and
didn't).
