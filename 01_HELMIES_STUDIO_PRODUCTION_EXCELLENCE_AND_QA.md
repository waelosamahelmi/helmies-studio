# Helmies Studio — Production Excellence, Full QA, Security & Template Build Contract

**Document type:** Binding implementation contract for Claude or another autonomous coding agent  
**Repository:** `waelosamahelmi/helmies-studio`  
**Target branch:** Create a feature branch; merge only after every release gate passes  
**Target:** A production-grade AI creative SaaS that scores 10/10 in reliability, security, UX, browser compatibility, accessibility, observability, commercial correctness, and maintainability  
**Date:** 2026-07-31  
**Relationship to existing repository documents:** Read `HELMIES_STUDIO_MASTER_UPGRADE.md` and `STUDIO_FUNCTIONALITY.md` first. This document is the execution and verification layer. Where a conflict exists, preserve the product vision in the master specification but apply the stricter safety, testing, and acceptance criteria in this document.

---

# 0. Non-Negotiable Agent Protocol

The implementation agent SHALL NOT merely review, recommend, document, or create placeholders. It MUST inspect, implement, run, verify, repair, and re-run until all release gates pass.

## 0.1 Required operating loop

For every requirement:

1. Locate all affected files and data flows.
2. Record the current behavior and failure risks.
3. Implement the smallest coherent production-grade solution.
4. Add or update automated tests.
5. Run type checking, linting, unit tests, integration tests, end-to-end tests, security tests, accessibility checks, browser tests, and production build.
6. Repair every failure.
7. Re-run the complete relevant suite.
8. Record implementation evidence:
   - files changed;
   - tests added;
   - commands executed;
   - screenshots or traces where applicable;
   - database migration name;
   - security considerations;
   - rollback method.
9. Mark a requirement complete only when its acceptance criteria pass.
10. Never skip a requirement because it is difficult, expensive, or broad. Break it into smaller tasks and continue.

## 0.2 Prohibited completion shortcuts

The agent MUST NOT:

- claim that code “should work” without running it;
- use mock-only tests as proof that the real Stripe/provider/database flow works;
- leave TODO, FIXME, stub, fake data, disabled button, silent catch, or “coming soon” behavior in a launch-critical path;
- swallow errors;
- expose provider keys, Stripe secrets, database URLs, session secrets, internal URLs, stack traces, or user data;
- trust client-supplied prices, credit costs, endpoint names, roles, ownership fields, provider costs, subscription state, or admin flags;
- replace difficult behavior with a toast that says success;
- use `prisma db push` as the production migration process;
- merge with failing tests, warnings treated as errors, unresolved security findings, or broken responsive states;
- delete existing functionality to make tests pass unless the deletion is approved by the product specification;
- create two implementations for mobile and desktop;
- redesign the protected public landing page unnecessarily.

## 0.3 Definition of “10/10”

“10/10” does not mean mathematically perfect software. It means all of these are true:

- no known critical or high-severity vulnerability;
- no known payment, credit, authorization, privacy, or data-loss defect;
- all launch-critical automated tests pass;
- all supported browsers pass the acceptance suite;
- all core actions give clear progress, success, failure, retry, cancellation, and recovery states;
- user-visible errors are understandable and actionable;
- financial calculations are server-authoritative and auditable;
- production monitoring can detect failures before users report them;
- the product remains usable on a narrow phone, tablet, laptop, large display, touch device, keyboard-only device, slow network, and interrupted network;
- accessibility meets WCAG 2.2 AA for public and authenticated core flows;
- the release can be rolled back safely;
- every template included in this contract produces a useful, editable, reproducible result.

---

# 1. Baseline Audit and Repository Stabilization

## 1.1 Establish the baseline

Before changing functionality, run and save results for:

```bash
node --version
npm --version
npm ci
npm run build
npm run lint
npx tsc --noEmit
npm audit --omit=dev
```

If the current lint script uses an unsupported Next.js command, replace it with an explicit ESLint configuration and script.

Add the following standard scripts to `package.json`:

```json
{
  "scripts": {
    "dev": "next dev --port 3003",
    "build": "next build",
    "start": "next start",
    "lint": "eslint . --max-warnings=0",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:integration": "vitest run --config vitest.integration.config.ts",
    "test:e2e": "playwright test",
    "test:e2e:headed": "playwright test --headed",
    "test:a11y": "playwright test tests/e2e/accessibility",
    "test:security": "vitest run tests/security && node scripts/security-audit.mjs",
    "test:contract": "vitest run tests/contracts",
    "test:all": "npm run lint && npm run typecheck && npm run test && npm run test:integration && npm run test:e2e && npm run test:security && npm run build",
    "db:generate": "prisma generate",
    "db:migrate:dev": "prisma migrate dev",
    "db:migrate:deploy": "prisma migrate deploy",
    "db:seed": "prisma db seed",
    "check:dead-code": "node scripts/dead-code.mjs",
    "check:env": "node scripts/check-env.mjs"
  }
}
```

