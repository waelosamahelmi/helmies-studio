// Helmies Studio — The Twelve Contract Templates (Phase 6 Task 4)
//
// TEMPLATE_SEEDS exports twelve executable, multi-step workflow templates
// (A–L), each a Template + its first TemplateVersion. Every step's modelId
// names a REAL model from the live catalog — src/lib/alibaba-catalog.js's
// ALIBABA_MEDIA_MODELS, synced into ModelPricing by
// src/lib/model-catalog.js's syncAlibabaModels(). That catalog is
// image/video only (text-to-image, image-to-image, text-to-video,
// image-to-video, reference-to-video, video-to-video) — at the time the
// twelve were written there was no audio/TTS/music-generation model with
// real, verified pricingRules. (That is no longer true: the KIE sync now
// maintains verified audio/TTS/lip-sync rows, which the Short Drama Suite
// templates M–P at the bottom of this file build on.) Two templates that would traditionally
// involve audio (music-visualizer-pack, podcast-clip-factory) are scoped
// honestly around that real gap: they generate the VISUAL side only (cover
// art / an animated background loop) rather than inventing a fake
// "audio-model" id to satisfy the publish gate — see each entry's own
// scopeNote below, and the phase report for the full BLOCKED writeup.
//
// Every graph is a strict linear chain (each step's `dependsOn` names
// exactly the step immediately before it) — this is what
// src/lib/template-runner.js's advanceTemplateRun actually executes
// (one active step at a time, advancing to its topological successor). A
// later step's `$stepN.output` reference MAY still point further back than
// its immediate predecessor (e.g. step3 referencing step1's output to avoid
// chaining visible generation-of-a-generation degradation) — that's fine:
// src/lib/template-graph.js's validateGraph only requires the referenced
// step to be topologically earlier, not the immediate parent.
//
// `graph.sampleInputs` is {} for eleven of the twelve: every step's own
// `inputs` already supplies every field its model's schema requires, so the
// publish gate (canPublish, Task 2) can quote successfully with no
// additional sample overrides. The one exception is
// real-estate-listing-pack, whose first step requires a REAL user photo —
// its placeholder sample URL lives in graph.sampleInputs (quote-time only),
// never baked into the step's own inputs, so a real run can never silently
// stage the placeholder. A real user still edits any field per step via the
// run/quote routes' request-body `inputs[stepId]` override (Task 5's UI).
//
// Every step input field name below matches the model's REAL schema
// (CURATED_SCHEMAS in src/lib/model-catalog-core.mjs, transcribed from the
// vendor docs): qwen/image-edit and qwen/image-to-image take a singular
// `image_url`; wan/2-6* image-to-video takes an `image_urls` ARRAY (max 1)
// with string-enum durations ("5"/"10"/"15"); wan/2-7-image-to-video takes
// `first_frame_url` (numeric duration 2–15); wan/2-7-image[-pro] i2i input
// is `input_urls`; z-image REQUIRES `aspect_ratio`.
//
// toolType "workflows" matches the real "workflows" entry in
// src/components/studio/kit/tools.js's TOOL_IDS (a multi-step pipeline is
// exactly what that tool already represents) — not a studio single-tool
// page, so it never claims one of image/video/etc. that these templates
// only partially match.

const linear = (id, dependsOnPrev) => (dependsOnPrev ? [dependsOnPrev] : []);

// `blockedReason` (optional): set on a template whose graph technically
// PASSES canPublish (structurally valid, real priced models, quotes fine
// against its own placeholder sample input) but that cannot actually
// succeed for a real user yet — e.g. its first step fundamentally needs a
// real user-supplied photo (a placeholder sample URL like
// "https://example.com/..." stands in for it in the graph) and Task 5's
// library UI has no per-step input-editing form (ships the graph's own
// baked defaults only — see TemplateRunPanel.js). scripts/seed-templates.mjs
// checks this and refuses to auto-publish that one template regardless of
// what canPublish says, instead of silently shipping a template that
// always fails for every real user. Not persisted to the DB (script-only
// gate) — the reason is still recorded in graph.blockedReason for anyone
// reading the seeded row directly.
function template({ slug, name, description, category, safetyNotes, scopeNote, blockedReason, sampleInputs, steps }) {
  return {
    slug,
    name,
    description,
    category,
    toolType: "workflows",
    pricingModel: "subscription",
    oneTimePrice: null,
    stripePriceId: null,
    thumbnailUrl: null,
    isPublished: false, // flipped true by the seed script only after canPublish passes AND publishable
    isFeatured: false,
    usageLimit: "unlimited",
    publishable: !blockedReason,
    config: { workflow: true, stepCount: steps.length },
    graph: {
      steps,
      sampleInputs: sampleInputs || {},
      ...(safetyNotes ? { safetyNotes } : {}),
      ...(scopeNote ? { scopeNote } : {}),
      ...(blockedReason ? { blockedReason } : {}),
    },
  };
}

