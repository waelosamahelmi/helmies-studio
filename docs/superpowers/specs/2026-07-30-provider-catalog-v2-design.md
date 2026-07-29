# Provider Catalog V2 Design

## Goal

Replace the partial static media-model registry with a provider-sourced catalog for KIE and Alibaba non-LLM models. The catalog must drive model discovery, input controls, validation, quoting, submission routing, and administration without breaking existing generation records or model IDs.

## Data Model

`ModelPricing` remains the canonical row for a selectable model. Existing columns remain intact. New columns store display metadata, provider endpoint, capability, input/output modalities, request schema, constraints, regions, pricing rules, billing unit, source provenance, lifecycle state, and deterministic sorting.

Pricing is represented as JSON rules because providers bill by different dimensions: image count, output second, resolution, mode, duration, character count, or fixed task. `providerCost` and `creditsCost` remain denormalized default quotes for backward compatibility.

## Catalog Sources

- KIE: English provider documentation sitemap and individual non-LLM model pages. LLM and chat pages are excluded.
- Alibaba: official Model Studio image, video, audio, and visual-generation documentation and pricing pages. Text-generation Qwen models are excluded; visual Qwen models remain included.
- Every model stores `sourceUrl`, `sourceUpdatedAt`, and `catalogVersion`.

## Runtime

- Catalog APIs return normalized model records filtered by capability and active state.
- Quote calculation validates request parameters against the model schema, resolves the matching pricing rule, applies provider markup, and returns provider cost, retail credits, and a breakdown.
- Provider routing uses the model row's provider and endpoint. Provider payload formatting maps normalized Studio parameters to the provider-native schema.
- Studio model pickers receive image, capability, cost preview, size, duration, and requirement metadata from the API.

## Safety

- No model rows are deleted by sync.
- A provider sync only deactivates rows previously managed by that provider and absent from the new provider catalog.
- Existing IDs and generation history remain valid.
- Unknown pricing cannot be treated as free; unpriced models are disabled until reviewed.
- Failed validation never reserves credits or submits provider work.

## Delivery

- Prisma schema update.
- Idempotent SQL migration/upsert script.
- Versioned KIE and Alibaba catalog source files.
- Catalog normalization, validation, and pricing engine.
- Catalog and quote APIs.
- Provider routing and Studio integration.
- Automated catalog/pricing tests, Prisma generation, production build, database deployment, Git push, server deployment, and production health verification.