Use TypeScript for all new production code. Convert launch-critical JavaScript modules opportunistically when they are edited, without stopping the release for a complete rewrite.

## 1.2 Repository hygiene

Implement:

- a complete `README.md`;
- `.env.example` containing names and explanations, never real secrets;
- `SECURITY.md`;
- `CONTRIBUTING.md`;
- `docs/architecture.md`;
- `docs/runbook.md`;
- `docs/payment-runbook.md`;
- `docs/provider-runbook.md`;
- `docs/incident-response.md`;
- `docs/data-retention.md`;
- `docs/release-checklist.md`;
- GitHub issue templates for bug, security, provider outage, and feature;
- pull request template containing test evidence and risk level;
- Dependabot or Renovate;
- secret scanning;
- branch protection documentation;
- CODEOWNERS for payments, auth, wallet, webhooks, migrations, and security-sensitive routes.

Delete committed generated artifacts, local databases, logs, provider outputs, temporary screenshots, and abandoned prototypes unless required as fixtures. Large media fixtures belong in dedicated test storage or tiny deterministic samples.

## 1.3 Dependency correctness

Resolve version inconsistency between Prisma packages. Pin compatible versions and commit the lockfile.

Avoid floating major versions. Use a scheduled dependency update process and test updates before merging.

Evaluate beta dependencies used in launch-critical flows. NextAuth beta may remain only if:

- sessions, OAuth, credentials login, role propagation, logout, expiry, CSRF, and callback behavior are covered by integration and E2E tests;
- known advisories are reviewed;
- the exact version is pinned.

---

# 2. Production Architecture and Data Integrity

## 2.1 Replace production `db push` with migrations

Create a proper `prisma/migrations/` history from the current production-compatible schema.

Requirements:

- migration for every schema change;
- pre-deployment backup;
- expand-and-contract migration pattern for destructive changes;
- migration tests against a clean database and a production-like snapshot;
- startup must not silently modify schema;
- deployment runs `prisma migrate deploy`;
- rollback instructions exist for every risky migration.

## 2.2 One authoritative credit system

The repository has legacy `User.credits`, transactions, wallet concepts, and previous mismatch risk. Replace ambiguity with one authoritative ledger.

Required entities or equivalent:

- `CreditWallet`
  - `userId`
  - `available`
  - `reserved`
  - `lifetimeCredited`
  - `lifetimeDebited`
  - `version`
- `CreditLedgerEntry`
  - immutable ID;
  - user/wallet;
  - signed delta;
  - balance after;
  - type;
  - source entity;
  - idempotency key;
  - metadata;
  - created time.
- `CreditReservation`
  - amount;
  - job;
  - status;
  - expiry;
  - settled amount;
  - released amount.
- `PricingSnapshot`
  - customer credits;
  - provider expected cost;
  - provider actual cost;
  - currency;
  - markup;
  - model/version/rule;
  - input parameters used to price.

Rules:

- never mutate balances without a database transaction;
- use row versioning or atomic conditional update to prevent double spend;
- reservation precedes provider submission;
- settlement is idempotent;
- failure releases unused reservation;
- provider callback and polling cannot settle twice;
- refunds create new ledger entries; never edit history;
- admin adjustments require reason and audit entry;
- Stripe credits and generation credits use the same wallet;
- if `User.credits` remains temporarily, it is a read-through compatibility mirror updated transactionally and never authoritative;
- reconciliation job compares wallet, ledger, reservations, Stripe, and generation records.

## 2.3 Durable generation jobs

Long-running media generation must not rely on fire-and-forget request execution.

Implement a durable queue and worker architecture using Redis/BullMQ or a database-backed queue that supports:

- job creation;
- idempotency key;
- retries with bounded exponential backoff;
- provider timeout;
- cancellation;
- webhook completion;
- polling fallback;
- dead-letter state;
- lease/heartbeat;
- worker crash recovery;
- concurrency limits per provider/model/user;
- per-plan queue priority;
- progress events;
- output ingestion;
- reservation settlement;
- alerting.

Every provider request maps to exactly one internal attempt record. A user job may have multiple attempts, but only one successful settlement.

## 2.4 Helmies-controlled object storage

Replace local `public/` persistence for uploads and generated media with S3-compatible object storage.

Requirements:

- private-by-default buckets;
- signed read URLs or controlled media proxy;
- content-type validation;
- maximum size and dimensions/duration;
- virus/malware scanning where practical;
- image re-encoding to remove active payloads and metadata;
- reject SVG as user upload unless sanitized and served from an isolated domain;
- output ingestion from provider URL into Helmies storage;
- checksum and content-length validation;
- storage lifecycle rules;
- deletion and retention jobs;
- user export and deletion support;
- thumbnails and transcoded previews;
- CDN cache policy;
- no permanent dependency on provider URLs.

## 2.5 Configuration and secrets

Provider secrets must not remain plaintext in the application database.

