// BUG 1 — the verification sweep's classifier, tested against RESPONSES
// CAPTURED FROM THE LIVE PROVIDERS on 2026-08-04 (one probe per model, the
// exact bodies are reproduced verbatim below). No network here.
import { describe, it, expect } from "vitest";
import {
  classifyProbeResponse, effectiveStatus, extractRequiredField, isCallableVerdict,
  readVerification, writeVerification, verificationAllowsActive, withProviderRequired,
  buildVerification, classifyNonGenerationEndpoint, isNonGenerationEndpoint, nonGenerationEndpointRule,
  VERDICT, STATUS_PENDING, VERIFICATION_KEY,
} from "@/lib/catalog-verification.mjs";
import { updateForVerdict, selectTargets, buildProbeParams, parseArgs, summarize } from "../../scripts/verify-catalog.mjs";

// ── Captured fixtures ──────────────────────────────────────────────────────
// KIE answers createTask with HTTP 200 and the real status in the envelope.
const KIE_NOT_SUPPORTED = { status: 200, body: { code: 422, msg: "The model name you specified is not supported. Please verify your input and use one of the supported models provided by KIE.", data: null } };
const KIE_REQUIRED_ASPECT = { status: 200, body: { code: 500, msg: "aspect_ratio is required", data: null } };
const KIE_REQUIRED_TEXT = { status: 200, body: { code: 500, msg: "text is required", data: null } };
const KIE_SUCCESS = { status: 200, body: { code: 200, msg: "success", data: { taskId: "5c8f…" } } };
// DashScope.
const ALI_ACCESS_DENIED = { status: 403, body: { code: "AccessDenied", message: "current user api does not support asynchronous calls", request_id: "b18633d8" } };
const ALI_SYNC_DENIED = { status: 403, body: { code: "AccessDenied", message: "current user api does not support synchronous calls", request_id: "2c6fe199" } };
const ALI_BAD_SIZE = { status: 400, body: { request_id: "a3ebc71a", code: "InvalidParameter", message: "The size does not match the allowed size 1664*928,1472*1104,1328*1328,1104*1472,928*1664." } };
const ALI_AREA = { status: 400, body: { request_id: "62f5ffa4", code: "InvalidParameter", message: "Image area must be between 262144 and 4194304 pixels. Got area=9 (width=3, height=3)." } };
const ALI_DATA_INSPECTION = { status: 400, body: { request_id: "7d5e8665", code: "InvalidParameter.DataInspection", message: "Failed to find the requested media resource during the data inspection process" } };
const ALI_MODEL_NOT_EXIST = { status: 404, body: { code: "InvalidParameter", message: "Model not exist.", request_id: "db111b3e" } };
const ALI_TASK_CREATED = { status: 200, body: { output: { task_id: "26dc3acf", task_status: "PENDING" }, request_id: "1f9ef5a8" } };
const ALI_SYNC_IMAGE = { status: 200, body: { output: { choices: [{ message: { content: [{ image: "https://dashscope…/9890a9aa.png" }] } }] }, request_id: "1f2b5ef8" } };

describe("effectiveStatus — the provider's real status, not the HTTP one", () => {
  it("reads KIE's numeric envelope code out of an HTTP 200", () => {
    expect(effectiveStatus(KIE_NOT_SUPPORTED)).toBe(422);
    expect(effectiveStatus(KIE_REQUIRED_ASPECT)).toBe(500);
    expect(effectiveStatus(KIE_SUCCESS)).toBe(200);
  });

  it("never mistakes DashScope's STRING code for a status", () => {
    expect(effectiveStatus(ALI_ACCESS_DENIED)).toBe(403);
    expect(effectiveStatus(ALI_BAD_SIZE)).toBe(400);
  });

  it("falls back to the HTTP status when there is no envelope", () => {
    expect(effectiveStatus({ status: 503, body: "gateway" })).toBe(503);
  });
});