export const TEMPLATE_SEEDS = [
  // A — product-launch-campaign
  template({
    slug: "product-launch-campaign",
    name: "Product Launch Campaign",
    description:
      "A premium hero product shot, a cinematic teaser video from that hero, and a social ad variant with copy space — three deliverables from one product photo.",
    category: "marketing",
    steps: [
      {
        id: "step1",
        tool: "image",
        modelId: "qwen/text-to-image",
        dependsOn: linear("step1"),
        inputs: {
          prompt:
            "Studio product hero photograph of a sleek modern product on a clean minimal background, premium lighting, high-end commercial photography style.",
        },
      },
      {
        id: "step2",
        tool: "i2v",
        modelId: "wan/2-7-image-to-video",
        dependsOn: linear("step2", "step1"),
        inputs: {
          prompt: "Smooth cinematic camera pan slowly orbiting the product, elegant motion, premium advertising feel.",
          first_frame_url: "$step1.output",
          duration: 5,
          resolution: "720p",
        },
      },
      {
        id: "step3",
        tool: "i2i",
        modelId: "qwen/image-edit",
        dependsOn: linear("step3", "step2"),
        inputs: {
          prompt:
            "Recompose this product photo with clean open negative space on the left third for a headline, keep the same product and lighting style.",
          image_url: "$step1.output",
        },
      },
    ],
  }),

  // B — restaurant-content-pack
  template({
    slug: "restaurant-content-pack",
    name: "Restaurant Content Pack",
    description:
      "An appetizing dish photo, a steam/sizzle motion loop, and a second plating angle — never inventing allergens, prices, or opening times.",
    category: "social",
    safetyNotes: [
      "Never invent or state allergens, prices, or opening times — no step's prompt may add such claims to the output.",
    ],
    steps: [
      {
        id: "step1",
        tool: "image",
        modelId: "wan/2-7-image",
        dependsOn: linear("step1"),
        inputs: {
          prompt:
            "Appetizing overhead photograph of a beautifully plated restaurant dish, natural daylight, shallow depth of field, no on-image text, no prices, no allergen claims, no opening-hours text.",
        },
      },
      {
        id: "step2",
        tool: "i2v",
        modelId: "wan/2-6-image-to-video",
        dependsOn: linear("step2", "step1"),
        inputs: {
          prompt: "Subtle rising steam and gentle light shimmer over the dish, slow cinematic motion, no added text or claims.",
          image_urls: ["$step1.output"],
          duration: "5",
          resolution: "720p",
        },
      },
      {
        id: "step3",
        tool: "i2i",
        modelId: "qwen/image-edit",
        dependsOn: linear("step3", "step2"),
        inputs: {
          prompt:
            "Same dish from a different plating angle, same restaurant ambiance and lighting, no invented price or allergen text overlay.",
          image_url: "$step1.output",
        },
      },
    ],
  }),

  // C — ai-influencer-campaign
  template({
    slug: "ai-influencer-campaign",
    name: "AI Influencer Campaign",
    description:
      "An original, fictional virtual influencer character showcasing a product, plus a short gesture video — never a real, identifiable person.",
    category: "social",
    safetyNotes: [
      "Must depict an original, fictional persona only — every step's prompt explicitly forbids generating or implying a real, identifiable public figure.",
    ],
    steps: [
      {
        id: "step1",
        tool: "image",
        modelId: "wan/2-7-image-pro",
        dependsOn: linear("step1"),
        inputs: {
          prompt:
            "An entirely original, fictional virtual influencer character — not based on or resembling any real, identifiable person — friendly warm smile, holding a product, clean studio lighting.",
        },
      },
      {
        id: "step2",
        tool: "i2v",
        modelId: "wan/2-7-image-to-video",
        dependsOn: linear("step2", "step1"),
        inputs: {
          prompt: "The original virtual influencer character gestures naturally toward the product and smiles warmly at the camera.",
          first_frame_url: "$step1.output",
          duration: 5,
          resolution: "720p",
        },
      },
    ],
  }),

  // D — ugc-product-ad
  template({
    slug: "ugc-product-ad",
    name: "UGC Product Ad",
    description: "A casual, authentic phone-photo style product shot and a handheld-feel short video, in a user-generated-content aesthetic.",
    category: "social",
    steps: [
      {
        id: "step1",
        tool: "image",
        modelId: "wan/2-7-image",
        dependsOn: linear("step1"),
        inputs: {
          prompt:
            "Casual, authentic phone-photo style shot of a product in an everyday home setting, natural window light, unpolished UGC aesthetic.",
        },
      },
      {
        id: "step2",
        tool: "i2v",
        modelId: "wan/2-6-flash-image-to-video",
        dependsOn: linear("step2", "step1"),
        inputs: {
          prompt: "Subtle handheld camera movement, authentic user-generated-content video feel, natural lighting.",
          image_urls: ["$step1.output"],
          duration: "5",
          resolution: "720p",
          audio: false,
        },
      },
    ],
  }),

  // E — ecommerce-photography-pack
  template({
    slug: "ecommerce-photography-pack",
    name: "E-commerce Photography Pack",
    description: "Three consistent product angles — a clean front shot, a three-quarter turn, and a lifestyle-context variant.",
    category: "marketing",
    steps: [
      {
        id: "step1",
        tool: "image",
        modelId: "qwen/text-to-image",
        dependsOn: linear("step1"),
        inputs: {
          prompt: "Clean e-commerce product photograph on a pure white background, front-facing angle, even studio lighting, sharp focus.",
        },
      },
      {
        id: "step2",
        tool: "i2i",
        // Was qwen/text-to-image — a pure t2i model whose real schema takes
        // NO image input at all, so this i2i step's source reference was
        // silently dropped. qwen/image-to-image is the same vendor's ACTIVE
        // KIE i2i model (real source field: singular image_url).
        modelId: "qwen/image-to-image",
        dependsOn: linear("step2", "step1"),
        inputs: {
          prompt: "The same product from a three-quarter angle, same pure white background and studio lighting.",
          image_url: "$step1.output",
        },
      },
      {
        id: "step3",
        tool: "i2i",
        modelId: "wan/2-7-image",
        dependsOn: linear("step3", "step2"),
        inputs: {
          prompt: "The same product placed in a minimal lifestyle setting with soft natural light, still clearly the hero subject.",
          input_urls: ["$step2.output"],
        },
      },
    ],
  }),

  // F — local-business-ad-pack
  template({
    slug: "local-business-ad-pack",
    name: "Local Business Ad Pack",
    description: "A welcoming storefront hero photo and a gentle cinematic push-in video, for a local business's social ads.",
    category: "marketing",
    safetyNotes: ["Never render invented business hours, prices, or claims as text in the generated image or video."],
    steps: [
      {
        id: "step1",
        tool: "image",
        modelId: "wan/2-7-image",
        dependsOn: linear("step1"),
        inputs: {
          prompt:
            "Welcoming photograph of a local small-business storefront, warm natural lighting, tidy and inviting, no invented text, hours, or prices rendered in the image.",
        },
      },
      {
        id: "step2",
        tool: "i2v",
        modelId: "wan/2-6-image-to-video",
        dependsOn: linear("step2", "step1"),
        inputs: {
          prompt: "Gentle cinematic push-in on the storefront, warm inviting mood, smooth camera motion.",
          image_urls: ["$step1.output"],
          duration: "5",
          resolution: "720p",
        },
      },
    ],
  }),

  // G — music-visualizer-pack
  template({
    slug: "music-visualizer-pack",
    name: "Music Visualizer Pack",
    description: "Abstract album-art cover artwork and a looping animated visualizer motion — pair the output with your own track.",
    category: "creative",
    scopeNote:
      "Generates the visual cover/animation only — no audio-generation model with real pricing exists in the current catalog, so this does not synthesize or edit any audio track. Pair the output with the creator's own music downstream.",
    steps: [
      {
        id: "step1",
        tool: "image",
        modelId: "wan/2-7-image-pro",
        dependsOn: linear("step1"),
        inputs: {
          prompt: "Abstract, vibrant flowing artwork suitable for a music album cover, rich color gradients, no text, no logos.",
        },
      },
      {
        id: "step2",
        tool: "i2v",
        modelId: "wan/2-7-image-to-video",
        dependsOn: linear("step2", "step1"),
        inputs: {
          prompt: "Slow, hypnotic looping animated motion of the abstract artwork, gentle pulsing and flowing color, seamless loop feel.",
          first_frame_url: "$step1.output",
          duration: 10,
          resolution: "720p",
        },
      },
    ],
  }),

  // H — podcast-clip-factory
  template({
    slug: "podcast-clip-factory",
    name: "Podcast Clip Factory",
    description: "A quote-card background and a subtle animated loop for shareable podcast clips.",
    category: "social",
    scopeNote:
      "Generates the visual quote-card background and looping clip background only — no audio-generation/TTS model with real pricing exists in the current catalog. Captions/waveform/audio are composed downstream by the existing assembly tool, not by this template.",
    steps: [
      {
        id: "step1",
        tool: "image",
        modelId: "qwen/text-to-image",
        dependsOn: linear("step1"),
        inputs: {
          prompt:
            "Clean, modern podcast quote-card background artwork with soft gradients, no text baked in, leaving open negative space for a caption overlay.",
        },
      },
      {
        id: "step2",
        tool: "i2v",
        modelId: "wan/2-6-flash-image-to-video",
        dependsOn: linear("step2", "step1"),
        inputs: {
          prompt: "Subtle, slow ambient animation of the background artwork, seamless calm loop, no added text.",
          image_urls: ["$step1.output"],
          duration: "5",
          resolution: "720p",
          audio: false,
        },
      },
    ],
  }),

  // I — brand-identity-starter
  template({
    slug: "brand-identity-starter",
    name: "Brand Identity Starter",
    description: "A minimalist abstract brand mark, a lifestyle mood photo in the same palette, and a short animated brand sting.",
    category: "creative",
    steps: [
      {
        id: "step1",
        tool: "image",
        modelId: "z-image",
        dependsOn: linear("step1"),
        inputs: {
          prompt: "A minimalist abstract brand mark concept, clean vector-like geometric shape, single bold accent color, plain background.",
          aspect_ratio: "1:1",
        },
      },
      {
        id: "step2",
        tool: "i2i",
        modelId: "qwen/image-edit",
        dependsOn: linear("step2", "step1"),
        inputs: {
          prompt:
            "Apply this mark's color palette and mood to a clean lifestyle brand photograph, no logo overlay, same accent color family.",
          image_url: "$step1.output",
        },
      },
      {
        id: "step3",
        tool: "i2v",
        modelId: "wan/2-7-image-to-video",
        dependsOn: linear("step3", "step2"),
        inputs: {
          prompt: "Gentle animated reveal motion over the brand photograph, elegant and understated, premium brand-sting feel.",
          first_frame_url: "$step2.output",
          duration: 5,
          resolution: "720p",
        },
      },
    ],
  }),

  // J — real-estate-listing-pack
  template({
    slug: "real-estate-listing-pack",
    name: "Real Estate Listing Pack",
    description: "Virtually stage an empty room with tasteful furniture, then a slow walkthrough pan — every output clearly labeled virtual staging.",
    category: "marketing",
    safetyNotes: [
      "Every output must be clearly labeled virtual staging — never presented as a photograph of an actually furnished property. Prompts explicitly instruct the model not to alter the room's fixed structure or architecture.",
    ],
    // MINOR-8 (found in review) — UNBLOCKED (Phase 8 Task B1): step1
    // fundamentally needs a REAL photo of the user's own empty room. The
    // placeholder sample URL lives in graph.sampleInputs (below) — used by
    // canPublish's own quote check ONLY — and is deliberately NOT baked into
    // step1's inputs, so a real run can never silently stage the placeholder
    // instead of the user's own room. TemplateRunPanel.js renders a per-step
    // input form (src/components/templates/StepInputsForm.js) built from
    // each step's live model schema, and an image-typed field (like this
    // step's image_url — qwen/image-edit's real, singular source field)
    // always starts EMPTY rather than pre-filled, so a real run only ever
    // stages a photo the user actually uploaded through POST /api/upload.
    // No longer marked non-publishable — publishable defaults to true again
    // now that the blocking reason is resolved.
    sampleInputs: { step1: { image_url: "https://example.com/sample-empty-room.jpg" } },
    steps: [
      {
        id: "step1",
        tool: "i2i",
        modelId: "qwen/image-edit",
        dependsOn: linear("step1"),
        inputs: {
          prompt:
            "Virtually stage this empty room with tasteful, neutral modern furniture appropriate for the room type. This is VIRTUAL STAGING for illustrative purposes only — do not alter the room's fixed structure, windows, walls, or layout, and do not add or remove architectural features.",
        },
      },
      {
        id: "step2",
        tool: "i2v",
        modelId: "wan/2-6-image-to-video",
        dependsOn: linear("step2", "step1"),
        inputs: {
          prompt:
            "Slow, smooth virtual walkthrough camera pan across the staged room. Clearly a VIRTUAL STAGING preview, not a photo of real furniture.",
          image_urls: ["$step1.output"],
          duration: "5",
          resolution: "720p",
        },
      },
    ],
  }),

  // K — app-launch-pack
  template({
    slug: "app-launch-pack",
    name: "App Launch Pack",
    description: "A minimalist app icon concept, a matching app-store feature graphic, and an animated launch teaser.",
    category: "marketing",
    steps: [
      {
        id: "step1",
        tool: "image",
        modelId: "z-image",
        dependsOn: linear("step1"),
        inputs: {
          prompt: "A modern, minimalist app icon concept, single bold symbol, vibrant gradient background, rounded-square icon composition.",
          aspect_ratio: "1:1",
        },
      },
      {
        id: "step2",
        tool: "i2i",
        modelId: "wan/2-7-image",
        dependsOn: linear("step2", "step1"),
        inputs: {
          prompt:
            "An app store feature graphic using the same color palette and style as this icon, clean modern composition with open space for a headline.",
          input_urls: ["$step1.output"],
        },
      },
      {
        id: "step3",
        tool: "i2v",
        modelId: "wan/2-7-image-to-video",
        dependsOn: linear("step3", "step2"),
        inputs: {
          prompt: "Elegant animated reveal of the feature graphic, smooth modern motion, premium app-launch feel.",
          first_frame_url: "$step2.output",
          duration: 5,
          resolution: "720p",
        },
      },
    ],
  }),

  // L — one-brief-to-campaign
  template({
    slug: "one-brief-to-campaign",
    name: "One Brief to Campaign",
    description: "A hero campaign image spun out into a square social variant, a vertical story variant, and a cinematic teaser video.",
    category: "marketing",
    steps: [
      {
        id: "step1",
        tool: "image",
        modelId: "wan/2-7-image-pro",
        dependsOn: linear("step1"),
        inputs: {
          prompt:
            "A premium, versatile campaign hero image suitable for a multi-channel marketing campaign, clean composition, professional commercial photography style.",
        },
      },
      {
        id: "step2",
        tool: "i2i",
        modelId: "qwen/image-edit",
        dependsOn: linear("step2", "step1"),
        inputs: {
          prompt: "Recompose this hero image into a clean square social-media variant, same subject and visual style.",
          image_url: "$step1.output",
        },
      },
      {
        id: "step3",
        tool: "i2i",
        modelId: "qwen/image-to-image",
        dependsOn: linear("step3", "step2"),
        inputs: {
          prompt: "Recompose this hero image into a vertical story-format variant, same subject and visual style.",
          image_url: "$step1.output",
        },
      },
      {
        id: "step4",
        tool: "i2v",
        modelId: "wan/2-7-image-to-video",
        dependsOn: linear("step4", "step3"),
        inputs: {
          prompt: "Cinematic animated teaser based on the hero image, smooth elegant camera movement.",
          first_frame_url: "$step1.output",
          duration: 5,
          resolution: "720p",
        },
      },
    ],
  }),

  // ── Short Drama Suite (M–P) ────────────────────────────────────────────
  // Added after the KIE catalog sync brought verified audio, TTS, and
  // lip-sync rows into ModelPricing (elevenlabs/*, generate-music,
  // volcengine/video-to-video-lip-sync, kling/ai-avatar-*) — the "no audio
  // models" constraint the original twelve were scoped around no longer
  // holds. Field names below match the live DB inputSchema rows, verified
  // 2026-08-06: kling-2.6 durations are STRING enums ("5"/"10") and take an
  // `image_urls` ARRAY; kling/v3-turbo takes a NUMERIC duration (3–15);
  // volcengine lip-sync has NO prompt field; generate-music's only required
  // field is `prompt`.

  // M — short-drama-episode: the flagship vertical-drama pipeline.
  // Keyframe → performance shot → dialogue audio → lip-synced final cut.
  template({
    slug: "short-drama-episode",
    name: "Short Drama Episode",
    description:
      "A vertical mini-drama scene, start to finish: a cinematic 9:16 keyframe, a moody performance shot animated from it, spoken dialogue, and a final lip-synced cut ready for TikTok, Reels, or a short-drama app.",
    category: "cinematic",
    scopeNote:
      "The lip-synced video in step 4 is the finished deliverable; steps 1–3 are also saved to your assets so you can regrade, recut, or redub the scene.",
    steps: [
      {
        id: "step1",
        tool: "image",
        modelId: "nano-banana-pro",
        dependsOn: linear("step1"),
        inputs: {
          prompt:
            "Vertical 9:16 cinematic film still: a young woman in a rain-soaked doorway at night, mascara slightly smudged, holding back tears as she confronts someone off-frame. Warm interior light behind her, cold blue city rain in front. Shallow depth of field, 35mm anamorphic look, teal-and-amber grade, prestige TV drama aesthetic. Her face is clearly visible, mouth closed, facing camera.",
          aspect_ratio: "9:16",
          resolution: "2K",
        },
      },
      {
        id: "step2",
        tool: "i2v",
        modelId: "kling-2.6/image-to-video",
        dependsOn: linear("step2", "step1"),
        inputs: {
          prompt:
            "The camera pushes in slowly on her face as she begins to speak, rain falling behind her, breath visible in the cold air, subtle trembling in her expression, cinematic drama performance, natural head movement, no cuts.",
          image_urls: ["$step1.output"],
          sound: false,
          duration: "10",
        },
      },
      {
        id: "step3",
        tool: "audio",
        modelId: "elevenlabs/text-to-dialogue-v3",
        dependsOn: linear("step3", "step2"),
        inputs: {
          prompt:
            "[emotional, voice breaking] You knew. You knew the whole time, and you let me stand there like a fool. [pause] [quietly] I'm done waiting for you to choose me.",
        },
      },
      {
        id: "step4",
        tool: "lipsync",
        modelId: "volcengine/video-to-video-lip-sync",
        dependsOn: linear("step4", "step3"),
        inputs: {
          mode: "basic",
          video_url: "$step2.output",
          audio_url: "$step3.output",
        },
      },
    ],
  }),

  // N — talking-avatar-skit: one portrait becomes a talking character.
  template({
    slug: "talking-avatar-skit",
    name: "Talking Avatar Skit",
    description:
      "Turn a generated character into a talking vertical clip: a stylized portrait, a scripted voice performance, and an AI-avatar video that delivers the lines — the fastest route to a face-on-camera format without a camera.",
    category: "social",
    steps: [
      {
        id: "step1",
        tool: "image",
        modelId: "nano-banana-pro",
        dependsOn: linear("step1"),
        inputs: {
          prompt:
            "Vertical 9:16 portrait of a charismatic podcast host in their late twenties, warm studio lighting, soft background with a hint of neon, looking directly into the camera with a friendly confident expression, mouth closed, head and shoulders framing, photorealistic, crisp detail.",
          aspect_ratio: "9:16",
          resolution: "2K",
        },
      },
      {
        id: "step2",
        tool: "audio",
        modelId: "elevenlabs/text-to-dialogue-v3",
        dependsOn: linear("step2", "step1"),
        inputs: {
          prompt:
            "[upbeat, conversational] Okay, real talk — nobody tells you this, but the algorithm doesn't reward perfect videos. It rewards videos people finish. [short laugh] Thirty seconds, one idea, say it like you'd say it to a friend. That's the whole secret.",
        },
      },
      {
        id: "step3",
        tool: "lipsync",
        modelId: "kling/ai-avatar-standard",
        dependsOn: linear("step3", "step2"),
        inputs: {
          image_url: "$step1.output",
          audio_url: "$step2.output",
          prompt:
            "The host speaks naturally to camera with lively, believable delivery — small head movements, natural blinks, expressive but not exaggerated.",
        },
      },
    ],
  }),

  // O — pov-drama-teaser: a hook-first teaser plus a score to cut it to.
  template({
    slug: "pov-drama-teaser",
    name: "POV Drama Teaser",
    description:
      "A binge-bait vertical teaser in the POV short-drama style — one continuous 8-second shot built for the first three seconds to hook, plus a tense cinematic score to lay under it in your editor.",
    category: "cinematic",
    scopeNote:
      "Delivers two assets: the 9:16 teaser video and a separate 30-second score. Drop both on a timeline and cut the hook to the downbeat.",
    steps: [
      {
        id: "step1",
        tool: "video",
        modelId: "kling/v3-turbo-text-to-video",
        dependsOn: linear("step1"),
        inputs: {
          prompt:
            "POV vertical shot: you are seated at a candlelit dinner table; across from you, an elegant woman in a red dress slides a folded document toward the camera, her expression unreadable. She looks up, directly into the lens, and raises one eyebrow. Slow dolly-in, warm restaurant bokeh, cinematic short-drama style, continuous take, no cuts.",
          duration: 8,
          aspect_ratio: "9:16",
          resolution: "1080p",
        },
      },
      {
        id: "step2",
        tool: "audio",
        modelId: "generate-music",
        dependsOn: linear("step2", "step1"),
        inputs: {
          prompt:
            "Tense, elegant cinematic underscore for a dramatic reveal scene: low string ostinato, sparse piano notes, a rising swell into a sudden hush, modern prestige-drama trailer tone.",
          style: "cinematic, orchestral, tension, trailer",
          title: "The Reveal",
          instrumental: true,
          duration: 30,
        },
      },
    ],
  }),

  // P — viral-hook-pack: thumb-stopper still → animated hook → trend track.
  template({
    slug: "viral-hook-pack",
    name: "Viral Hook Pack",
    description:
      "The first three seconds of a viral vertical video, manufactured: a thumb-stopping 9:16 hook frame, a punchy animated hook clip, and an upbeat trend-style track to carry the edit.",
    category: "social",
    scopeNote:
      "Delivers three assets — hook frame, hook clip, and audio track — sized for TikTok, Reels, and Shorts. The frame doubles as your cover image.",
    steps: [
      {
        id: "step1",
        tool: "image",
        modelId: "seedream/4.5-text-to-image",
        dependsOn: linear("step1"),
        inputs: {
          prompt:
            "Vertical 9:16 thumb-stopping social frame: extreme close-up of a hand lifting a glass cloche off a tiny glowing object on a velvet pedestal, dramatic single-source spotlight, rich saturated color, shallow depth of field, mystery-reveal energy, crisp commercial photography.",
          aspect_ratio: "9:16",
          quality: "high",
        },
      },
      {
        id: "step2",
        tool: "i2v",
        modelId: "pixverse-v6/image-to-video",
        dependsOn: linear("step2", "step1"),
        inputs: {
          prompt:
            "The cloche lifts in silky slow motion, light blooms off the glowing object, fine dust particles drift through the spotlight beam, a slow confident push-in — a reveal engineered to stop the scroll in the first second.",
          image_urls: ["$step1.output"],
          quality: "1080p",
          duration: 5,
        },
      },
      {
        id: "step3",
        tool: "audio",
        modelId: "generate-music",
        dependsOn: linear("step3", "step2"),
        inputs: {
          prompt:
            "Short upbeat social-media trend track: punchy percussive intro with an immediate hook, bright modern pop-electronic production, a satisfying beat drop around second three, loopable, high energy without being harsh.",
          style: "pop, electronic, upbeat, social media trend",
          title: "Hook Drop",
          instrumental: true,
          duration: 30,
        },
      },
    ],
  }),
];
