# Provider Catalog V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build, deploy, and verify a provider-sourced non-LLM model catalog for KIE and Alibaba that drives Studio validation, quoting, and generation.

**Architecture:** Provider source catalogs normalize into expanded `ModelPricing` rows. Pure catalog and pricing functions validate user parameters and calculate provider-specific costs before the existing reserve/execute/settle generation flow. Studio consumes catalog APIs rather than relying only on the static model registry.

**Tech Stack:** Next.js 16 App Router, JavaScript, Prisma 7, PostgreSQL, Node test runner, KIE Market API, Alibaba Model Studio APIs.

## Global Constraints

- Exclude LLM and chat-completion models.
- Preserve existing model IDs and generation history.
- Never price an unknown model as free.
- Support size-, resolution-, duration-, mode-, count-, and per-second pricing.
- Store source provenance for every synced model.
- Use idempotent database mutations.

### Task 1: Catalog schema and migration

- [ ] Add catalog-v2 columns and indexes to `ModelPricing`.
- [ ] Add an idempotent PostgreSQL migration and upsert script.
- [ ] Regenerate Prisma Client and validate the schema.

### Task 2: Provider catalogs

- [ ] Add a KIE documentation discovery script that excludes LLM pages and emits normalized non-LLM records.
- [ ] Add the official Alibaba non-LLM catalog with regional constraints and current billing rules.
- [ ] Store source URLs, timestamps, and catalog versions.

### Task 3: Validation and pricing

- [ ] Write failing tests for fixed, per-image, per-second, resolution-tiered, mode-tiered, and count-based quotes.
- [ ] Implement pure schema validation and quote resolution.
- [ ] Run tests and confirm all pricing modes pass.

### Task 4: Sync and APIs

- [ ] Replace the partial KIE sync with normalized provider sync.
- [ ] Add Alibaba sync and combined sync commands.
- [ ] Add catalog, detail, and quote APIs with capability filters.

### Task 5: Provider and Studio integration

- [ ] Route generation using provider and endpoint from catalog rows.
- [ ] Validate normalized parameters before credit reservation.
- [ ] Replace static Studio model lists with catalog-backed model data and schema-driven options.
- [ ] Preserve static catalog fallback when the database is unavailable.

### Task 6: Verification and deployment

- [ ] Run catalog tests, Prisma validation/generation, and production build.
- [ ] Apply the database schema and catalog sync.
- [ ] Commit and push to `main`.
- [ ] Deploy on the production server, restart PM2, and verify logs and production endpoints.
