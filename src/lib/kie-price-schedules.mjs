// Helmies Studio — what each model actually costs, as the provider bills it.
//
// Until this file, every active model carried ONE flat price, and KIE bills
// most of them per second and per resolution. Audited 2026-09-21 against
// KIE's own ledger (recordInfo.creditsConsumed) for runs that SUCCEEDED:
//
//     generate-music            consumed 12 KIE credits ($0.06)   sold for 1 credit  (€0.01)
//     flux-2/flex 2K            consumed 24             ($0.12)   sold for 8 credits (€0.08)
//     google/nano-banana        consumed  8             ($0.04)   sold for 2 credits (€0.02)
//
// and the flat price never moved with the settings, so the losses grew with
// the run: bytedance/seedance-2 at 15s/4K costs $15.60 and quoted 143 credits.
// 14 models lost money at their defaults; 61 lost money at settings the UI
// offers. The rule engine (model-catalog-core.mjs calculateProviderQuote)
// already understood `when` conditions and per-second units. Nobody had
// written the schedules. These are them.
//
// SOURCE: POST https://api.kie.ai/client/v1/model-pricing/page — the JSON
// behind https://kie.ai/pricing. Numbers below are KIE CREDITS exactly as that
// page prints them, so any line can be checked by eye; one KIE credit is
// $0.005. Its USD column has typos (grok 1080p i2v is printed $0.004 for 8
// credits) — the credit column is the one KIE bills from, and it matched the
// ledger on every run compared.
//
// TWO THINGS A SCHEDULE NEEDS BESIDES PRICES
//   · `fill` — the settings its rules read. A rule only matches a value that
//     is PRESENT, so these are filled from the model's own schema before the
//     quote and sent with the submit (provider-payload-core.mjs treats them as
//     provider-required). What is priced is therefore what runs.
//   · a final catch-all at the DEAREST variant. With `fill` it is rarely
//     reached; when it is, the studio is never the one who pays for a guess.
//
// NOT HERE (KIE's list does not price them, so their stored flat price stays):
// the Seedance V1 family, wan/2-6-flash, bytedance/seedream, gemini-omni-audio,
// the suno-voice pair, ai-clipping, and google/gemini-3-1-flash-tts (billed per
// audio token — not expressible per run).
//
// Dependency-free so provider-payload-core.mjs and the worker can import it.

export const USD_PER_KIE_CREDIT = 0.005;
const usd = (kieCredits) => Number((kieCredits * USD_PER_KIE_CREDIT).toFixed(6));

/** One rule per (variant) row of a table, then the catch-all.
    `table` rows are [when, kieCredits]; order is match order. */
function schedule(unit, table, { fill = [] } = {}) {
  const rules = table.map(([when, credits]) => ({ when, unit, price: usd(credits) }));
  const dearest = Math.max(...table.map(([, credits]) => credits));
  rules.push({ unit, price: usd(dearest) });
  return { pricing: { currency: "USD", unit, rules }, fill: withLength(unit, fill) };
}

// A model billed by the second is billed for a LENGTH, so the length is a
// priced setting like any other: filled from the schema and sent, never left
// for the provider to choose after the quote was taken. (Models whose length
// is the uploaded clip's declare no `duration`, and the fill skips them.)
const withLength = (unit, fill) => (unit === "second" && !fill.includes("duration") ? [...fill, "duration"] : fill);

const flat = (credits, unit = "fixed") => ({ pricing: { currency: "USD", unit, rules: [{ unit, price: usd(credits) }] }, fill: withLength(unit, []) });

/** Per-second by one resolution-like field. */
const perSecondBy = (field, prices) => schedule("second", Object.entries(prices).map(([v, c]) => [{ [field]: v }, c]), { fill: [field] });

/** Per-second by resolution × an audio switch. `prices[res] = [silent, withAudio]`.
    The audio rows come first: a rule without the switch also matches a run
    that has it on, and first match wins. */
function perSecondWithAudio(field, audioField, prices) {
  const entries = Object.entries(prices);
  return schedule("second", [
    ...entries.map(([v, [, loud]]) => [{ [field]: v, [audioField]: true }, loud]),
    ...entries.map(([v, [silent]]) => [{ [field]: v }, silent]),
  ], { fill: [field] });
}

/** A whole-clip price by duration (and optionally one more field). */
const perClip = (rows, fill) => schedule("fixed", rows, { fill });

const D = (duration, extra = {}) => ({ duration: [duration, String(duration)], ...extra });

