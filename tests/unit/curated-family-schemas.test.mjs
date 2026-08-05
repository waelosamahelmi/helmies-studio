// Audit class D — one pin per vendor family, asserting the curated schema's
// field names, enums (including exact casing) and required flags match the
// audit files (docs/model-audit/image-market.md, video-market.md,
// image-dedicated.md, video-dedicated.md) verbatim.
import { describe, it, expect } from "vitest";
import { schemaForModel, curatedSchemaEntry, M2_FAMILY_SCHEMAS } from "../../src/lib/model-catalog-core.mjs";

const fieldsOf = (modelId, capability = "text-to-image") => schemaForModel(modelId, capability).fields;

describe("M2 family schemas — image market", () => {
  it("Seedream: v4 uses image_size/image_resolution(1K/2K/4K)/max_images; 4.5+ use required aspect_ratio+quality", () => {
    const v4 = fieldsOf("bytedance/seedream-v4-text-to-image");
    expect(v4.image_resolution.enum).toEqual(["1K", "2K", "4K"]);
    expect(v4.max_images).toMatchObject({ minimum: 1, maximum: 6 });
    expect(v4.aspect_ratio).toBeUndefined();
    expect(v4.resolution).toBeUndefined();
    expect(v4.num_images).toBeUndefined();
    // The current wrong-prefixed DB row resolves to the same schema.
    expect(fieldsOf("seedream/seedream-v4-edit").image_urls).toMatchObject({ required: true, maxItems: 10 });
    const s45 = fieldsOf("seedream/4-5-text-to-image");
    expect(s45.aspect_ratio).toMatchObject({ required: true });
    expect(s45.aspect_ratio.enum).toEqual(["1:1", "4:3", "3:4", "16:9", "9:16", "2:3", "3:2", "21:9"]);
    expect(s45.quality.enum).toEqual(["basic", "high"]);
    expect(fieldsOf("seedream/5-lite-text-to-image").quality.enum).toEqual(["basic", "high", "ultra"]);
    expect(fieldsOf("seedream/5-pro-image-to-image", "image-to-image").image_urls).toMatchObject({ required: true, maxItems: 10 });
  });

  it("Nano Banana / Imagen4: 11/15-value aspect enums, image_input arrays, bare real ids", () => {
    const imagen = fieldsOf("google/imagen4");
    expect(imagen.aspect_ratio.enum).toContain("auto");
    expect(imagen.negative_prompt).toBeDefined();
    expect(imagen.resolution).toBeUndefined();
    const nb = fieldsOf("google/nano-banana");
    expect(nb.aspect_ratio.enum).toHaveLength(11);
    const nb2 = fieldsOf("nano-banana-2");
    expect(nb2.aspect_ratio.enum).toHaveLength(15);
    expect(nb2.image_input).toMatchObject({ maxItems: 14 });
    expect(nb2.prompt.maxLength).toBe(20000);
    // Current wrong-id rows alias to the real schemas.
    expect(fieldsOf("google/nanobanana2")).toEqual(nb2);
    const pro = fieldsOf("nano-banana-pro", "image-to-image");
    expect(pro.image_input).toMatchObject({ maxItems: 8 });
    expect(pro.resolution.enum).toEqual(["1K", "2K", "4K"]);
    expect(fieldsOf("google/pro-image-to-image", "image-to-image")).toEqual(pro);
  });

  it("Flux2: resolution is 1K/2K only (uppercase, no 4K), aspect_ratio+resolution required, i2i uses input_urls array", () => {
    const t2i = fieldsOf("flux-2/pro-text-to-image");
    expect(t2i.resolution.enum).toEqual(["1K", "2K"]);
    expect(t2i.resolution.required).toBe(true);
    expect(t2i.aspect_ratio).toMatchObject({ required: true });
    const i2i = fieldsOf("flux-2/flex-image-to-image", "image-to-image");
    expect(i2i.input_urls).toMatchObject({ required: true, minItems: 1, maxItems: 8 });
    expect(i2i.image_url).toBeUndefined();
    expect(i2i.aspect_ratio.enum).toContain("auto");
  });

  it("Grok Imagine: 5-value 2:3/3:2 aspects, enable_pro on t2i, optional prompt on i2i, task_id-driven upscale", () => {
    const t2i = fieldsOf("grok-imagine/text-to-image");
    expect(t2i.aspect_ratio.enum).toEqual(["2:3", "3:2", "1:1", "16:9", "9:16"]);
    expect(t2i.enable_pro.type).toBe("boolean");
    const i2i = fieldsOf("grok-imagine/image-to-image", "image-to-image");
    expect(i2i.image_urls).toMatchObject({ required: true, maxItems: 1 });
    expect(i2i.prompt.required).toBe(false);
    const t2v = fieldsOf("grok-imagine/text-to-video", "text-to-video");
    expect(t2v.duration).toMatchObject({ minimum: 6, maximum: 30 });
    expect(t2v.mode.enum).toEqual(["fun", "normal", "spicy"]);
    const upscale = fieldsOf("grok-imagine/upscale", "video-upscale");
    expect(upscale.task_id.required).toBe(true);
    expect(upscale.video_url).toBeUndefined();
  });

  it("GPT-Image: 1.5 takes required 3-value aspect + medium/high quality; 2 takes the 16-value enum and 1K/2K/4K", () => {
    const g15 = fieldsOf("gpt-image/1-5-text-to-image");
    expect(g15.aspect_ratio.enum).toEqual(["1:1", "2:3", "3:2"]);
    expect(g15.quality.enum).toEqual(["medium", "high"]);
    const g2 = fieldsOf("gpt-image-2-text-to-image");
    expect(g2.aspect_ratio.enum).toHaveLength(16);
    expect(g2.aspect_ratio.enum).toContain("9:21");
    expect(g2.resolution.enum).toEqual(["1K", "2K", "4K"]);
    expect(fieldsOf("gpt/gpt-image-2-image-to-image", "image-to-image").input_urls).toMatchObject({ required: true, maxItems: 16 });
  });

  it("Ideogram: rendering_speed/style enums, mandatory mask_url on edit, reference_image_urls on character line, string num_images", () => {
    const t2i = fieldsOf("ideogram/v3-text-to-image");
    expect(t2i.rendering_speed.enum).toEqual(["TURBO", "BALANCED", "QUALITY"]);
    expect(t2i.style.enum).toEqual(["AUTO", "GENERAL", "REALISTIC", "DESIGN"]);
    const edit = fieldsOf("ideogram/v3-edit", "image-to-image");
    expect(edit.mask_url).toMatchObject({ required: true });
    const remix = fieldsOf("ideogram/v3-remix", "image-to-image");
    expect(remix.num_images.enum).toEqual(["1", "2", "3", "4"]); // string enum
    expect(remix.strength).toMatchObject({ minimum: 0.01, maximum: 1 });
    const character = fieldsOf("ideogram/character", "image-to-image");
    expect(character.reference_image_urls.required).toBe(true);
    expect(character.style.enum).toEqual(["AUTO", "REALISTIC", "FICTION"]); // different enum than v3
    expect(fieldsOf("ideogram/character-edit", "image-to-image").mask_url.required).toBe(true);
  });

  it("Qwen: base line has guidance_scale/acceleration; qwen2 (unhyphenated) image-edit; qwen3 with prompt_extend + 1K/2K", () => {
    const base = fieldsOf("qwen/text-to-image");
    expect(base.guidance_scale).toMatchObject({ minimum: 0, maximum: 20 });
    expect(base.acceleration.enum).toEqual(["none", "regular", "high"]);
    const q2 = fieldsOf("qwen2/image-edit", "image-to-image");
    expect(q2.image_size.enum).toContain("21:9");
    expect(q2.prompt.maxLength).toBe(800);
    // The sync's wrongly-hyphenated row resolves to the same schema.
    expect(fieldsOf("qwen-2/image-edit", "image-to-image")).toEqual(q2);
    const q3 = fieldsOf("qwen3/text-to-image");
    expect(q3.resolution.enum).toEqual(["1K", "2K"]);
    expect(q3.prompt_extend.default).toBe(true);
    expect(fieldsOf("qwen3/image-to-image", "image-to-image").image_urls).toMatchObject({ required: true, minItems: 1, maxItems: 3 });
  });

  it("Z-Image: bare id, 1000-char prompt, required 5-value aspect_ratio, no fictional fields", () => {
    const z = fieldsOf("z-image");
    expect(z.prompt.maxLength).toBe(1000);
    expect(z.aspect_ratio).toMatchObject({ required: true });
    expect(z.resolution).toBeUndefined();
    expect(z.num_images).toBeUndefined();
    expect(fieldsOf("z-image/z-image")).toEqual(z);
  });

  it("Topaz: image+video upscalers take upscale_factor ('1'/'2'/'4') and no prompt", () => {
    const img = fieldsOf("topaz/image-upscale", "image-upscale");
    expect(img.upscale_factor.enum).toEqual(["1", "2", "4"]);
    expect(img.prompt).toBeUndefined();
    const vid = fieldsOf("topaz/video-upscale", "video-upscale");
    expect(vid.video_url.required).toBe(true);
    expect(vid.upscale_factor.default).toBe("2");
    expect(vid.duration).toBeUndefined();
  });

  it("Recraft: the required field is literally `image`, not image_url", () => {
    const rm = fieldsOf("recraft/remove-background", "background-removal");
    expect(rm.image).toMatchObject({ required: true });
    expect(rm.image_url).toBeUndefined();
    expect(Object.keys(fieldsOf("recraft/crisp-upscale", "image-upscale"))).toEqual(["image"]);
  });
});