describe("classifyProbeResponse — 422 'not supported' means NOT CALLABLE", () => {
  it("classifies KIE's not-supported envelope", () => {
    const c = classifyProbeResponse(KIE_NOT_SUPPORTED);
    expect(c.verdict).toBe(VERDICT.NOT_CALLABLE);
    expect(c.callable).toBe(false);
    expect(c.status).toBe(422);
  });

  it("classifies DashScope's per-route AccessDenied (async and sync wordings alike)", () => {
    expect(classifyProbeResponse(ALI_ACCESS_DENIED).verdict).toBe(VERDICT.NOT_CALLABLE);
    expect(classifyProbeResponse(ALI_SYNC_DENIED).verdict).toBe(VERDICT.NOT_CALLABLE);
  });

  it("classifies 'Model not exist'", () => {
    expect(classifyProbeResponse(ALI_MODEL_NOT_EXIST).verdict).toBe(VERDICT.NOT_CALLABLE);
  });
});

describe("classifyProbeResponse — a required-parameter error means CALLABLE + needs-param", () => {
  it("extracts aspect_ratio from KIE's 500 envelope", () => {
    const c = classifyProbeResponse(KIE_REQUIRED_ASPECT);
    expect(c.verdict).toBe(VERDICT.NEEDS_PARAM);
    expect(c.callable).toBe(true);
    expect(c.missingField).toBe("aspect_ratio");
  });

  it("extracts `text` for the ElevenLabs speech model", () => {
    expect(classifyProbeResponse(KIE_REQUIRED_TEXT).missingField).toBe("text");
  });

  it("extracts a dotted field path's leaf ('Field required: input.media')", () => {
    expect(extractRequiredField("Field required: input.media")).toBe("media");
  });

  it("treats a model's own parameter validator as proof it is reachable", () => {
    for (const fixture of [ALI_BAD_SIZE, ALI_AREA, ALI_DATA_INSPECTION]) {
      const c = classifyProbeResponse(fixture);
      expect(c.verdict).toBe(VERDICT.NEEDS_PARAM);
      expect(c.callable).toBe(true);
    }
  });
});

describe("classifyProbeResponse — 2xx means CALLABLE", () => {
  it("classifies a KIE task creation", () => {
    expect(classifyProbeResponse(KIE_SUCCESS).verdict).toBe(VERDICT.CALLABLE);
  });

  it("classifies a DashScope async task and a DashScope synchronous image", () => {
    expect(classifyProbeResponse(ALI_TASK_CREATED).verdict).toBe(VERDICT.CALLABLE);
    expect(classifyProbeResponse(ALI_SYNC_IMAGE).verdict).toBe(VERDICT.CALLABLE);
  });
});

describe("classifyProbeResponse — a transient failure is INCONCLUSIVE and never deactivates", () => {
  it("never deactivates on an unrelated 5xx", () => {
    const c = classifyProbeResponse({ status: 502, body: { message: "Bad Gateway" } });
    expect(c.verdict).toBe(VERDICT.INCONCLUSIVE);
    expect(c.callable).toBeNull();
  });

  it("never deactivates on a rate limit", () => {
    expect(classifyProbeResponse({ status: 429, body: { message: "Too Many Requests" } }).verdict).toBe(VERDICT.INCONCLUSIVE);
  });

  it("never deactivates on a transport failure", () => {
    expect(classifyProbeResponse({ error: new Error("ETIMEDOUT") }).verdict).toBe(VERDICT.INCONCLUSIVE);
  });

  it("never deactivates on an auth/quota problem — that is about our key, not the model", () => {
    expect(classifyProbeResponse({ status: 401, body: { message: "Unauthorized" } }).verdict).toBe(VERDICT.INCONCLUSIVE);
    expect(classifyProbeResponse({ status: 402, body: { message: "insufficient balance" } }).verdict).toBe(VERDICT.INCONCLUSIVE);
  });

  it("never deactivates on an unrecognised 400", () => {
    expect(classifyProbeResponse({ status: 400, body: { message: "something we have never seen" } }).verdict).toBe(VERDICT.INCONCLUSIVE);
  });
});