const WAN_27 = perSecondBy("resolution", { "720p": 16, "1080p": 24 });
const WAN_26 = perClip([
  [D(5, { resolution: "720p" }), 70], [D(5, { resolution: "1080p" }), 104.5],
  [D(10, { resolution: "720p" }), 140], [D(10, { resolution: "1080p" }), 209.5],
  [D(15, { resolution: "720p" }), 210], [D(15, { resolution: "1080p" }), 315],
], ["duration", "resolution"]);
const WAN_25 = perClip([
  [D(5, { resolution: "720p" }), 60], [D(5, { resolution: "1080p" }), 100],
  [D(10, { resolution: "720p" }), 120], [D(10, { resolution: "1080p" }), 200],
], ["duration", "resolution"]);
const WAN_22_TURBO = schedule("fixed", [[{ resolution: "480p" }, 40], [{ resolution: "580p" }, 60], [{ resolution: "720p" }, 80]], { fill: ["resolution"] });
const WAN_22_ANIMATE = perSecondBy("resolution", { "480p": 6, "580p": 9.5, "720p": 12.5 });
const KLING_26 = perClip([
  [D(5, { sound: true }), 110], [D(10, { sound: true }), 220], [D(5), 55], [D(10), 110],
], ["duration", "sound"]);
const KLING_25_TURBO = perClip([[D(5), 42], [D(10), 84]], ["duration"]);
const KLING_3_TURBO = perSecondBy("resolution", { "720p": 18, "1080p": 22.5 });
// KIE lists HappyHorse at 720p and 1080p only; 480p is priced as 720p.
const HAPPYHORSE = perSecondBy("resolution", { "480p": 28, "720p": 28, "1080p": 48 });
const HAPPYHORSE_11 = perSecondBy("resolution", { "480p": 22.5, "720p": 22.5, "1080p": 29 });
const MINIMAX_H3 = perSecondBy("resolution", { "768P": 8, "2K": 13 });
const PIXVERSE = perSecondWithAudio("quality", "generate_audio_switch", { "360p": [4, 5.6], "540p": [5.6, 7.2], "720p": [7.2, 9.6], "1080p": [14.4, 18.4] });
const PIXVERSE_R2V = perSecondWithAudio("quality", "generate_audio_switch", { "360p": [4.5, 6.3], "540p": [6.3, 8.1], "720p": [8.1, 10.8], "1080p": [16.2, 20.7] });
const GROK_VIDEO = perSecondBy("resolution", { "480p": 2.4, "720p": 4.5, "1080p": 8 });
const HAILUO_02_PRO = flat(57);
const IDEOGRAM_CHARACTER = schedule("image", [[{ rendering_speed: "TURBO" }, 12], [{ rendering_speed: "BALANCED" }, 18], [{ rendering_speed: "QUALITY" }, 24]], { fill: ["rendering_speed"] });
const IDEOGRAM_V3 = schedule("image", [[{ rendering_speed: "TURBO" }, 3.5], [{ rendering_speed: "BALANCED" }, 7], [{ rendering_speed: "QUALITY" }, 10]], { fill: ["rendering_speed"] });
const byResolution = (prices) => schedule("image", Object.entries(prices).map(([v, c]) => [{ resolution: v }, c]), { fill: ["resolution"] });
const FLUX2_FLEX = byResolution({ "1K": 14, "2K": 24 });
const FLUX2_PRO = byResolution({ "1K": 5, "2K": 7 });
const GPT_IMAGE_2 = byResolution({ "1K": 6, "2K": 10, "4K": 16 });
const GPT_IMAGE_15 = schedule("image", [[{ quality: "medium" }, 4], [{ quality: "high" }, 22]], { fill: ["quality"] });
const SUNO_TRACK = flat(12);

