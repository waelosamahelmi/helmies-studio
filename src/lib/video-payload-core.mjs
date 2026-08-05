// ── Dedicated VIDEO API adapters (audit class E — video-dedicated.md) ──────
// KIE's Runway, Runway Aleph and Veo3.1 families each live on their OWN
// endpoints with flat bodies and their own poll routes — none of them speaks
// the generic Market envelope, so every submit through the old single-route
// KIE adapter 422'd ("model name not supported"):
//
//   Runway generate  POST /api/v1/runway/generate     poll GET /api/v1/runway/record-detail
//   Runway extend    POST /api/v1/runway/extend       poll: same record-detail
//   Aleph (v2v)      POST /api/v1/aleph/generate      poll GET /api/v1/aleph/record-info
//   Veo3 generate    POST /api/v1/veo/generate        poll GET /api/v1/veo/record-info
//   Veo3 extend      POST /api/v1/veo/extend          poll: same record-info
//
// Veo3's 1080p/4K tiers are NOT delivered by the base poll: the base task
// completes at 720p and the higher-resolution asset must be fetched from a
// SEPARATE endpoint afterwards (GET /api/v1/veo/get-1080p-video within a
// ~1-3 minute window; POST /api/v1/veo/get-4k-video within ~5-10 minutes).
// That follow-up is modelled INSIDE this adapter's poll contract as a small
// state machine (see parseVeoPoll below): the poll simply keeps reporting
// "pending" until the FINAL asset URL exists, so job-runner needs no special
// casing and the ordinary 30-minute job lease/timeout covers the whole wait.
//
// Mirrors src/lib/audio-payload-core.mjs: canonical studio params in, exact
// per-family provider body/path out; providers.js delegates here and learns
// no field spellings itself. Content is never invented; each family forwards
// a whitelist. Dependency-free (loaded under plain node via scripts/worker.mjs).

export const VIDEO_FAMILY = {
  RUNWAY: "runway",
  RUNWAY_EXTEND: "runway-extend",
  ALEPH: "aleph",
  VEO: "veo",
  VEO_EXTEND: "veo-extend",
};

export const RUNWAY_SUBMIT_PATH = "/api/v1/runway/generate";
export const RUNWAY_EXTEND_PATH = "/api/v1/runway/extend";
export const RUNWAY_POLL_PATH = "/api/v1/runway/record-detail";
export const ALEPH_SUBMIT_PATH = "/api/v1/aleph/generate";
export const ALEPH_POLL_PATH = "/api/v1/aleph/record-info";
export const VEO_SUBMIT_PATH = "/api/v1/veo/generate";
export const VEO_EXTEND_PATH = "/api/v1/veo/extend";
export const VEO_POLL_PATH = "/api/v1/veo/record-info";
export const VEO_1080P_PATH = "/api/v1/veo/get-1080p-video";
export const VEO_4K_PATH = "/api/v1/veo/get-4k-video";

