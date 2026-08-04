#!/usr/bin/env node
/**
 * Catalog verification sweep (BUG 1).
 *
 * The KIE half of the catalog is built by crawling docs.kie.ai's sitemap and
 * turning DOC-PAGE PATHS into model ids (src/lib/kie-sync.js). A doc page is
 * not proof of a callable model, so many stored ids are ids the provider's
 * API has never heard of — which is why 27 of the 32 generations this app has
 * ever run failed, most of them with "The model name you specified is not
 * supported".
 *
 * This sweep sends ONE minimal submit probe per model and classifies the
 * answer (src/lib/catalog-verification.mjs — pure, fixture-tested):
 *
 *   not-callable   the provider rejected the MODEL ("…not supported",
 *                  "Model not exist", DashScope AccessDenied)
 *                  → isActive:false, verdict recorded
 *   needs-param    the provider rejected the PARAMETERS ("aspect_ratio is
 *                  required", "size does not match the allowed size")
 *                  → callable; stays/becomes active, and the missing field
 *                    name is recorded so src/lib/provider-payload-core.mjs
 *                    fills it on every future submit
 *   callable       2xx — the submit was accepted
 *                  → stays/becomes active
 *   inconclusive   transport failure, 429, 401/quota, unrelated 5xx
 *                  → NOTHING is written. A transient failure must never
 *                    deactivate a model.
 *
 * COST DISCIPLINE
 *   A rejected submit costs nothing; an ACCEPTED one costs real money. So:
 *     • dry-run is the default — it writes nothing and calls nothing;
 *     • probes use the cheapest viable parameters and each model is probed
 *       at most once per run;
 *     • --limit N and --only <ids> keep a run small;
 *     • the worst-case spend (every probe accepted) is printed BEFORE any
 *       network call, and the actual spend (2xx probes only) after.
 *
 * SAFETY
 *   • Writes require BOTH --apply and --yes.
 *   • A run in which EVERY probe came back not-callable is refused (that is
 *     the signature of a dead API key or a provider outage, not a dead
 *     catalog) unless --force is passed.
 *   • Only ModelPricing.isActive, .constraints.verification and
 *     .inputSchema.providerRequired are ever written. No schema change, no
 *     migration, nothing else touched.
 *
 * USAGE
 *   node scripts/verify-catalog.mjs                          # dry run, all providers
 *   node scripts/verify-catalog.mjs --provider kie --limit 25
 *   node scripts/verify-catalog.mjs --only flux-2/pro-text-to-image
 *   node scripts/verify-catalog.mjs --provider kie --limit 25 --apply --yes
 */
import { config } from "dotenv";
config();

import { pathToFileURL } from "node:url";
import prisma from "../src/lib/prisma.js";
import { PROVIDERS, resolveAdapterKey } from "../src/lib/providers.js";
import { applyRequiredDefaults } from "../src/lib/provider-payload-core.mjs";
import {
  classifyProbeResponse, VERDICT, isCallableVerdict,
  readVerification, writeVerification, withProviderRequired, STATUS_PENDING, VERIFICATION_KEY,
} from "../src/lib/catalog-verification.mjs";

const PROBE_PROMPT = "a plain grey square";
const DEFAULT_ASSET_URL = `${process.env.NEXTAUTH_URL || "https://studio.helmies.fi"}/favicon-512x512.png`;

export function parseArgs(argv) {
  const args = {
    apply: false, yes: false, force: false, json: false,
    limit: 0, only: [], provider: null, assetUrl: DEFAULT_ASSET_URL, delayMs: 400,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") args.apply = true;
    else if (a === "--yes") args.yes = true;
    else if (a === "--force") args.force = true;
    else if (a === "--json") args.json = true;
    else if (a === "--limit") args.limit = Number(argv[++i]) || 0;
    else if (a.startsWith("--limit=")) args.limit = Number(a.slice(8)) || 0;
    else if (a === "--only") args.only = String(argv[++i] || "").split(",").map((s) => s.trim()).filter(Boolean);
    else if (a.startsWith("--only=")) args.only = a.slice(7).split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--provider") args.provider = String(argv[++i] || "").toLowerCase() || null;
    else if (a.startsWith("--provider=")) args.provider = a.slice(11).toLowerCase() || null;
    else if (a === "--asset-url") args.assetUrl = String(argv[++i] || DEFAULT_ASSET_URL);
    else if (a === "--delay-ms") args.delayMs = Number(argv[++i]) || 0;
  }
  return args;
}