describe("M2 family schemas — video market", () => {
  it("KIE-Wan: all 18 combos curated; 2.7 t2v uses `ratio` not aspect_ratio; 2.7 i2v uses first_frame_url", () => {
    const wanKeys = Object.keys(M2_FAMILY_SCHEMAS).filter((k) => k.startsWith("wan-"));
    expect(wanKeys).toHaveLength(18);
    const t2v = fieldsOf("wan/2-7-text-to-video", "text-to-video");
    expect(t2v.ratio.enum).toEqual(["16:9", "9:16", "1:1", "4:3", "3:4"]);
    expect(t2v.aspect_ratio).toBeUndefined();
    expect(t2v.duration).toMatchObject({ minimum: 2, maximum: 15 });
    const i2v = fieldsOf("wan/2-7-image-to-video", "image-to-video");
    expect(i2v.first_frame_url).toBeDefined();
    expect(i2v.image_url).toBeUndefined();
    const flash = fieldsOf("wan/2-6-flash-image-to-video", "image-to-video");
    expect(flash.audio).toMatchObject({ required: true, default: false }); // pricing-relevant
    expect(flash.image_urls).toMatchObject({ required: true, maxItems: 1 });
    const speech = fieldsOf("wan/2-2-a14b-speech-to-video-turbo", "avatar-video");
    expect(speech.audio_url.required).toBe(true);
    expect(speech.resolution.enum).toEqual(["480p", "580p", "720p"]);
  });

  it("Kling: sound required on 2.6, avatar pair takes exactly image/audio/prompt, kling-3.0/video mode std/pro/4K", () => {
    const t2v = fieldsOf("kling/text-to-video", "text-to-video");
    expect(t2v.sound).toMatchObject({ required: true });
    // STRING durations — live probe 2026-08-05: a numeric duration got
    // 500 "duration it must be a string" from kling-2.6/text-to-video.
    expect(t2v.duration.enum).toEqual(["5", "10"]);
    expect(t2v.resolution).toBeUndefined();
    const avatar = fieldsOf("kling/ai-avatar-pro", "avatar-video");
    expect(Object.keys(avatar).sort()).toEqual(["audio_url", "image_url", "prompt"]);
    const k30 = fieldsOf("kling/kling-3-0", "video");
    expect(k30.mode.enum).toEqual(["std", "pro", "4K"]);
    expect(k30.multi_shots).toBeDefined();
    // Provider-required `sound` (probe 2026-08-05: nameless 500 "This field
    // is required" without it) — required+default so it gets auto-filled.
    expect(k30.sound).toMatchObject({ required: true, default: false });
    // Every fixed Kling duration enum is strings, same probe evidence.
    expect(k30.duration.enum).toEqual(["3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"]);
    expect(fieldsOf("kling/v25-turbo-text-to-video-pro", "text-to-video").duration.enum).toEqual(["5", "10"]);
    expect(fieldsOf("kling/v2-1-master-text-to-video", "text-to-video").duration.enum).toEqual(["5", "10"]);
    expect(fieldsOf("kling/v2-1-pro", "video").duration.enum).toEqual(["5", "10"]);
    expect(fieldsOf("kling/v2-1-standard", "video").duration.enum).toEqual(["5", "10"]);
    expect(fieldsOf("kling/v2-1-master-image-to-video", "image-to-video").duration.enum).toEqual(["5", "10"]);
    const motion = fieldsOf("kling/motion-control", "video");
    expect(motion.character_orientation).toMatchObject({ required: true });
    expect(motion.video_urls.required).toBe(true);
    const turbo = fieldsOf("kling/v3-turbo-text-to-video", "text-to-video");
    expect(turbo.duration).toMatchObject({ required: true, minimum: 3, maximum: 15 });
    expect(turbo.resolution).toMatchObject({ required: true });
  });

  it("Seedance: 1.5-pro requires aspect_ratio+duration(4-12); fast/mini cap resolution at 720p; seedance-2 reaches 4k", () => {
    const pro15 = fieldsOf("bytedance/seedance-1-5-pro", "video");
    expect(pro15.aspect_ratio).toMatchObject({ required: true });
    expect(pro15.duration).toMatchObject({ required: true, minimum: 4, maximum: 12 });
    expect(fieldsOf("bytedance/seedance-2", "video").resolution.enum).toEqual(["480p", "720p", "1080p", "4k"]);
    expect(fieldsOf("bytedance/seedance-2-fast", "video").resolution.enum).toEqual(["480p", "720p"]);
    const i2vLite = fieldsOf("bytedance/v1-lite-image-to-video", "image-to-video");
    expect(i2vLite.end_image_url).toBeDefined();
    expect(i2vLite.aspect_ratio).toBeUndefined();
  });

  it("Hailuo: uppercase 768P/1080P/512P enums; the 02 pro tiers expose NO video-shape fields", () => {
    const pro23 = fieldsOf("hailuo/2-3-image-to-video-pro", "image-to-video");
    expect(pro23.resolution.enum).toEqual(["768P", "1080P"]);
    expect(pro23.duration.enum).toEqual(["6", "10"]);
    const t2vPro = fieldsOf("hailuo/02-text-to-video-pro", "text-to-video");
    expect(t2vPro.duration).toBeUndefined();
    expect(t2vPro.resolution).toBeUndefined();
    expect(t2vPro.aspect_ratio).toBeUndefined();
    expect(t2vPro.prompt.maxLength).toBe(1500);
    expect(fieldsOf("hailuo/02-image-to-video-standard", "image-to-video").resolution.enum).toEqual(["512P", "768P"]);
  });

  it("PixVerse: `quality` not resolution, image_urls arrays, transition's dual frames, extend's taskId|video_url", () => {
    const t2v = fieldsOf("pixverse/text-to-video", "text-to-video");
    expect(t2v.quality.enum).toEqual(["360p", "540p", "720p", "1080p"]);
    // Provider-required despite the doc's optional-with-default (probe
    // 2026-08-05: nameless 500 "This field is required" without it).
    expect(t2v.quality).toMatchObject({ required: true, default: "720p" });
    expect(t2v.resolution).toBeUndefined();
    expect(t2v.duration).toMatchObject({ required: true });
    const i2v = fieldsOf("pixverse/image-to-video", "image-to-video");
    expect(i2v.image_urls).toMatchObject({ required: true, maxItems: 2 });
    expect(i2v.template_id).toBeDefined();
    const transition = fieldsOf("pixverse/transition", "video");
    expect(transition.first_frame_image_url.required).toBe(true);
    expect(transition.last_frame_image_url.required).toBe(true);
    const extend = fieldsOf("pixverse/extend", "video-to-video");
    expect(extend.taskId).toBeDefined();
    expect(extend.video_url).toBeDefined();
    expect(fieldsOf("pixverse/reference-to-video", "reference-to-video").image_references).toMatchObject({ required: true, minItems: 1, maxItems: 7 });
  });

  it("MiniMax-H3: uppercase 768P/2K, required duration 4-15, reference arrays", () => {
    const t2v = fieldsOf("minimax-h3/text-to-video", "text-to-video");
    expect(t2v.resolution.enum).toEqual(["768P", "2K"]);
    expect(t2v.duration).toMatchObject({ required: true, minimum: 4, maximum: 15 });
    expect(t2v.prompt.maxLength).toBe(7000);
    const r2v = fieldsOf("minimax-h3/reference-to-video", "reference-to-video");
    expect(r2v.reference_image_urls).toMatchObject({ maxItems: 9 });
    expect(r2v.reference_video_urls).toMatchObject({ maxItems: 3 });
    expect(fieldsOf("minimax-h3/image-to-video", "image-to-video").first_frame_url).toBeDefined();
  });

  it("Infinitalk: image+audio+prompt required, 480p/720p only, bounded seed", () => {
    const f = fieldsOf("infinitalk/from-audio", "avatar-video");
    expect(f.image_url.required).toBe(true);
    expect(f.audio_url.required).toBe(true);
    expect(f.resolution.enum).toEqual(["480p", "720p"]);
    expect(f.seed).toMatchObject({ minimum: 10000, maximum: 1000000 });
    expect(f.duration).toBeUndefined();
  });

  it("Gemini-Omni: video takes duration enum '4'-'10' + asset id arrays; audio/character are constructors", () => {
    const video = fieldsOf("gemini-omni-video", "video");
    expect(video.duration.enum).toEqual(["4", "6", "8", "10"]);
    expect(video.character_ids).toBeDefined();
    expect(video.resolution.enum).toEqual(["720p", "1080p", "4k"]);
    const audio = fieldsOf("gemini-omni-audio", "audio");
    expect(audio.audio_id.required).toBe(true);
    expect(audio.name.maxLength).toBe(210);
    const character = fieldsOf("gemini-omni-character", "video");
    expect(character.descriptions.required).toBe(true);
    expect(character.image_urls).toMatchObject({ required: true, maxItems: 1 });
  });

  it("OmniHuman: root uses bare 720/1080 output_resolution + mask_url array; sub-models take image_url only", () => {
    const root = fieldsOf("omnihuman-1-5", "avatar-video");
    expect(root.output_resolution.enum).toEqual(["720", "1080"]);
    expect(root.mask_url).toMatchObject({ maxItems: 5 });
    expect(root.prompt.maxLength).toBe(300);
    expect(Object.keys(fieldsOf("omnihuman-1-5/human-identification", "avatar-video"))).toEqual(["image_url"]);
    expect(Object.keys(fieldsOf("omnihuman-1-5/subject-detection", "avatar-video"))).toEqual(["image_url"]);
  });

  it("Volcengine lipsync: mode/video_url/audio_url required, NO prompt field", () => {
    const f = fieldsOf("volcengine/video-to-video-lip-sync", "avatar-video");
    expect(f.mode.enum).toEqual(["lite", "basic"]);
    expect(f.mode.required).toBe(true);
    expect(f.prompt).toBeUndefined();
    expect(f.align_audio.default).toBe(true);
    expect(f.templ_start_seconds).toBeDefined();
  });
});