Implement:

- environment secret references or managed secret store;
- encrypted-at-rest fallback using a master key outside the database;
- key rotation;
- last-four/prefix display only;
- permission-gated secret update;
- audit logging;
- no secret value returned after write;
- no secrets in logs, traces, analytics, error messages, prompts, client bundles, source maps, or database snapshots used by developers.

---

# 3. Authentication, Authorization and Account Security

## 3.1 Authentication coverage

Fully implement and test:

- Google OAuth;
- email/password registration;
- email verification;
- password reset;
- password change;
- logout from current session;
- logout from all sessions;
- session expiry;
- account deletion;
- disabled/banned account behavior;
- admin role changes;
- invitation flow if teams are enabled later.

Password requirements:

- minimum 12 characters or a modern strength meter;
- allow password managers and paste;
- bcrypt/Argon2id with reviewed cost;
- generic login/reset responses to prevent account enumeration;
- rate limiting by account and IP;
- breached-password check may be added without sending full passwords.

## 3.2 Central authorization layer

Create reusable authorization helpers:

```ts
requireSession()
requireUser()
requireAdmin()
requireOwnership(resourceUserId)
requireRole(role)
assertCan(action, resource)
```

Every route must use explicit authorization. Add negative tests for every resource route:

- another user cannot read it;
- another user cannot update it;
- another user cannot delete it;
- user cannot change ownership;
- user cannot set admin-only fields;
- unauthenticated request receives 401 or safe redirect;
- unauthorized request receives 403 without leaking existence or content.

Resources include generations, assets, brand kits, brand assets, projects, memories, workflows, workflow runs, canvas documents, templates, purchases, subscriptions, API keys, analyses, prompt compilations, director runs/shots, contacts, and audit logs.

## 3.3 Session and cookie security

Production cookies:

- `Secure`;
- `HttpOnly`;
- `SameSite=Lax` or stricter where compatible;
- scoped correctly;
- rotated on privilege change;
- protected against fixation;
- no token in local storage.

Use CSRF protection for state-changing browser actions. Validate `Origin`/`Host` on sensitive requests and webhooks separately.

## 3.4 API keys

API keys must:

- be shown once;
- be stored only as a strong hash;
- have prefix, scopes, creation, last use, expiry, revoke state;
- support rotation;
- be rate-limited;
- never grant admin unless explicitly designed;
- produce audit entries;
- reject keys in query strings.

---

# 4. Payment, Subscription, Pricing and Fraud Safety

## 4.1 Stripe source of truth

Use Stripe Checkout or secure Elements. Never handle raw card data.

Webhook rules:

- verify signature against raw request body;
- fail closed;
- allow only configured event types;
- store every event ID;
- process each event idempotently;
- replay-safe;
- asynchronous processing;
- retry-safe;
- log sanitized event metadata;
- alert after repeated failures;
- include a manual replay tool for admins;
- test delayed, duplicate, out-of-order, and missing events.

Subscription access must depend on verified Stripe state, not checkout redirect success.

## 4.2 Plan synchronization

Plans, prices, credits, feature entitlements, limits, and display labels must come from one database-backed plan system.

Required plan fields:

- key and public name;
- Stripe monthly and annual price IDs;
- price;
- currency;
- included credits;
- rollover policy;
- maximum rollover;
- concurrency;
- queue priority;
- storage;
- member seats;
- feature entitlements;
- watermark/commercial rights;
- status;
- display order;
- grandfathering version.

Pricing page, settings, checkout, admin, quote engine, and enforcement all consume the same records.

## 4.3 Server-authoritative model pricing

Client submits desired model and inputs, never endpoint or cost.

Server:

1. resolves active model;
2. resolves allowed provider route;
3. validates input schema;
4. calculates expected provider cost;
5. calculates customer credit cost;
6. applies margin floor;
7. returns signed/short-lived quote;
8. verifies quote on execution;
9. reserves credits;
10. runs job;
11. stores actual provider cost;
12. settles difference according to policy.

Prevent price manipulation by testing:

- alternate model IDs;
- stale quote;
- changed duration;
- changed resolution;
- hidden parameter;
- malformed arrays;
- duplicate submit;
- concurrent submit;
- direct API call without quote;
- inactive/deprecated model;
- plan-ineligible model.

## 4.4 Fraud and abuse controls

Implement:

- signup and generation rate limits;
- CAPTCHA or challenge after suspicious behavior;
- disposable-email heuristics;
- free-credit device/IP abuse controls that respect privacy;
- payment risk evaluation;
- limits for new accounts;
- upload scanning;
- prompt and output safety appropriate to provider terms;
- ban and appeal process;
- chargeback response data;
- promo-code redemption limits;
- referral fraud controls;
- admin risk dashboard.

Do not create an invasive fingerprinting system without a documented privacy/legal review.

---

# 5. Model Registry, Provider Gateway and Failure Handling

## 5.1 Model registry

Replace scattered model rules with schemas.