describe("verdict storage — no schema column invented", () => {
  it("round-trips a verdict through the existing constraints Json blob, preserving what was there", () => {
    const constraints = { maxOutputs: 4 };
    const next = writeVerification(constraints, { status: "verified", callable: true });
    expect(next.maxOutputs).toBe(4);
    expect(readVerification(next)).toMatchObject({ callable: true });
    expect(Object.keys(next)).toContain(VERIFICATION_KEY);
  });

  it("verificationAllowsActive: verified-callable yes, verified-not-callable no, pending no, absent keeps the fallback", () => {
    expect(verificationAllowsActive({ [VERIFICATION_KEY]: { status: "verified", callable: true } })).toBe(true);
    expect(verificationAllowsActive({ [VERIFICATION_KEY]: { status: "verified", callable: false } })).toBe(false);
    expect(verificationAllowsActive({ [VERIFICATION_KEY]: { status: STATUS_PENDING } })).toBe(false);
    expect(verificationAllowsActive({}, true)).toBe(true);
    expect(verificationAllowsActive(null, false)).toBe(false);
  });

  it("withProviderRequired merges without duplicating and returns the same object when nothing changes", () => {
    const base = { fields: {}, providerRequired: ["aspect_ratio"] };
    expect(withProviderRequired(base, "aspect_ratio")).toBe(base);
    expect(withProviderRequired(base, "duration").providerRequired).toEqual(["aspect_ratio", "duration"]);
    expect(withProviderRequired({ fields: {} }, null)).toEqual({ fields: {} });
  });

  it("isCallableVerdict treats needs-param as callable", () => {
    expect(isCallableVerdict(VERDICT.NEEDS_PARAM)).toBe(true);
    expect(isCallableVerdict(VERDICT.CALLABLE)).toBe(true);
    expect(isCallableVerdict(VERDICT.NOT_CALLABLE)).toBe(false);
    expect(isCallableVerdict(VERDICT.INCONCLUSIVE)).toBe(false);
  });
});

// ── BUG 1: non-generation documentation endpoints filed as "models" ────────
// Measured on live production (2026-08-05): these five Suno voice-clone doc
// pages were ACTIVE in the audio pool and visible in the Music studio's
// model picker, even though none of them is a model a generation can be
// submitted to — they're a webhook receiver, a status/record lookup, and a
// standalone request validator (with/without its own callback). Checked
// against the id's own BASENAME with a token-boundary anchor, never a bare
// substring, specifically so this can never sweep up a real generator that
// happens to share a word.
describe("classifyNonGenerationEndpoint / isNonGenerationEndpoint — deterministic, zero-probe classification", () => {
  const JUNK_IDS = [
    "suno-voice-generate-callback",
    "suno-voice-record-info",
    "suno-voice-validate",
    "suno-voice-validate-callback",
    "suno-voice-validate-info",
  ];

  it("classifies every one of the five production junk ids as not-callable", () => {
    for (const id of JUNK_IDS) {
      expect(isNonGenerationEndpoint(id), `${id} should be excluded`).toBe(true);
      const c = classifyNonGenerationEndpoint(id);
      expect(c.verdict).toBe(VERDICT.NOT_CALLABLE);
      expect(c.callable).toBe(false);
      expect(c.reason).toMatch(/documentation endpoint/i);
    }
  });

  it("names the specific rule that matched, for an operator reading the reason", () => {
    expect(nonGenerationEndpointRule("suno-voice-generate-callback")).toBe("callback");
    expect(nonGenerationEndpointRule("suno-voice-validate")).toBe("validate");
    expect(nonGenerationEndpointRule("suno-voice-record-info")).toBe("info");
  });

  it("never touches the real generator these doc pages are ABOUT, or its sibling actions — no bare 'generate'/'get' substring match", () => {
    for (const id of ["suno-voice-generate", "suno-voice-regenerate", "suno-voice-check-voice"]) {
      expect(isNonGenerationEndpoint(id), `${id} must stay usable`).toBe(false);
      expect(classifyNonGenerationEndpoint(id)).toBeNull();
    }
  });

  it("does not fire on a legitimate id that merely CONTAINS 'info' or 'get' inside a longer word, not as an anchored token", () => {
    for (const id of ["infographic-generator", "vegetable-generator", "get-image-2", "budget-video"]) {
      expect(isNonGenerationEndpoint(id), `${id} must not be excluded`).toBe(false);
    }
  });

  it("leaves real, currently-uncallable generator ids alone — provider-side callability is the probe sweep's job, not this static rule's", () => {
    // Confirmed via live probing (2026-08-05): all 422 "model name not
    // supported", yet none of these ids carries a callback/validate/info
    // token, so this classifier correctly stays silent about them —
    // scripts/verify-catalog.mjs's network sweep is what decides.
    for (const id of [
      "generate-music", "kling/kling-3-0", "kling/text-to-video", "kling/v2-1-standard",
      "bytedance/seedance-2-fast", "bytedance/seedance-1-5-pro",
    ]) {
      expect(isNonGenerationEndpoint(id), `${id} is not a documentation-endpoint pattern`).toBe(false);
    }
    // And a sibling under the SAME vendor prefix that IS callable — this
    // rule was never vendor-prefix-based, so it correctly ignores this
    // fact too (neither confirms nor denies callability; it only ever
    // recognizes a structural doc-page id shape).
    expect(isNonGenerationEndpoint("bytedance/seedance-2")).toBe(false);
  });

  it("matches against the final '/'-segment only, ignoring any vendor/folder prefix", () => {
    expect(isNonGenerationEndpoint("suno-api/suno-voice-validate")).toBe(true);
    expect(isNonGenerationEndpoint("validate/suno-voice-generate")).toBe(false);
  });
});