/**
 * The cheapest payload that still reaches the model: the prompt, whatever
 * asset URLs the schema makes mandatory (a placeholder — an unfetchable asset
 * produces a FREE "media not found" rejection that still proves the model is
 * reachable), one output, and then the required-parameter defaulting the real
 * submit path applies. Never asks for more than one image / the shortest
 * duration, so an accepted probe is billed at the model's floor price.
 */
export function buildProbeParams(row, { assetUrl = DEFAULT_ASSET_URL } = {}) {
  const schema = row?.inputSchema || null;
  const fields = schema?.fields || {};
  const params = {};

  for (const [name, field] of Object.entries(fields)) {
    if (!field?.required) continue;
    if (name === "prompt" || name === "text") continue; // supplied separately
    if (/_url$/.test(name)) params[name] = assetUrl;
    else if (name === "images_list" || name === "reference_images") params[name] = [assetUrl];
  }
  // Cheapest quantity, always — never inherit a schema maximum.
  if (fields.n) params.n = 1;
  if (fields.num_images) params.num_images = 1;
  if (fields.duration?.enum?.length) params.duration = fields.duration.enum.slice().sort((a, b) => a - b)[0];

  const { params: withDefaults } = applyRequiredDefaults(params, schema, { modelId: row?.modelId });
  return withDefaults;
}