Each model record must include:

- stable internal model ID;
- provider and provider model ID;
- capabilities;
- accepted modalities;
- output modalities;
- dynamic input schema;
- constraints;
- UI schema;
- price rules;
- provider region;
- timeout;
- polling/webhook behavior;
- safety limitations;
- status;
- deprecation/replacement;
- sort and featured state;
- quality/speed/cost labels;
- test fixture;
- last successful health check.

## 5.2 Provider adapter contract

Every provider adapter implements equivalent methods:

```ts
interface ProviderAdapter {
  validateInput(input: unknown, model: ModelDefinition): ValidatedInput;
  quote(input: ValidatedInput, model: ModelDefinition): ProviderQuote;
  submit(input: ValidatedInput, context: SubmitContext): Promise<ProviderSubmission>;
  getStatus(requestId: string): Promise<ProviderStatus>;
  cancel?(requestId: string): Promise<void>;
  normalizeWebhook?(payload: unknown): ProviderStatus;
  normalizeError(error: unknown): NormalizedProviderError;
  healthCheck(): Promise<ProviderHealth>;
}
```

No route, component, workflow, agent, or director step calls a provider directly.

## 5.3 Failure UX

For every generation:

- show queued, preparing, submitted, generating, ingesting, completed, failed, cancelled;
- show real progress only when available; otherwise use honest staged progress;
- preserve form state after failure;
- provide retry;
- explain whether credits were reserved, charged, or released;
- let users copy a support ID;
- never expose provider secrets or raw stack traces;
- detect provider outage and suggest another compatible model;
- avoid duplicate jobs when users double-click;
- cancellation is honest: explain when provider cancellation is impossible and stop further processing/settle correctly.

---

# 6. UX, Popups, Responsive Behavior and Accessibility

## 6.1 Global interaction standards

Every interactive element must have:

- hover where relevant;
- focus-visible state;
- pressed state;
- disabled state with reason;
- loading state;
- minimum 44×44 CSS-pixel touch target where practical;
- accessible name;
- keyboard behavior;
- no layout shift during loading.

Do not disable browser zoom. Respect reduced motion, reduced transparency, contrast preferences, and system font scaling.

## 6.2 Modal, dialog, sheet and popup system

Create one shared, accessible overlay system. Eliminate ad hoc popups.

Required components:

- `Dialog`;
- `AlertDialog`;
- `Drawer`;
- `BottomSheet`;
- `Popover`;
- `Tooltip`;
- `DropdownMenu`;
- `CommandPalette`;
- `Toast`;
- `InlineAlert`;
- `ConfirmAction`.

Rules:

- focus moves into the overlay and returns to the trigger;
- focus is trapped only for modal dialogs;
- Escape closes when safe;
- destructive action requires clear confirmation;
- backdrop click behavior is consistent;
- scrolling behind modal is prevented without causing page jump;
- nested overlays are avoided or correctly layered;
- works with mobile virtual keyboard;
- safe-area insets supported;
- no clipped menu at viewport edge;
- no tooltip-only essential information;
- screen readers announce title, description, errors, and status;
- toast is not the only place for critical errors;
- dialogs remain usable at 320×568 and 200% zoom;
- unsaved work prompts before closing or navigating;
- payment confirmation never appears as success before server verification.

## 6.3 Onboarding

Create an outcome-first onboarding:

1. user goal;
2. creator/business type;
3. preferred outputs;
4. optional brand kit;
5. first guided template;
6. first successful generation;
7. explain credits using concrete examples.

Allow skip and resume. Do not ask twenty questions before value.

## 6.4 Empty, loading, error and offline states

Every page must have all four states.

Implement:

- skeletons that match final shape;
- empty-state action;
- route-level error boundary;
- component-level recovery for expensive editors;
- offline banner;
- reconnect handling;
- queued action behavior;
- upload resume or clear failure;
- form draft persistence;
- graceful session-expired modal that preserves work and resumes after login where possible.

## 6.5 Navigation and information architecture

Keep a single responsive component tree.

Required authenticated navigation:

- Agent;
- Create/Studios;
- Director;
- Workflows;
- Templates;
- Assets;
- Brands;
- Projects;
- Usage/Billing;
- Settings;
- Admin for authorized users.

Mobile must not merely hide essential controls. Use progressive disclosure through sheets, tabs, and inspectors.

## 6.6 Accessibility acceptance

Pass automated axe checks and manual testing for:

- keyboard-only;
- VoiceOver Safari;
- NVDA or equivalent Chromium screen reader;
- 200% and 400% zoom;
- color contrast;
- error identification;
- form labels;
- heading hierarchy;
- landmark regions;
- live generation status;
- canvas/editor alternatives;
- captions/transcripts for audio/video where applicable.

Target WCAG 2.2 AA. Document exceptions that are intrinsic to visual canvas work and provide alternate workflows.

---

# 7. Cross-Browser and Device Quality Contract

## 7.1 Supported browser matrix