export const KIE_PRICE_SCHEDULES = {
  // ── Video, per second ────────────────────────────────────────────────────
  "wan/2-7-text-to-video": WAN_27,
  "wan/2-7-image-to-video": WAN_27,
  "wan/2-7-r2v": WAN_27,
  "wan/2-7-videoedit": WAN_27,
  "kling/v3-turbo-text-to-video": KLING_3_TURBO,
  "kling/v3-turbo-image-to-video": KLING_3_TURBO,
  // `mode` is the resolution tier here (std 720p, pro 1080p, 4K); `sound` adds.
  "kling-3.0/video": schedule("second", [
    [{ mode: "std", sound: true }, 20], [{ mode: "pro", sound: true }, 27], [{ mode: "4K" }, 67],
    [{ mode: "std" }, 14], [{ mode: "pro" }, 18],
  ], { fill: ["mode", "sound"] }),
  "happyhorse/text-to-video": HAPPYHORSE,
  "happyhorse/image-to-video": HAPPYHORSE,
  "happyhorse/reference-to-video": HAPPYHORSE,
  "happyhorse/video-edit": HAPPYHORSE,
  "happyhorse-1-1/text-to-video": HAPPYHORSE_11,
  "happyhorse-1-1/image-to-video": HAPPYHORSE_11,
  "happyhorse-1-1/reference-to-video": HAPPYHORSE_11,
  "minimax-h3/text-to-video": MINIMAX_H3,
  "minimax-h3/image-to-video": MINIMAX_H3,
  "minimax-h3/reference-to-video": MINIMAX_H3,
  "pixverse-v6/text-to-video": PIXVERSE,
  "pixverse-v6/image-to-video": PIXVERSE,
  "pixverse-v6/transition": PIXVERSE,
  "pixverse-v6/extend": PIXVERSE,
  "pixverse-v6/reference-to-video": PIXVERSE_R2V,
  "grok-imagine/text-to-video": GROK_VIDEO,
  "grok-imagine/image-to-video": GROK_VIDEO,
  // KIE lists the preview at 480p/720p; 1080p is priced as the Grok it previews.
  "grok-imagine-video-1-5-preview": GROK_VIDEO,
  "bytedance/seedance-1.5-pro": perSecondWithAudio("resolution", "generate_audio", { "480p": [1.75, 3.5], "720p": [3.5, 7], "1080p": [7.5, 15] }),
  // Seedance 2.x is cheaper per second WITH a reference clip. The rule engine
  // cannot test "array is non-empty", so every run is priced at the dearer
  // no-clip rate: a clip user overpays ~1.6x, and the studio never underpays.
  "bytedance/seedance-2": perSecondBy("resolution", { "480p": 19, "720p": 41, "1080p": 102, "4k": 208 }),
  "bytedance/seedance-2-5": perSecondBy("resolution", { "480p": 28, "720p": 63 }),
  "bytedance/seedance-2-fast": perSecondBy("resolution", { "480p": 11.7, "720p": 24.8 }),
  "bytedance/seedance-2-mini": perSecondBy("resolution", { "480p": 3.8, "720p": 8.2 }),

  // ── Video, per clip ──────────────────────────────────────────────────────
  "wan/2-6-text-to-video": WAN_26,
  "wan/2-6-image-to-video": WAN_26,
  "wan/2-6-video-to-video": WAN_26,
  "wan/2-5-text-to-video": WAN_25,
  "wan/2-5-image-to-video": WAN_25,
  "wan/2-2-a14b-text-to-video-turbo": WAN_22_TURBO,
  "wan/2-2-a14b-image-to-video-turbo": WAN_22_TURBO,
  "kling-2.6/text-to-video": KLING_26,
  "kling-2.6/image-to-video": KLING_26,
  "kling/v2-5-turbo-text-to-video-pro": KLING_25_TURBO,
  "kling/v2-5-turbo-image-to-video-pro": KLING_25_TURBO,
  "kling/v2-1-master-text-to-video": perClip([[D(5), 160], [D(10), 320]], ["duration"]),
  "kling/v2-1-master-image-to-video": perClip([[D(5), 160], [D(10), 320]], ["duration"]),
  "kling/v2-1-pro": perClip([[D(5), 50], [D(10), 100]], ["duration"]),
  "kling/v2-1-standard": perClip([[D(5), 25], [D(10), 50]], ["duration"]),
  "hailuo/02-text-to-video-pro": HAILUO_02_PRO,
  "hailuo/02-image-to-video-pro": HAILUO_02_PRO,
  "hailuo/02-text-to-video-standard": perClip([[D(6), 30], [D(10), 50]], ["duration"]),
  "hailuo/02-image-to-video-standard": perClip([
    [D(6, { resolution: "512P" }), 12], [D(10, { resolution: "512P" }), 20],
    [D(6, { resolution: "768P" }), 30], [D(10, { resolution: "768P" }), 50],
  ], ["duration", "resolution"]),
  "hailuo/2-3-image-to-video-pro": perClip([
    [D(6, { resolution: "768P" }), 45], [D(6, { resolution: "1080P" }), 80], [D(10, { resolution: "768P" }), 90],
  ], ["duration", "resolution"]),
  "hailuo/2-3-image-to-video-standard": perClip([
    [D(6, { resolution: "768P" }), 30], [D(6, { resolution: "1080P" }), 50], [D(10, { resolution: "768P" }), 50],
  ], ["duration", "resolution"]),
  // Runway. `quality` is its resolution; 10s exists at 720p only.
  "generate-ai-video": perClip([
    [D(5, { quality: "720p" }), 12], [D(5, { quality: "1080p" }), 30], [D(10, { quality: "720p" }), 30],
  ], ["duration", "quality"]),
  "generate-aleph-video": flat(110),
  "generate-veo-3-video": schedule("fixed", [
    [{ model_tier: "veo3", resolution: "720p" }, 250], [{ model_tier: "veo3", resolution: "1080p" }, 255], [{ model_tier: "veo3", resolution: "4k" }, 380],
    [{ model_tier: "veo3_fast", resolution: "720p" }, 60], [{ model_tier: "veo3_fast", resolution: "1080p" }, 65], [{ model_tier: "veo3_fast", resolution: "4k" }, 180],
    [{ model_tier: "veo3_lite", resolution: "720p" }, 30], [{ model_tier: "veo3_lite", resolution: "1080p" }, 35], [{ model_tier: "veo3_lite", resolution: "4k" }, 150],
  ], { fill: ["model_tier", "resolution"] }),
  // Extending a Grok clip: priced at its 720p rate, the dearer of the two.
  "grok-imagine/extend": schedule("fixed", [[{ extend_times: "6" }, 27], [{ extend_times: "10" }, 45]]),
  // A Grok VIDEO upscale, despite the name. 480p→1080p is the dear path.
  "grok-imagine/upscale": schedule("fixed", [[{ resolution: "720p" }, 10], [{ resolution: "1080p" }, 30]], { fill: ["resolution"] }),

  // ── Priced by the length of the clip or audio YOU supply ─────────────────
  // The studio passes that length as `duration`; with none, the quote assumes
  // ASSUMED_INPUT_SECONDS (model-catalog.js) rather than refusing.
  "kling-3.0/motion-control": perSecondBy("mode", { std: 20, pro: 27 }),
  "kling-2.6/motion-control": perSecondBy("mode", { "720p": 11, "1080p": 18 }),
  "wan/2-2-animate-move": WAN_22_ANIMATE,
  "wan/2-2-animate-replace": WAN_22_ANIMATE,
  "wan/2-2-a14b-speech-to-video-turbo": perSecondBy("resolution", { "480p": 12, "580p": 18, "720p": 24 }),
  "infinitalk/from-audio": perSecondBy("resolution", { "480p": 3, "720p": 12 }),
  "kling/ai-avatar-standard": flat(8, "second"),
  "kling/ai-avatar-pro": flat(16, "second"),
  "volcengine/video-to-video-lip-sync": flat(8, "second"),
  "topaz/video-upscale": perSecondBy("upscale_factor", { 1: 8, 2: 8, 4: 14 }),

  // ── Images, per image (× num_images / n) ─────────────────────────────────
  "flux-2/flex-text-to-image": FLUX2_FLEX,
  "flux-2/flex-image-to-image": FLUX2_FLEX,
  "flux-2/pro-text-to-image": FLUX2_PRO,
  "flux-2/pro-image-to-image": FLUX2_PRO,
  "generate-or-edit-image": schedule("image", [[{ model_tier: "flux-kontext-pro" }, 5], [{ model_tier: "flux-kontext-max" }, 10]], { fill: ["model_tier"] }),
  "gpt-image-2-text-to-image": GPT_IMAGE_2,
  "gpt-image-2-image-to-image": GPT_IMAGE_2,
  "gpt-image/1.5-text-to-image": GPT_IMAGE_15,
  "gpt-image/1.5-image-to-image": GPT_IMAGE_15,
  "generate-4-o-image": flat(6, "image"),
  "ideogram/character": IDEOGRAM_CHARACTER,
  "ideogram/character-edit": IDEOGRAM_CHARACTER,
  "ideogram/character-remix": IDEOGRAM_CHARACTER,
  "ideogram/v3-text-to-image": IDEOGRAM_V3,
  "ideogram/v3-edit": IDEOGRAM_V3,
  "ideogram/v3-remix": IDEOGRAM_V3,
  // KIE bills Qwen Image per megapixel; every size it offers is ~1MP.
  "qwen/text-to-image": flat(4, "image"),
  "qwen/image-to-image": flat(4, "image"),
  "qwen/image-edit": flat(5, "image"),
  "qwen2/text-to-image": flat(5.6, "image"),
  "qwen2/image-edit": flat(5.6, "image"),
  "qwen3/text-to-image": flat(4.8, "image"),
  "qwen3/image-to-image": flat(5.3, "image"), // 4.8 out + 0.5 for the input image
  "qwen3/pro-image-to-image": byResolution({ "1K": 6.9, "2K": 12.5 }),
  "seedream/4.5-text-to-image": flat(6.5, "image"),
  "seedream/4.5-edit": flat(6.5, "image"),
  "seedream/5-lite-text-to-image": flat(5.5, "image"),
  // `quality` is Seedream's size tier: basic 1K, high 2K.
  "seedream/5-pro-text-to-image": schedule("image", [[{ quality: "basic" }, 7], [{ quality: "high" }, 14]], { fill: ["quality"] }),
  "seedream/5-pro-image-to-image": schedule("image", [[{ quality: "basic" }, 7.5], [{ quality: "high" }, 14.5]], { fill: ["quality"] }),
  "google/imagen4": flat(8, "image"),
  "google/imagen4-fast": flat(4, "image"),
  "google/imagen4-ultra": flat(12, "image"),
  "google/nano-banana": flat(4, "image"),
  "google/nano-banana-edit": flat(4, "image"),
  "nano-banana-2": byResolution({ "1K": 8, "2K": 12, "4K": 18 }),
  "nano-banana-2-lite": flat(4, "image"),
  "grok-imagine/text-to-image": flat(4, "image"),
  "grok-imagine/image-to-image": flat(4, "image"),
  "wan/2-7-image": flat(4.8, "image"),
  "wan/2-7-image-pro": flat(12, "image"),
  "recraft/remove-background": flat(1, "image"),
  "recraft/crisp-upscale": flat(0.5, "image"),
  // KIE prices Topaz by OUTPUT size (2K 10, 4K 20); a factor is the only
  // handle the model gives us, so each doubling is priced as the next size up.
  "topaz/image-upscale": schedule("image", [[{ upscale_factor: [1, "1"] }, 10], [{ upscale_factor: [2, "2"] }, 20], [{ upscale_factor: [4, "4"] }, 40]], { fill: ["upscale_factor"] }),

  // ── Audio, per request ───────────────────────────────────────────────────
  "generate-music": SUNO_TRACK,
  "add-vocals": SUNO_TRACK,
  "add-instrumental": SUNO_TRACK,
  "upload-and-cover-audio": SUNO_TRACK,
  "upload-and-extend-audio": SUNO_TRACK,
  "replace-section": flat(5),
  "generate-sounds": flat(2.5),
  "generate-lyrics": flat(0.4),
  "boost-music-style": flat(0.4),
  "separate-vocals": schedule("fixed", [[{ type: "separate_vocal" }, 10], [{ type: "split_stem_advanced" }, 20], [{ type: "split_stem" }, 50]], { fill: ["type"] }),
};