/** One real submit against the provider, through the SAME adapter production uses. */
export async function probeModel(row, { assetUrl, fetchImpl = fetch } = {}) {
  const adapterKey = resolveAdapterKey(row.providerName);
  const provider = PROVIDERS[adapterKey];
  if (!provider) return { error: new Error(`no adapter for provider ${row.providerName}`) };
  const key = provider.getKey();
  if (!key) return { error: new Error(`${adapterKey.toUpperCase()} key not configured`) };

  const endpoint = row.endpoint || row.providerModelId || row.modelId;
  const providerModelId = row.providerModelId || row.modelId;
  const params = { ...buildProbeParams(row, { assetUrl }), endpoint };
  const body = provider.formatPayload(providerModelId, PROBE_PROMPT, params);
  const headers = typeof provider.headers === "function" ? provider.headers(endpoint) : provider.headers;

  try {
    const res = await fetchImpl(`${provider.baseUrl}${provider.buildUrl(endpoint)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, ...(headers || {}) },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    });
    const text = await res.text();
    let parsed = text;
    try { parsed = JSON.parse(text); } catch { /* keep the raw text */ }
    return { status: res.status, body: parsed, raw: text.slice(0, 400) };
  } catch (error) {
    return { error };
  }
}

/**
 * The database write a verdict implies — or null for "write nothing".
 * Pure and idempotent: applying the same verdict to an already-updated row
 * produces the identical isActive / providerRequired values (checkedAt is the
 * only field that moves), and a discovered field name is merged, never
 * appended twice.
 */
export function updateForVerdict(row, classification, { now = new Date() } = {}) {
  if (!classification || classification.verdict === VERDICT.INCONCLUSIVE) return null;

  const callable = isCallableVerdict(classification.verdict);
  const verification = {
    status: "verified",
    verdict: classification.verdict,
    callable,
    reason: classification.reason,
    providerStatus: classification.status,
    checkedAt: now.toISOString(),
  };

  const data = {
    isActive: callable,
    constraints: writeVerification(row.constraints, verification),
  };

  if (classification.missingField) {
    const nextSchema = withProviderRequired(row.inputSchema, classification.missingField);
    if (nextSchema !== row.inputSchema) data.inputSchema = nextSchema;
  }
  return data;
}

/** Rows the sweep is allowed to probe. */
export function selectTargets(rows, { only = [], provider = null, limit = 0 } = {}) {
  let out = rows.filter((row) => {
    if (row.isDeprecated) return false;
    // Active rows, plus rows the defensive sync parked as "pending" (never
    // probed) — those are exactly what the sweep exists to adjudicate.
    const pending = readVerification(row.constraints)?.status === STATUS_PENDING;
    return row.isActive === true || pending;
  });
  if (provider) out = out.filter((row) => resolveAdapterKey(row.providerName) === provider);
  if (only.length) {
    const wanted = new Set(only.map((s) => s.toLowerCase()));
    out = out.filter((row) => wanted.has(row.modelId.toLowerCase()) || wanted.has(String(row.providerModelId || "").toLowerCase()));
  }
  out.sort((a, b) => (a.providerCost || 0) - (b.providerCost || 0) || a.modelId.localeCompare(b.modelId));
  return limit > 0 ? out.slice(0, limit) : out;
}

export function summarize(results) {
  const counts = { callable: 0, "needs-param": 0, "not-callable": 0, inconclusive: 0 };
  let spend = 0;
  for (const r of results) {
    counts[r.classification.verdict] = (counts[r.classification.verdict] || 0) + 1;
    if (r.classification.verdict === VERDICT.CALLABLE) spend += r.row.providerCost || 0;
  }
  return { counts, spend };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const rows = await prisma.modelPricing.findMany({
    select: {
      id: true, modelId: true, providerName: true, providerModelId: true, endpoint: true,
      capability: true, inputSchema: true, constraints: true, providerCost: true,
      isActive: true, isDeprecated: true,
    },
    orderBy: { modelId: "asc" },
  });
  const targets = selectTargets(rows, args);

  const worstCase = targets.reduce((sum, r) => sum + (r.providerCost || 0), 0);
  console.log(`[verify-catalog] mode=${args.apply ? "APPLY" : "DRY-RUN"} targets=${targets.length}${args.provider ? ` provider=${args.provider}` : ""}`);
  console.log(`[verify-catalog] ESTIMATED WORST-CASE SPEND (if every probe were accepted): $${worstCase.toFixed(4)}`);
  console.log("[verify-catalog] Rejected submits are free; only an accepted (2xx) probe is billed.");

  if (args.apply && !args.yes) {
    console.error("[verify-catalog] refusing to write: --apply also requires --yes");
    process.exitCode = 1;
    return;
  }
  if (!targets.length) {
    console.log("[verify-catalog] nothing to do");
    return;
  }

  const results = [];
  for (const row of targets) {
    const probe = await probeModel(row, { assetUrl: args.assetUrl });
    const classification = classifyProbeResponse(probe);
    results.push({ row, probe, classification });
    console.log(
      `  ${classification.verdict.padEnd(13)} ${row.modelId.padEnd(44)} ` +
      `[${classification.status || "-"}]${classification.missingField ? ` missing=${classification.missingField}` : ""} ${classification.reason.slice(0, 110)}`,
    );
    if (args.delayMs) await new Promise((r) => setTimeout(r, args.delayMs));
  }

  const { counts, spend } = summarize(results);
  console.log(`\n[verify-catalog] ${JSON.stringify(counts)}`);
  console.log(`[verify-catalog] ACTUAL SPEND (accepted probes only): $${spend.toFixed(4)}`);

  const decided = results.filter((r) => r.classification.verdict !== VERDICT.INCONCLUSIVE);
  const allDead = decided.length >= 5 && decided.every((r) => !isCallableVerdict(r.classification.verdict));
  if (allDead && !args.force) {
    console.error("[verify-catalog] REFUSING TO WRITE: every decided probe came back not-callable, which is the signature of a bad key or a provider outage, not a dead catalog. Re-run with --force if this is genuinely correct.");
    process.exitCode = 1;
    return;
  }

  if (!args.apply) {
    console.log("[verify-catalog] dry run — nothing written. Re-run with --apply --yes to persist.");
    if (args.json) console.log(JSON.stringify(results.map((r) => ({ modelId: r.row.modelId, ...r.classification })), null, 2));
    return;
  }

  let written = 0;
  for (const { row, classification } of results) {
    const data = updateForVerdict(row, classification);
    if (!data) continue;
    await prisma.modelPricing.update({ where: { id: row.id }, data });
    written++;
  }
  console.log(`[verify-catalog] wrote ${written} row(s); ${results.length - written} left untouched (inconclusive).`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main()
    .catch((e) => {
      console.error("[verify-catalog] failed:", e?.message || e);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect().catch(() => {}));
}

export { VERIFICATION_KEY, PROBE_PROMPT, DEFAULT_ASSET_URL };