Test current and previous major versions when practical:

- Chrome desktop;
- Edge desktop;
- Firefox desktop;
- Safari desktop;
- Chrome Android;
- Safari iOS;
- Samsung Internet if usage warrants;
- installed PWA mode if supported.

## 7.2 Required viewport/device matrix

At minimum:

- 320×568;
- 360×800;
- 390×844;
- 412×915;
- 768×1024 portrait;
- 1024×768 landscape;
- 1280×720;
- 1366×768;
- 1440×900;
- 1920×1080;
- ultrawide sanity check;
- browser zoom 80%, 100%, 125%, 150%, 200%;
- text-size/accessibility font increase on iOS.

## 7.3 Browser-specific risk checks

Test:

- Safari viewport units and address-bar changes;
- iOS safe areas;
- virtual keyboard covering prompt/actions;
- file picker and camera/library upload;
- video autoplay restrictions;
- audio context permissions;
- MediaRecorder support/fallback;
- Web Share fallback;
- clipboard permission fallback;
- download behavior on iOS;
- WebGL/canvas memory pressure;
- Fabric.js pointer/touch gestures;
- drag-and-drop fallback;
- sticky/fixed elements;
- backdrop filter fallback;
- date/time formatting;
- AbortSignal timeout fallback if necessary;
- fetch streaming assumptions;
- large file upload;
- bfcache/back navigation;
- private browsing storage restrictions;
- third-party cookie restrictions;
- OAuth popup/redirect behavior.

## 7.4 Network conditions

E2E test:

- fast connection;
- slow 3G;
- 500 ms latency;
- intermittent disconnect;
- request timeout;
- provider timeout;
- webhook delayed;
- asset URL expired;
- upload interrupted;
- duplicate callback;
- page refresh during generation;
- browser close and return later.

The user must recover the job from server state after returning.

---

# 8. Automated Test Architecture

## 8.1 Tools

Use:

- Vitest for unit and integration tests;
- Testing Library for components;
- Playwright for E2E and browser coverage;
- axe-core for accessibility;
- MSW or controlled provider simulators for deterministic tests;
- Testcontainers or isolated PostgreSQL for integration tests;
- Stripe CLI/test clocks or signed fixture events;
- fake Redis or test Redis for worker tests;
- visual regression screenshots for critical screens.

## 8.2 Test layers

### Unit tests

Cover:

- price calculation;
- credit conversion and rounding;
- margin floor;
- model input validation;
- role/ownership helpers;
- webhook signature wrapper;
- idempotency;
- provider error normalization;
- URL allowlist/public IP checks;
- file type validation;
- plan entitlement;
- quote expiry;
- ledger math;
- template validation;
- prompt compilation;
- state reducers.

### Integration tests

Use a real test database.

Cover:

- registration and session;
- subscription event → entitlement and credits;
- top-up → wallet;
- duplicate event;
- out-of-order subscription events;
- generation reserve → submit → complete → settle;
- generation reserve → failure → release;
- partial provider actual-cost settlement;
- concurrent credit spend;
- workflow run;
- director multi-shot run;
- template purchase/use;
- admin refund;
- ownership isolation;
- account deletion and retention;
- object-storage ingest.

### Contract tests

Each provider/model must have:

- request schema fixture;
- response fixture;
- error fixture;
- status mapping;
- quote fixture;
- webhook fixture if applicable.

Run safe low-cost live smoke tests only for selected enabled providers, behind explicit environment flags and budget caps.

### E2E tests

Required journeys:

1. Visitor → pricing → signup → onboarding → first generation.
2. Google login.
3. Credentials registration, verification, reset.
4. Free user blocked from paid-only capability with clear upgrade dialog.
5. Subscribe monthly.
6. Subscribe annually.
7. Top up credits.
8. Failed payment.
9. Cancel and reactivate.
10. Create image.
11. Image-to-image with upload.
12. Create video and return after refresh.
13. Cancel generation.
14. Provider failure and retry.
15. Create/edit brand kit.
16. Use brand kit in generation.
17. Create workflow from template.
18. Run workflow.
19. Rerun one failed workflow step.
20. Director creates shot plan, runs, reruns one shot, exports.
21. Canvas create, save, reload, version, export.
22. Asset search, filter, download, delete.
23. Admin edits model price and public quote reflects it.
24. Admin disables model and it disappears safely.
25. Promo code lifecycle.
26. Announcement lifecycle.
27. CMS edit/publish/rollback.
28. Session expiry while editing.
29. Account deletion.
30. Cross-user attack attempts.

## 8.3 Visual regression

Capture stable screenshots for:

- landing hero and pricing;
- login;
- onboarding;
- main studio;
- each primary tool;
- model picker;
- generation states;
- templates;
- workflow builder;
- director;
- canvas;
- assets;
- brand kit;
- billing;
- admin;
- dialogs and destructive confirmations;
- mobile navigation;
- 200% zoom.

Mask timestamps, random generation previews, balances, and animated areas.