describe("M2 dedicated-API schemas", () => {
  it("4o Image: required size (1:1|3:2|2:3), optional prompt, filesUrl≤5, nVariants 1|2|4", () => {
    const f = fieldsOf("generate-4-o-image", "text-to-image");
    expect(f.size).toMatchObject({ required: true });
    expect(f.size.enum).toEqual(["1:1", "3:2", "2:3"]);
    expect(f.prompt.required).toBe(false);
    expect(f.filesUrl).toMatchObject({ maxItems: 5 });
    expect(f.nVariants.enum).toEqual([1, 2, 4]);
    expect(f.aspect_ratio).toBeUndefined();
    expect(f.resolution).toBeUndefined();
  });

  it("Flux Kontext: tier selector, 7-value aspect enum incl 16:21, optional image_url, no resolution/num_images", () => {
    const f = fieldsOf("generate-or-edit-image", "text-to-image");
    expect(f.model_tier.enum).toEqual(["flux-kontext-pro", "flux-kontext-max"]);
    expect(f.aspect_ratio.enum).toEqual(["21:9", "16:9", "4:3", "1:1", "3:4", "9:16", "16:21"]);
    expect(f.image_url.required).toBe(false);
    expect(f.resolution).toBeUndefined();
    expect(f.num_images).toBeUndefined();
  });

  it("Runway: required duration(5|10)+quality(720p|1080p), optional image_url; extend requires task_id", () => {
    const f = fieldsOf("generate-ai-video", "text-to-video");
    expect(f.duration.enum).toEqual([5, 10]);
    expect(f.quality.enum).toEqual(["720p", "1080p"]);
    expect(f.prompt.maxLength).toBe(1800);
    expect(f.resolution).toBeUndefined();
    const ext = fieldsOf("extend-ai-video", "video-to-video");
    expect(ext.task_id.required).toBe(true);
  });

  it("Aleph: required video_url, 21:9 in the aspect enum", () => {
    const f = fieldsOf("generate-aleph-video", "video-to-video");
    expect(f.video_url.required).toBe(true);
    expect(f.aspect_ratio.enum).toContain("21:9");
  });

  it("Veo3: tier/generationType/resolution incl 4k, duration 4|6|8; extend has its own tier enum + task_id", () => {
    const f = fieldsOf("generate-veo-3-video", "text-to-video");
    // The doc's engine enum IS the wire enum (probes 2026-08-05: absent
    // model AND "veo3.1-fast" both 422 "Invalid model"); the adapter always
    // sends one — see video-payload-core.mjs resolveVeoTier/buildVeoBody.
    expect(f.model_tier.enum).toEqual(["veo3", "veo3_fast", "veo3_lite"]);
    expect(f.model_tier.default).toBe("veo3_fast");
    expect(f.resolution.enum).toEqual(["720p", "1080p", "4k"]);
    expect(f.duration.enum).toEqual([4, 6, 8]);
    expect(f.aspect_ratio.enum).toEqual(["16:9", "9:16", "Auto"]);
    const ext = fieldsOf("extend-video", "video-to-video");
    expect(ext.task_id.required).toBe(true);
    expect(ext.model_tier.enum).toEqual(["fast", "quality", "lite"]);
    expect(ext.seeds).toMatchObject({ minimum: 10000, maximum: 99999 });
  });
});

describe("replace-mode resolution machinery", () => {
  it("replace entries fully suppress the fabricated generic defaults", () => {
    const entry = curatedSchemaEntry("kling/ai-avatar-standard");
    expect(entry.replace).toBe(true);
    const schema = schemaForModel("kling/ai-avatar-standard", "avatar-video");
    expect(schema.fields.duration).toBeUndefined();
    expect(schema.fields.resolution).toBeUndefined();
    expect(schema.fields.aspect_ratio).toBeUndefined();
  });

  it("legacy audio entries keep their merge behaviour", () => {
    const schema = schemaForModel("generate-music", "audio");
    expect(schema.fields.prompt).toBeDefined(); // from the generic default
    expect(schema.fields.style).toBeDefined(); // from the curated entry
  });

  it("non-curated models still get exactly the generic default", () => {
    const schema = schemaForModel("happyhorse/text-to-video", "text-to-video");
    expect(schema.fields.resolution.enum).toEqual(["480p", "720p", "1080p"]);
  });
});