export function priceScheduleFor(modelId) {
  return KIE_PRICE_SCHEDULES[String(modelId || "")] || null;
}

/** The settings a model's price depends on — filled before quote and submit. */
export function pricedFieldsFor(modelId) {
  return priceScheduleFor(modelId)?.fill || [];
}

/** True when any rule bills by the second — the quote then needs a length. */
export function billsBySecond(pricing) {
  return Array.isArray(pricing?.rules) && pricing.rules.some((r) => (r.unit || pricing.unit) === "second");
}

/* How many seconds a per-second model will be billed for.
   ────────────────────────────────────────────────────────────────────────
   Three cases the flat prices never had to think about:
     · a length was chosen                       → that length
     · none was (the provider uses its default)  → the schema's default
     · "auto" (seedance-2.5 takes -1, wan videoedit takes 0 = keep the source
       length) or a model whose length is the UPLOADED clip's and nobody told
       us — motion-control, lip sync, avatars, upscaling → the schema's
       maximum when it states one, else ASSUMED_INPUT_SECONDS.
   The last case deliberately errs high: a quote is a reservation, and a
   reservation that is too small is a run the studio pays for. */
export const ASSUMED_INPUT_SECONDS = 10;

export function billableSeconds(requested, schema) {
  const n = Number(requested);
  if (Number.isFinite(n) && n > 0) return n;
  const field = schema?.fields?.duration;
  const asked = requested !== undefined && requested !== null && requested !== "";
  if (!asked) {
    const fallback = Number(field?.default);
    if (Number.isFinite(fallback) && fallback > 0) return fallback;
    const first = Number(Array.isArray(field?.enum) ? field.enum[0] : NaN);
    if (Number.isFinite(first) && first > 0) return first;
  }
  const max = Number(field?.maximum);
  return Number.isFinite(max) && max > 0 ? max : ASSUMED_INPUT_SECONDS;
}