## 8.4 CI gates

Every pull request runs:

- install from lockfile;
- secret scan;
- lint;
- typecheck;
- unit;
- integration;
- build;
- Playwright Chromium;
- migration test;
- dependency audit.

Main/nightly runs:

- full browser matrix;
- visual regression;
- accessibility;
- live provider smoke tests with hard budget cap;
- Stripe test-clock flows;
- reconciliation;
- dead-code check;
- performance budgets.

No merge when a required job fails.

---

# 9. Security Verification Contract

## 9.1 Threat model

Create a threat model covering:

- anonymous attacker;
- authenticated malicious user;
- abusive free user;
- compromised user;
- malicious admin;
- leaked API key;
- forged webhook;
- provider compromise;
- stored malicious upload;
- SSRF;
- IDOR;
- race condition/double spend;
- prompt injection into agents;
- cross-tenant data leakage;
- supply-chain compromise;
- denial of wallet/provider budget.

## 9.2 Route-level security matrix

Build a machine-readable manifest of every route:

- method;
- authentication;
- authorization;
- owner field;
- input schema;
- rate limit;
- CSRF/origin requirement;
- idempotency;
- audit;
- sensitive output;
- test file.

Fail CI when a state-changing `/api` route is not registered.

## 9.3 Required controls

Implement and test:

- Zod or equivalent validation on every boundary;
- output shaping;
- Content Security Policy with nonce/hash strategy;
- HSTS;
- frame protections;
- MIME sniff prevention;
- Referrer Policy;
- Permissions Policy;
- secure CORS;
- SSRF protection after every redirect and DNS resolution;
- private/reserved IP denial for IPv4 and IPv6;
- request/body/file limits;
- rate limiting;
- log redaction;
- no source maps publicly exposed unless controlled;
- sanitized HTML/Markdown;
- safe image proxy;
- dependency and license scanning;
- SQL injection resistance via Prisma and no raw unsafe query;
- command execution removal or strict fixed allowlists;
- admin re-authentication for dangerous operations;
- audit trail;
- backup encryption;
- restore testing.

## 9.4 Agent and prompt security

The Master Agent must treat user files, websites, model output, metadata, and tool output as untrusted.

Requirements:

- strict tool schemas;
- allowlisted tools;
- per-tool authorization;
- no secret values in model context;
- no model-decided price;
- no arbitrary URL fetch;
- no arbitrary shell/code execution;
- confirmation before external/public/destructive actions;
- maximum steps and spend;
- timeout;
- resumable state;
- prompt-injection test suite;
- memory poisoning controls;
- provenance of generated instructions;
- sanitized tool output;
- human approval for high-impact actions.

## 9.5 External security test

Before broad launch:

- run OWASP ZAP or equivalent authenticated scan against staging;
- run dependency audit;
- run secret scan over git history;
- manually test OWASP Top 10 and API Top 10;
- commission an independent penetration test when revenue permits;
- create vulnerability disclosure instructions.

Critical/high findings block release.

---

# 10. Performance, Reliability and Observability

## 10.1 Performance budgets

Public pages:

- LCP ≤ 2.5 s at p75;
- INP ≤ 200 ms at p75;
- CLS ≤ 0.1;
- initial JS kept minimal;
- responsive optimized images;
- fonts subset/preloaded carefully;
- no blocking third-party script without justification.

Authenticated app:

- route shell interactive quickly;
- lazy-load Fabric, Three.js, video/audio editors;
- virtualize large asset/model lists;
- avoid rerendering complete studio during prompt edits;
- no memory leak during repeated generations;
- free object URLs and media resources;
- unload heavy editor when not used without losing saved state.

## 10.2 Observability

Implement structured logs and tracing for:

- request ID;
- user ID hashed/internal;
- job ID;
- generation ID;
- provider;
- model;
- attempt;
- Stripe event;
- credit reservation/settlement;
- latency;
- normalized error code.

Never log prompt or media by default if it contains user-sensitive content. Provide opt-in diagnostic logging with retention controls.

Metrics:

- signup conversion;
- checkout conversion;
- generation success;
- provider success/latency/cost;
- queue delay;
- credit reconciliation mismatch;
- webhook failure;
- upload failure;
- template completion;
- first-value time;
- retention;
- refund/chargeback;
- gross margin.

Alerts:

- payment webhook failures;
- settlement mismatch;
- provider cost spike;
- abnormal free-credit usage;
- queue backlog;
- error-rate spike;
- object storage failure;
- database saturation;
- auth failure spike;
- CSP reports;
- backup failure.

## 10.3 Graceful degradation

- provider outage: disable/reroute models;
- model outage: offer compatible alternatives;
- Redis outage: stop accepting jobs safely or queue in durable fallback;
- object storage outage: do not mark generation complete until ingest succeeds;
- Stripe outage: show honest state; do not grant access prematurely;
- analytics outage: product continues;
- email outage: queue and retry;
- admin configuration error: last known valid configuration.