describe("buildVerification — the shared stored-verification shape (probe or static-rule alike)", () => {
  it("builds the exact shape scripts/verify-catalog.mjs's updateForVerdict writes from a real probe classification", () => {
    const v = buildVerification(classifyProbeResponse(KIE_NOT_SUPPORTED));
    expect(v).toMatchObject({ status: "verified", verdict: VERDICT.NOT_CALLABLE, callable: false, providerStatus: 422 });
    expect(v.checkedAt).toBeTruthy();
  });

  it("builds a not-callable block from the static id-rule classifier, flagged with its own method so it's never mistaken for a spent probe", () => {
    const v = buildVerification(classifyNonGenerationEndpoint("suno-voice-validate"));
    expect(v).toMatchObject({ status: "verified", verdict: VERDICT.NOT_CALLABLE, callable: false, method: "static-id-rule" });
  });

  it("returns null for null input", () => {
    expect(buildVerification(null)).toBeNull();
  });
});

// ── scripts/verify-catalog.mjs — pure parts ────────────────────────────────
describe("verify-catalog: updateForVerdict", () => {
  const row = { id: "r1", modelId: "flux-2/pro-text-to-image", constraints: { maxOutputs: 4 }, inputSchema: { fields: {} }, isActive: true };

  it("deactivates a not-callable model and records why", () => {
    const data = updateForVerdict(row, classifyProbeResponse(KIE_NOT_SUPPORTED));
    expect(data.isActive).toBe(false);
    expect(readVerification(data.constraints)).toMatchObject({ callable: false, verdict: VERDICT.NOT_CALLABLE });
    expect(readVerification(data.constraints).reason).toMatch(/not supported/i);
    expect(data.constraints.maxOutputs).toBe(4);
  });

  it("keeps a needs-param model active and records the missing field for the payload builder", () => {
    const data = updateForVerdict(row, classifyProbeResponse(KIE_REQUIRED_ASPECT));
    expect(data.isActive).toBe(true);
    expect(data.inputSchema.providerRequired).toEqual(["aspect_ratio"]);
  });

  it("keeps a 2xx model active", () => {
    expect(updateForVerdict(row, classifyProbeResponse(KIE_SUCCESS)).isActive).toBe(true);
  });

  it("writes NOTHING for an inconclusive probe", () => {
    expect(updateForVerdict(row, classifyProbeResponse({ status: 502, body: {} }))).toBeNull();
    expect(updateForVerdict(row, classifyProbeResponse({ error: new Error("socket hang up") }))).toBeNull();
  });

  it("is idempotent — re-applying the same verdict yields the same isActive and no duplicated field", () => {
    const first = updateForVerdict(row, classifyProbeResponse(KIE_REQUIRED_ASPECT));
    const applied = { ...row, ...first };
    const second = updateForVerdict(applied, classifyProbeResponse(KIE_REQUIRED_ASPECT));
    expect(second.isActive).toBe(first.isActive);
    expect(second.inputSchema?.providerRequired ?? applied.inputSchema.providerRequired).toEqual(["aspect_ratio"]);
    const third = updateForVerdict({ ...applied, ...second }, classifyProbeResponse(KIE_REQUIRED_ASPECT));
    expect(third.inputSchema).toBeUndefined(); // nothing left to merge
  });
});