function normalizeId(modelId) {
  const raw = String(modelId || "").toLowerCase();
  return {
    raw,
    slashless: raw.replace(/\//g, "-"),
    dotted: raw.replace(/\//g, "-").replace(/(\d)-(\d)/g, "$1.$2"),
  };
}

// The live rows' ids are doc-page slugs, matched as whole tokens.
// `extend-video` must NOT match `extend-ai-video` (and doesn't: the token
// boundary check is against the full "extend-video" run).
const RUNWAY_RE = /(^|[^a-z0-9])generate-ai-video($|[^a-z0-9])/;
const RUNWAY_EXTEND_RE = /(^|[^a-z0-9])extend-ai-video($|[^a-z0-9])/;
const ALEPH_RE = /(^|[^a-z0-9])generate-aleph-video($|[^a-z0-9])|runway-aleph/;
const VEO_RE = /(^|[^a-z0-9])generate-veo-3-video($|[^a-z0-9])/;
const VEO_EXTEND_RE = /(^|[^a-z0-9])extend-video($|[^a-z0-9])/;

/**
 * The dedicated video family a model id belongs to, or null when this module
 * has nothing to say about it.
 */
export function videoProviderFamily(modelId) {
  const { raw, slashless, dotted } = normalizeId(modelId);
  if (!raw) return null;
  const probe = `${raw} ${slashless} ${dotted}`;
  if (ALEPH_RE.test(probe)) return VIDEO_FAMILY.ALEPH;
  if (RUNWAY_EXTEND_RE.test(probe)) return VIDEO_FAMILY.RUNWAY_EXTEND;
  if (RUNWAY_RE.test(probe)) return VIDEO_FAMILY.RUNWAY;
  if (VEO_EXTEND_RE.test(probe)) return VIDEO_FAMILY.VEO_EXTEND;
  if (VEO_RE.test(probe)) return VIDEO_FAMILY.VEO;
  return null;
}

function firstString(...candidates) {
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return null;
}

function asUrlArray(value, max) {
  if (Array.isArray(value)) {
    const urls = value.filter((u) => typeof u === "string" && u);
    return urls.length ? urls.slice(0, max) : null;
  }
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return null;
}

// ── Runway generate ────────────────────────────────────────────────────────
// prompt (req, ≤1800), duration (req, 5|10), quality (req, 720p|1080p),
// imageUrl (opt → i2v mode), aspectRatio (t2v ONLY — the doc says omit it
// when imageUrl is given), waterMark. Cross-constraint (duration 10 caps
// quality at 720p; 1080p caps duration at 5) is left to the provider's own
// validator — a conflicting caller value is never silently rewritten.
export function buildRunwayBody(prompt, params = {}) {
  const body = {};
  const text = firstString(params.prompt, prompt);
  if (text !== null) body.prompt = text;
  const duration = Number(params.duration);
  if ([5, 10].includes(duration)) body.duration = duration;
  const quality = firstString(params.quality, params.resolution);
  if (quality) body.quality = quality;
  const imageUrl = firstString(params.imageUrl, params.image_url) || asUrlArray(params.image_urls, 1)?.[0] || null;
  if (imageUrl) body.imageUrl = imageUrl;
  else {
    const aspect = firstString(params.aspectRatio, params.aspect_ratio);
    if (aspect) body.aspectRatio = aspect;
  }
  const waterMark = firstString(params.waterMark, params.watermark);
  if (waterMark !== null) body.waterMark = waterMark;
  return body;
}

// ── Runway extend ──────────────────────────────────────────────────────────
// taskId (req — a PRIOR Runway generation's task id, not a video URL),
// prompt (req), quality (req), waterMark.
export function buildRunwayExtendBody(prompt, params = {}) {
  const body = {};
  const taskId = firstString(params.taskId, params.task_id);
  if (taskId) body.taskId = taskId;
  const text = firstString(params.prompt, prompt);
  if (text !== null) body.prompt = text;
  const quality = firstString(params.quality, params.resolution);
  if (quality) body.quality = quality;
  const waterMark = firstString(params.waterMark, params.watermark);
  if (waterMark !== null) body.waterMark = waterMark;
  return body;
}

// ── Aleph (Runway video-to-video) ─────────────────────────────────────────
// prompt (req), videoUrl (req), aspectRatio (opt, incl 21:9), seed,
// referenceImage, waterMark, uploadCn.
export function buildAlephBody(prompt, params = {}) {
  const body = {};
  const text = firstString(params.prompt, prompt);
  if (text !== null) body.prompt = text;
  const videoUrl = firstString(params.videoUrl, params.video_url) || asUrlArray(params.video_urls, 1)?.[0] || null;
  if (videoUrl) body.videoUrl = videoUrl;
  const aspect = firstString(params.aspectRatio, params.aspect_ratio);
  if (aspect) body.aspectRatio = aspect;
  const seed = Number(params.seed);
  if (Number.isFinite(seed)) body.seed = seed;
  const ref = firstString(params.referenceImage, params.reference_image, params.image_url);
  if (ref) body.referenceImage = ref;
  const waterMark = firstString(params.waterMark, params.watermark);
  if (waterMark !== null) body.waterMark = waterMark;
  const uploadCn = params.uploadCn ?? params.upload_cn;
  if (typeof uploadCn === "boolean") body.uploadCn = uploadCn;
  return body;
}

// ── Veo3 generate ──────────────────────────────────────────────────────────
// prompt (req), imageUrls (opt, ≤2), model (engine selector — canonical
// studio name is `model_tier`, because submitOnly's payload destructuring
// reserves `model` for the catalog id), generationType, aspect_ratio
// (snake_case here, unlike Runway!), resolution (720p|1080p|4k),
// duration (4|6|8), watermark, enableTranslation.
//
// M-straggler fix (live probes 2026-08-05): the endpoint 422'd
// "Invalid model" on a submit that carried no `model` at all (the old
// builder omitted the field whenever the caller named no tier — which is
// every studio submit), and a follow-up probe proved the version-suffixed
// "veo3.1-fast" spelling is ALSO rejected with the same 422 — the accepted
// engine selectors are exactly the doc's `veo3` / `veo3_fast` / `veo3_lite`
// (docs/model-audit/video-dedicated.md, generate-veo-3-video entry). The
// body therefore ALWAYS carries a `model` (fast tier when the caller named
// none — the doc's own default), and any Veo3.1-style marketing spelling a
// caller supplies is normalized DOWN to the wire enum rather than rejected.
export const VEO_TIERS = ["veo3", "veo3_fast", "veo3_lite"];
export const VEO_DEFAULT_TIER = "veo3_fast";
const VEO_TIER_ALIASES = {
  "veo3": "veo3",
  "veo3.1": "veo3",
  "veo3_1": "veo3",
  "veo3_fast": "veo3_fast",
  "veo3-fast": "veo3_fast",
  "veo3.1-fast": "veo3_fast",
  "veo3.1_fast": "veo3_fast",
  "veo3_lite": "veo3_lite",
  "veo3-lite": "veo3_lite",
  "veo3.1-lite": "veo3_lite",
  "veo3.1_lite": "veo3_lite",
};
export function resolveVeoTier(value) {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  return VEO_TIER_ALIASES[raw] || null;
}
export const VEO_EXTEND_TIERS = ["fast", "quality", "lite"];

export function buildVeoBody(prompt, params = {}) {
  const body = {};
  const text = firstString(params.prompt, prompt);
  if (text !== null) body.prompt = text;
  const imageUrls = asUrlArray(params.imageUrls ?? params.image_urls ?? params.image_url, 2);
  if (imageUrls) body.imageUrls = imageUrls;
  const tier = resolveVeoTier(firstString(params.model_tier, params.modelTier, params.veo_model));
  body.model = tier || VEO_DEFAULT_TIER;
  const generationType = firstString(params.generationType, params.generation_type);
  if (generationType) body.generationType = generationType;
  const aspect = firstString(params.aspect_ratio, params.aspectRatio);
  if (aspect) body.aspect_ratio = aspect;
  const resolution = firstString(params.resolution);
  if (resolution) body.resolution = resolution;
  const duration = Number(params.duration);
  if ([4, 6, 8].includes(duration)) body.duration = duration;
  const watermark = firstString(params.watermark);
  if (watermark) body.watermark = watermark;
  const translation = params.enableTranslation ?? params.enable_translation;
  if (typeof translation === "boolean") body.enableTranslation = translation;
  return body;
}

// ── Veo3 extend ────────────────────────────────────────────────────────────
// taskId (req, a prior veo task), prompt (req), seeds (10000-99999),
// model (fast|quality|lite — a DIFFERENT enum than generate's, same field
// name on the wire), watermark.
export function buildVeoExtendBody(prompt, params = {}) {
  const body = {};
  const taskId = firstString(params.taskId, params.task_id);
  if (taskId) body.taskId = taskId;
  const text = firstString(params.prompt, prompt);
  if (text !== null) body.prompt = text;
  const seeds = Number(params.seeds ?? params.seed);
  if (Number.isFinite(seeds)) body.seeds = seeds;
  const tier = firstString(params.model_tier, params.modelTier)?.toLowerCase();
  if (tier && VEO_EXTEND_TIERS.includes(tier)) body.model = tier;
  const watermark = firstString(params.watermark);
  if (watermark) body.watermark = watermark;
  return body;
}

/**
 * The complete provider request for one dedicated-video submit, or null when
 * the model is not one of the dedicated families. `callBackUrl` is added by
 * providers.js, never here.
 *
 * @returns {{ path: string, body: object, family: string } | null}
 */
export function formatVideoRequest(modelId, prompt, params = {}) {
  const family = videoProviderFamily(modelId);
  if (!family) return null;
  switch (family) {
    case VIDEO_FAMILY.RUNWAY:
      return { family, path: RUNWAY_SUBMIT_PATH, body: buildRunwayBody(prompt, params) };
    case VIDEO_FAMILY.RUNWAY_EXTEND:
      return { family, path: RUNWAY_EXTEND_PATH, body: buildRunwayExtendBody(prompt, params) };
    case VIDEO_FAMILY.ALEPH:
      return { family, path: ALEPH_SUBMIT_PATH, body: buildAlephBody(prompt, params) };
    case VIDEO_FAMILY.VEO:
      return { family, path: VEO_SUBMIT_PATH, body: buildVeoBody(prompt, params) };
    case VIDEO_FAMILY.VEO_EXTEND:
      return { family, path: VEO_EXTEND_PATH, body: buildVeoExtendBody(prompt, params) };
    default:
      return null;
  }
}

/** The submit path a model needs, or null for "the caller's default". */
export function videoSubmitPath(modelId) {
  return formatVideoRequest(modelId, "", {})?.path || null;
}

// ── Poll targets ───────────────────────────────────────────────────────────
// Returns null (caller's default route), a string path, or — for Veo's 4K
// follow-up, which the provider ships as a POST — a { path, method, body }
// descriptor providers.js's poll loop knows how to send.
//
// `state` is the per-poll-loop scratch object providers.js threads through
// buildPollUrl/parsePoll. It is rebuilt empty on a crash-resume, which is
// safe: every stage decision below is re-derivable from the provider's own
// poll bodies (the base record-info re-answers with the task's resolution).
export function videoPollTarget(modelId, requestId, state) {
  const family = videoProviderFamily(modelId);
  if (!family) return null;
  const id = encodeURIComponent(requestId);
  switch (family) {
    case VIDEO_FAMILY.RUNWAY:
    case VIDEO_FAMILY.RUNWAY_EXTEND:
      return `${RUNWAY_POLL_PATH}?taskId=${id}`;
    case VIDEO_FAMILY.ALEPH:
      return `${ALEPH_POLL_PATH}?taskId=${id}`;
    case VIDEO_FAMILY.VEO:
    case VIDEO_FAMILY.VEO_EXTEND: {
      const stage = state?.veoStage;
      if (stage === "1080p") return `${VEO_1080P_PATH}?taskId=${id}`;
      if (stage === "4k") return { path: VEO_4K_PATH, method: "POST", body: { taskId: requestId } };
      return `${VEO_POLL_PATH}?taskId=${id}`;
    }
    default:
      return null;
  }
}

// ── Poll parsing ───────────────────────────────────────────────────────────
export function parseRunwayPoll(data) {
  if (!data || typeof data !== "object") return { status: "pending", outputs: [], error: undefined };
  const stateWord = String(data.state || "").toLowerCase();
  if (stateWord === "fail") {
    return { status: "failed", outputs: [], error: data.failMsg || data.failCode || "generation failed" };
  }
  const url = data.videoInfo?.videoUrl;
  if (stateWord === "success" && typeof url === "string" && url) {
    return { status: "success", outputs: [url], error: undefined };
  }
  // wait / queueing / generating — or success whose asset URL hasn't
  // materialized yet (never report done without a servable output).
  return { status: "pending", outputs: [], error: undefined };
}

export function parseAlephPoll(data) {
  if (!data || typeof data !== "object") return { status: "pending", outputs: [], error: undefined };
  const flag = Number(data.successFlag);
  const url = data.response?.resultVideoUrl;
  if (flag === 1 && typeof url === "string" && url) {
    return { status: "success", outputs: [url], error: undefined };
  }
  if (data.errorMessage || data.errorCode) {
    return { status: "failed", outputs: [], error: data.errorMessage || String(data.errorCode) };
  }
  return { status: "pending", outputs: [], error: undefined };
}

// Bounded hi-res waits: base poll backoff tops out at 10s, so ~30 attempts
// covers the documented 1-3min 1080p window with slack, ~60 the 5-10min 4K
// window. Exhausting the window degrades GRACEFULLY to the base-resolution
// outputs the task already produced (the user still gets their video; the
// provider genuinely could not produce the tier) rather than failing a
// generation that succeeded.
export const VEO_1080P_MAX_ATTEMPTS = 30;
export const VEO_4K_MAX_ATTEMPTS = 60;

// The Veo two-stage state machine. Stages, tracked on `state`:
//   (none)   base record-info poll. successFlag 0 → pending; 2/3 → failed;
//            1 → read data.response: if the task's resolution says 1080p/4k,
//            stash the base outputs and switch stage (report pending);
//            otherwise complete with the base outputs.
//   "1080p"  GET get-1080p-video until data.resultUrl exists.
//   "4k"     POST get-4k-video until data.resultUrls[] is non-empty; the
//            provider's "unavailable" envelope (code 500) or an exhausted
//            window falls back to the stashed base outputs.
export function parseVeoPoll(data, state = {}) {
  if (!data || typeof data !== "object") return { status: "pending", outputs: [], error: undefined };

  if (state.veoStage === "1080p") {
    state.veoAttempts = (state.veoAttempts || 0) + 1;
    const url = data.resultUrl;
    if (typeof url === "string" && url) return { status: "success", outputs: [url], error: undefined };
    if (state.veoAttempts >= VEO_1080P_MAX_ATTEMPTS && state.veoBaseOutputs?.length) {
      return { status: "success", outputs: state.veoBaseOutputs, error: undefined };
    }
    return { status: "pending", outputs: [], error: undefined };
  }

  if (state.veoStage === "4k") {
    state.veoAttempts = (state.veoAttempts || 0) + 1;
    const urls = Array.isArray(data.resultUrls) ? data.resultUrls.filter((u) => typeof u === "string" && u) : [];
    if (urls.length) return { status: "success", outputs: urls, error: undefined };
    const unavailable = Number(data.code) === 500;
    if ((unavailable || state.veoAttempts >= VEO_4K_MAX_ATTEMPTS) && state.veoBaseOutputs?.length) {
      return { status: "success", outputs: state.veoBaseOutputs, error: undefined };
    }
    return { status: "pending", outputs: [], error: undefined };
  }

  // Base stage.
  const flag = Number(data.successFlag);
  if (flag === 2 || flag === 3) {
    return { status: "failed", outputs: [], error: data.errorMessage || data.errorCode || "generation failed" };
  }
  if (flag !== 1) return { status: "pending", outputs: [], error: undefined };

  const response = data.response || {};
  const outputs = [response.fullResultUrls, response.resultUrls]
    .filter(Array.isArray)
    .flat()
    .filter((u) => typeof u === "string" && u);
  if (!outputs.length) return { status: "pending", outputs: [], error: undefined };

  const resolution = String(response.resolution || "").toLowerCase();
  if (resolution === "1080p" || resolution === "4k") {
    state.veoStage = resolution;
    state.veoBaseOutputs = outputs;
    state.veoAttempts = 0;
    // Retrieval endpoints answer non-200 while the tier is still rendering —
    // providers.js's loop treats that as "keep polling" when this flag is set.
    state.retryHttpErrors = true;
    return { status: "pending", outputs: [], error: undefined };
  }
  return { status: "success", outputs, error: undefined };
}

/**
 * Model-keyed poll dispatch, or null when the model isn't a dedicated video
 * family.
 */
export function parseVideoPoll(data, modelId, state) {
  const family = videoProviderFamily(modelId);
  if (!family) return null;
  switch (family) {
    case VIDEO_FAMILY.RUNWAY:
    case VIDEO_FAMILY.RUNWAY_EXTEND:
      return parseRunwayPoll(data);
    case VIDEO_FAMILY.ALEPH:
      return parseAlephPoll(data);
    case VIDEO_FAMILY.VEO:
    case VIDEO_FAMILY.VEO_EXTEND:
      return parseVeoPoll(data, state || {});
    default:
      return null;
  }
}