---

# 11. Production Templates to Build

Templates are not static prompt cards. Each template must be a versioned, executable workflow with editable inputs, preview, estimated maximum cost, required capabilities, fallback models, brand-kit support, saved outputs, and step-level retry.

Each template record must include:

- ID, slug, name, category, description;
- target user and outcome;
- cover image/video;
- input schema and UI schema;
- workflow graph;
- default model policy, not hard-coded provider;
- quote strategy;
- expected time;
- output manifest;
- editable steps;
- version;
- status;
- featured state;
- ownership/public state;
- tests;
- example project.

## 11.1 Template A — Product Launch Campaign

**Outcome:** Turn product images and brand details into a complete campaign.

Inputs:

- product images;
- product name;
- benefits;
- audience;
- offer;
- brand kit;
- platforms;
- language;
- campaign tone.

Outputs:

- campaign concept;
- key message and hooks;
- hero image;
- 4 social ad images;
- 3 short-video concepts;
- one 10–15 second video;
- captions and CTAs;
- optional voiceover;
- export package.

Steps:

1. inspect product images;
2. extract visual and product attributes;
3. generate three campaign routes;
4. user selects/edits route;
5. generate shot list and copy;
6. create consistent image set;
7. create video;
8. add voice/music where selected;
9. quality review;
10. export.

Acceptance:

- product identity stays recognizable;
- text is not invented as a factual product claim;
- brand colors/logo use respects placement;
- rerunning video does not rerun approved images;
- all assets saved and linked to the project.

## 11.2 Template B — Restaurant Monthly Content Pack

**Outcome:** Create a month of restaurant social content.

Inputs:

- food photos/menu;
- location;
- cuisine;
- offers;
- opening times;
- brand kit;
- platforms;
- languages;
- halal/vegan/allergen facts supplied by owner.

Outputs:

- 12 posts;
- 8 story frames;
- 4 reels concepts;
- 2 generated reels;
- caption calendar;
- offer posters;
- localized copy.

Safety:

- never invent ingredients, allergens, prices, opening times, certifications, or delivery availability;
- mark missing facts;
- retain realistic food appearance;
- avoid materially misleading portion representation.

## 11.3 Template C — Consistent AI Influencer Campaign

Inputs:

- approved identity reference pack;
- persona;
- wardrobe rules;
- prohibited changes;
- location/scene;
- product;
- platform;
- number of posts/videos.

Outputs:

- identity sheet;
- campaign narrative;
- consistent image collection;
- short videos;
- captions;
- voice only when authorized;
- consistency report.

Requirements:

- reference roles and weights;
- face/body consistency checks;
- consent and rights confirmation;
- no public-figure impersonation;
- no minor sexualization;
- save identity fingerprint/version;
- allow shot-level rerun.

## 11.4 Template D — UGC Product Ad

Outputs a believable creator-style vertical ad:

- hook;
- problem;
- product demo;
- benefit;
- social proof only when user supplies legitimate proof;
- CTA;
- captions;
- voiceover;
- 9:16 video.

Include variants:

- energetic;
- calm expert;
- before/after with policy-safe truthful framing;
- unboxing;
- testimonial script without fabricating customer claims.

## 11.5 Template E — E-commerce Product Photography Pack

Inputs:

- product images;
- dimensions/material;
- backgrounds;
- brand style;
- marketplace requirements.

Outputs:

- clean catalog image;
- lifestyle image;
- detail macro;
- feature callout layout;
- seasonal variation;
- transparent cutout;
- aspect ratios for marketplace/social.

Implement product geometry and label-preservation checks.

## 11.6 Template F — Local Business Ad Pack

For salon, gym, café, repair service, clinic/non-medical wellness, and professional service.

Outputs:

- value proposition;
- offer ad;
- local social posts;
- short video;
- Google Business post copy;
- landing-page hero concept.

Never invent reviews, regulated claims, qualifications, prices, or guarantees.

## 11.7 Template G — Music Visualizer and Release Pack

Inputs:

- audio;
- artist references;
- cover direction;
- lyrics only if user owns/provides them;
- platform.

Outputs:

- cover art;
- canvas loop;
- visualizer;
- teaser;
- release posts.

Audio copyright confirmation required.

## 11.8 Template H — Podcast Clip Factory

Inputs:

- uploaded episode;
- speaker names;
- brand kit;
- platforms.

Outputs:

- transcript;
- highlighted moments;
- vertical clips;
- captions;
- titles;
- thumbnails;
- description snippets.

Requirements:

- speaker-aware captions;
- profanity option;
- safe-area layout;
- transcript correction;
- clip boundaries editable;
- no quote fabrication.

## 11.9 Template I — Brand Identity Starter

Outputs:

- brand strategy summary;
- visual directions;
- color systems;
- typography recommendations;
- logo concept prompts, not trademark clearance;
- social avatar;
- post templates;
- brand-kit record.

Provide legal notice that name/logo availability is not guaranteed.