describe("verify-catalog: target selection and cost discipline", () => {
  const rows = [
    { modelId: "cheap", providerName: "KIE", providerCost: 0.01, isActive: true, isDeprecated: false, constraints: {} },
    { modelId: "pricey", providerName: "KIE", providerCost: 1.28, isActive: true, isDeprecated: false, constraints: {} },
    { modelId: "alibaba:qwen-image-max", providerName: "Alibaba", providerModelId: "qwen-image-max", providerCost: 0.075, isActive: true, isDeprecated: false, constraints: {} },
    { modelId: "dead", providerName: "KIE", providerCost: 0.02, isActive: true, isDeprecated: true, constraints: {} },
    { modelId: "off", providerName: "KIE", providerCost: 0.02, isActive: false, isDeprecated: false, constraints: {} },
    { modelId: "brand-new", providerName: "KIE", providerCost: 0.03, isActive: false, isDeprecated: false, constraints: { verification: { status: STATUS_PENDING } } },
  ];

  it("skips deprecated rows and rows an operator switched off, but picks up sync-pending ones", () => {
    const ids = selectTargets(rows).map((r) => r.modelId);
    expect(ids).not.toContain("dead");
    expect(ids).not.toContain("off");
    expect(ids).toContain("brand-new");
  });

  it("orders cheapest-first so --limit probes the least expensive models", () => {
    expect(selectTargets(rows).map((r) => r.modelId)).toEqual(["cheap", "brand-new", "alibaba:qwen-image-max", "pricey"]);
    expect(selectTargets(rows, { limit: 2 }).map((r) => r.modelId)).toEqual(["cheap", "brand-new"]);
  });

  it("filters by provider and by --only (accepting the public, prefix-stripped id)", () => {
    expect(selectTargets(rows, { provider: "alibaba" }).map((r) => r.modelId)).toEqual(["alibaba:qwen-image-max"]);
    expect(selectTargets(rows, { only: ["qwen-image-max"] }).map((r) => r.modelId)).toEqual(["alibaba:qwen-image-max"]);
  });

  it("summarize bills ONLY the accepted probes — a rejected submit is free", () => {
    const { counts, spend } = summarize([
      { row: { providerCost: 1.28 }, classification: classifyProbeResponse(KIE_NOT_SUPPORTED) },
      { row: { providerCost: 0.045 }, classification: classifyProbeResponse(KIE_REQUIRED_ASPECT) },
      { row: { providerCost: 0.012 }, classification: classifyProbeResponse(KIE_SUCCESS) },
    ]);
    expect(counts).toMatchObject({ "not-callable": 1, "needs-param": 1, callable: 1 });
    expect(spend).toBeCloseTo(0.012, 6);
  });

  it("builds the cheapest viable probe payload: one output, shortest duration, no invented content", () => {
    const params = buildProbeParams({
      modelId: "wan/i2v",
      inputSchema: {
        fields: {
          prompt: { type: "string", required: true },
          image_url: { type: "string", required: true, format: "uri" },
          duration: { type: "number", required: true, enum: [10, 5, 15] },
          resolution: { type: "string", required: true, enum: ["720p", "1080p"] },
          n: { type: "number", required: false, maximum: 4 },
        },
      },
    }, { assetUrl: "https://example.test/a.png" });
    expect(params.duration).toBe(5);
    expect(params.n).toBe(1);
    expect(params.resolution).toBe("720p");
    expect(params.image_url).toBe("https://example.test/a.png");
    expect(params.prompt).toBeUndefined();
  });
});

describe("verify-catalog: parseArgs defaults to a dry run", () => {
  it("writes nothing unless BOTH --apply and --yes are given", () => {
    expect(parseArgs([])).toMatchObject({ apply: false, yes: false, force: false });
    expect(parseArgs(["--apply"])).toMatchObject({ apply: true, yes: false });
    expect(parseArgs(["--apply", "--yes"])).toMatchObject({ apply: true, yes: true });
  });

  it("parses --limit / --only / --provider in both spellings", () => {
    expect(parseArgs(["--limit", "25", "--provider", "KIE"])).toMatchObject({ limit: 25, provider: "kie" });
    expect(parseArgs(["--limit=10", "--only=a,b", "--provider=alibaba"])).toMatchObject({ limit: 10, only: ["a", "b"], provider: "alibaba" });
  });
});