## 11.10 Template J — Real Estate Listing Pack

Inputs:

- authorized property photos;
- factual listing information;
- agent details;
- location privacy setting.

Outputs:

- enhanced photos;
- listing reel;
- feature cards;
- social captions;
- brochure copy.

Never alter structural defects or materially misrepresent property condition. Clearly label virtual staging.

## 11.11 Template K — App/SaaS Launch Pack

Inputs:

- screenshots;
- product facts;
- ICP;
- pricing supplied by owner;
- brand kit.

Outputs:

- landing hero visual;
- feature graphics;
- launch video;
- Product Hunt-style gallery;
- social launch posts;
- ad variants;
- email announcement.

## 11.12 Template L — One Brief to Full Campaign

This is the flagship Agent template.

User enters one business brief. The Agent:

- asks only essential missing questions;
- proposes plan;
- shows maximum credits;
- waits for approval;
- creates project, brand context, images, videos, copy and export;
- pauses for approval at concept and final review;
- can resume later;
- never exceed approved maximum spend.

---

# 12. Template UX and Marketplace

Implement:

- searchable template library;
- filters by outcome, industry, media, duration, credits, difficulty;
- template detail page;
- example outputs;
- “Use template” flow;
- preview without purchase;
- duplicate/customize;
- template versioning;
- publish/unpublish;
- admin review;
- public/private templates;
- purchased-template entitlements;
- creator attribution and revenue sharing only when legally/business-approved;
- report template;
- template analytics;
- test run before publish;
- rollback version;
- broken-model fallback.

A template cannot be published when:

- required model unavailable;
- quote cannot be calculated;
- input schema invalid;
- output step is unhandled;
- test fixture fails;
- unsafe external call exists;
- a step has no retry/recovery behavior.

---

# 13. Admin 10/10 Contract

Admin must provide:

- real-time business overview;
- revenue, MRR, refunds, chargebacks, provider cost, gross margin;
- users and risk;
- plans and entitlements;
- promo codes;
- models and routes;
- provider health;
- pricing simulator;
- margin warnings;
- generation explorer;
- job retry/cancel;
- credit ledger and reconciliation;
- templates;
- workflows;
- CMS;
- announcements/alert header;
- feature flags;
- support contacts;
- audit logs;
- security events;
- data export/deletion requests;
- maintenance mode;
- incident banner.

Dangerous actions require:

- re-authentication;
- typed confirmation for destructive bulk changes;
- reason;
- preview of impact;
- audit;
- reversible design where possible.

The Advisor must use read-only structured data by default and may recommend actions. It cannot change pricing, refund, ban, rotate keys, or publish content without explicit human confirmation.

---

# 14. Release Gates

## Gate A — Code health

- clean install succeeds;
- lint passes with zero warnings;
- typecheck passes;
- build passes;
- no dead launch-critical code;
- no secrets;
- dependency audit has no unaccepted critical/high vulnerability.

## Gate B — Data and money

- migrations tested;
- backup and restore tested;
- wallet reconciliation zero mismatch;
- all Stripe cases pass;
- concurrent spend test passes;
- duplicate webhook/job tests pass;
- margin floor enforced;
- no client-controlled price.

## Gate C — Security

- route manifest complete;
- authorization negative tests pass;
- upload and SSRF tests pass;
- CSP active;
- ZAP scan has no critical/high finding;
- logs contain no secrets;
- admin actions audited.

## Gate D — Product

- all core tools pass one successful and one failed generation simulation;
- templates A–L published only after test run;
- onboarding first-value flow passes;
- assets persist;
- jobs resume after refresh;
- cancellation and refunds are correct.

## Gate E — Browser and accessibility

- full supported browser matrix;
- mobile keyboard safe;
- no horizontal overflow;
- 200% zoom usable;
- keyboard flow complete;
- axe has no serious/critical issue;
- VoiceOver and NVDA core journeys pass.

## Gate F — Operations

- dashboards and alerts working;
- provider kill switch;
- maintenance mode;
- incident runbook;
- rollback tested;
- production smoke test checklist completed.

No public paid launch until Gates A–F pass.

---

# 15. Required Final Deliverables from the Coding Agent

The coding agent must return:

1. all implementation commits;
2. migration files;
3. test suite;
4. test report by gate;
5. browser matrix report;
6. accessibility report;
7. security report;
8. unresolved risk register;
9. provider live-test report and total test spend;
10. screenshots/traces of critical journeys;
11. deployment and rollback instructions;
12. exact environment variables;
13. admin operator guide;
14. user-facing help updates;
15. proof that templates A–L execute;
16. `RELEASE_STATUS.md` with PASS/FAIL for every gate.

Do not declare completion while any gate is FAIL. If an external credential or service is unavailable, implement and test the deterministic simulator, mark the live test as BLOCKED, and provide the exact one-command live test. A blocked live payment/provider test means the public paid launch remains blocked; it does not permit a false PASS.
