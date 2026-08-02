// Helmies Studio — The Twelve Contract Templates (Phase 6 Task 4)
//
// TEMPLATE_SEEDS exports twelve executable, multi-step workflow templates
// (A–L), each a Template + its first TemplateVersion. Every step's modelId
// names a REAL model from the live catalog — src/lib/alibaba-catalog.js's
// ALIBABA_MEDIA_MODELS, synced into ModelPricing by
// src/lib/model-catalog.js's syncAlibabaModels(). That catalog is
// image/video only (text-to-image, image-to-image, text-to-video,
// image-to-video, reference-to-video, video-to-video) — there is no
// audio/TTS/music-generation model with real, verified pricingRules
// anywhere in this codebase today. Two templates that would traditionally
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
// `graph.sampleInputs` is deliberately {} for all twelve: every step's own
// `inputs` already supplies every field its model's schema requires, so the
// publish gate (canPublish, Task 2) can quote successfully with no
// additional sample overrides. A real user still edits any field per step
// via the run/quote routes' request-body `inputs[stepId]` override (Task
// 5's UI) — image_url/images_list fields below carry a placeholder sample
// URL for exactly that reason (a real run supplies the user's own upload).
//
// toolType "workflows" matches the real "workflows" entry in
// src/components/studio/kit/tools.js's TOOL_IDS (a multi-step pipeline is
// exactly what that tool already represents) — not a studio single-tool
// page, so it never claims one of image/video/etc. that these templates
// only partially match.

const linear = (id, dependsOnPrev) => (dependsOnPrev ? [dependsOnPrev] : []);

function template({ slug, name, description, category, safetyNotes, scopeNote, steps }) {
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
    isPublished: false, // flipped true by the seed script only after canPublish passes
    isFeatured: false,
    usageLimit: "unlimited",
    config: { workflow: true, stepCount: steps.length },
    graph: {
      steps,
      sampleInputs: {},
      ...(safetyNotes ? { safetyNotes } : {}),
      ...(scopeNote ? { scopeNote } : {}),
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
        modelId: "alibaba:qwen-image-max",
        dependsOn: linear("step1"),
        inputs: {
          prompt:
            "Studio product hero photograph of a sleek modern product on a clean minimal background, premium lighting, high-end commercial photography style.",
        },
      },
      {
        id: "step2",
        tool: "i2v",
        modelId: "alibaba:wan2.7-i2v",
        dependsOn: linear("step2", "step1"),
        inputs: {
          prompt: "Smooth cinematic camera pan slowly orbiting the product, elegant motion, premium advertising feel.",
          image_url: "$step1.output",
          duration: 5,
          resolution: "720p",
        },
      },
      {
        id: "step3",
        tool: "i2i",
        modelId: "alibaba:qwen-image-edit-plus",
        dependsOn: linear("step3", "step2"),
        inputs: {
          prompt:
            "Recompose this product photo with clean open negative space on the left third for a headline, keep the same product and lighting style.",
          images_list: ["$step1.output"],
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
        modelId: "alibaba:wan2.7-image",
        dependsOn: linear("step1"),
        inputs: {
          prompt:
            "Appetizing overhead photograph of a beautifully plated restaurant dish, natural daylight, shallow depth of field, no on-image text, no prices, no allergen claims, no opening-hours text.",
        },
      },
      {
        id: "step2",
        tool: "i2v",
        modelId: "alibaba:wan2.6-i2v",
        dependsOn: linear("step2", "step1"),
        inputs: {
          prompt: "Subtle rising steam and gentle light shimmer over the dish, slow cinematic motion, no added text or claims.",
          image_url: "$step1.output",
          duration: 5,
          resolution: "720p",
        },
      },
      {
        id: "step3",
        tool: "i2i",
        modelId: "alibaba:qwen-image-edit-plus",
        dependsOn: linear("step3", "step2"),
        inputs: {
          prompt:
            "Same dish from a different plating angle, same restaurant ambiance and lighting, no invented price or allergen text overlay.",
          images_list: ["$step1.output"],
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
        modelId: "alibaba:wan2.7-image-pro",
        dependsOn: linear("step1"),
        inputs: {
          prompt:
            "An entirely original, fictional virtual influencer character — not based on or resembling any real, identifiable person — friendly warm smile, holding a product, clean studio lighting.",
        },
      },
      {
        id: "step2",
        tool: "i2v",
        modelId: "alibaba:wan2.7-i2v",
        dependsOn: linear("step2", "step1"),
        inputs: {
          prompt: "The original virtual influencer character gestures naturally toward the product and smiles warmly at the camera.",
          image_url: "$step1.output",
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
        modelId: "alibaba:wan2.7-image",
        dependsOn: linear("step1"),
        inputs: {
          prompt:
            "Casual, authentic phone-photo style shot of a product in an everyday home setting, natural window light, unpolished UGC aesthetic.",
        },
      },
      {
        id: "step2",
        tool: "i2v",
        modelId: "alibaba:wan2.6-i2v-flash",
        dependsOn: linear("step2", "step1"),
        inputs: {
          prompt: "Subtle handheld camera movement, authentic user-generated-content video feel, natural lighting.",
          image_url: "$step1.output",
          duration: 5,
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
        modelId: "alibaba:qwen-image-plus",
        dependsOn: linear("step1"),
        inputs: {
          prompt: "Clean e-commerce product photograph on a pure white background, front-facing angle, even studio lighting, sharp focus.",
        },
      },
      {
        id: "step2",
        tool: "i2i",
        modelId: "alibaba:qwen-image-2.0",
        dependsOn: linear("step2", "step1"),
        inputs: {
          prompt: "The same product from a three-quarter angle, same pure white background and studio lighting.",
          images_list: ["$step1.output"],
        },
      },
      {
        id: "step3",
        tool: "i2i",
        modelId: "alibaba:wan2.6-image",
        dependsOn: linear("step3", "step2"),
        inputs: {
          prompt: "The same product placed in a minimal lifestyle setting with soft natural light, still clearly the hero subject.",
          images_list: ["$step2.output"],
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
        modelId: "alibaba:wan2.7-image",
        dependsOn: linear("step1"),
        inputs: {
          prompt:
            "Welcoming photograph of a local small-business storefront, warm natural lighting, tidy and inviting, no invented text, hours, or prices rendered in the image.",
        },
      },
      {
        id: "step2",
        tool: "i2v",
        modelId: "alibaba:wan2.6-i2v",
        dependsOn: linear("step2", "step1"),
        inputs: {
          prompt: "Gentle cinematic push-in on the storefront, warm inviting mood, smooth camera motion.",
          image_url: "$step1.output",
          duration: 5,
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
        modelId: "alibaba:wan2.7-image-pro",
        dependsOn: linear("step1"),
        inputs: {
          prompt: "Abstract, vibrant flowing artwork suitable for a music album cover, rich color gradients, no text, no logos.",
        },
      },
      {
        id: "step2",
        tool: "i2v",
        modelId: "alibaba:wan2.7-i2v",
        dependsOn: linear("step2", "step1"),
        inputs: {
          prompt: "Slow, hypnotic looping animated motion of the abstract artwork, gentle pulsing and flowing color, seamless loop feel.",
          image_url: "$step1.output",
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
        modelId: "alibaba:qwen-image-max",
        dependsOn: linear("step1"),
        inputs: {
          prompt:
            "Clean, modern podcast quote-card background artwork with soft gradients, no text baked in, leaving open negative space for a caption overlay.",
        },
      },
      {
        id: "step2",
        tool: "i2v",
        modelId: "alibaba:wan2.6-i2v-flash",
        dependsOn: linear("step2", "step1"),
        inputs: {
          prompt: "Subtle, slow ambient animation of the background artwork, seamless calm loop, no added text.",
          image_url: "$step1.output",
          duration: 5,
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
        modelId: "alibaba:z-image-turbo",
        dependsOn: linear("step1"),
        inputs: {
          prompt: "A minimalist abstract brand mark concept, clean vector-like geometric shape, single bold accent color, plain background.",
          prompt_extend: true,
        },
      },
      {
        id: "step2",
        tool: "i2i",
        modelId: "alibaba:qwen-image-edit-max",
        dependsOn: linear("step2", "step1"),
        inputs: {
          prompt:
            "Apply this mark's color palette and mood to a clean lifestyle brand photograph, no logo overlay, same accent color family.",
          images_list: ["$step1.output"],
        },
      },
      {
        id: "step3",
        tool: "i2v",
        modelId: "alibaba:wan2.7-i2v",
        dependsOn: linear("step3", "step2"),
        inputs: {
          prompt: "Gentle animated reveal motion over the brand photograph, elegant and understated, premium brand-sting feel.",
          image_url: "$step2.output",
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
    steps: [
      {
        id: "step1",
        tool: "i2i",
        modelId: "alibaba:qwen-image-edit-max",
        dependsOn: linear("step1"),
        inputs: {
          prompt:
            "Virtually stage this empty room with tasteful, neutral modern furniture appropriate for the room type. This is VIRTUAL STAGING for illustrative purposes only — do not alter the room's fixed structure, windows, walls, or layout, and do not add or remove architectural features.",
          images_list: ["https://example.com/sample-empty-room.jpg"],
        },
      },
      {
        id: "step2",
        tool: "i2v",
        modelId: "alibaba:wan2.6-i2v",
        dependsOn: linear("step2", "step1"),
        inputs: {
          prompt:
            "Slow, smooth virtual walkthrough camera pan across the staged room. Clearly a VIRTUAL STAGING preview, not a photo of real furniture.",
          image_url: "$step1.output",
          duration: 5,
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
        modelId: "alibaba:z-image-turbo",
        dependsOn: linear("step1"),
        inputs: {
          prompt: "A modern, minimalist app icon concept, single bold symbol, vibrant gradient background, rounded-square icon composition.",
          prompt_extend: true,
        },
      },
      {
        id: "step2",
        tool: "i2i",
        modelId: "alibaba:wan2.6-image",
        dependsOn: linear("step2", "step1"),
        inputs: {
          prompt:
            "An app store feature graphic using the same color palette and style as this icon, clean modern composition with open space for a headline.",
          images_list: ["$step1.output"],
        },
      },
      {
        id: "step3",
        tool: "i2v",
        modelId: "alibaba:wan2.7-i2v",
        dependsOn: linear("step3", "step2"),
        inputs: {
          prompt: "Elegant animated reveal of the feature graphic, smooth modern motion, premium app-launch feel.",
          image_url: "$step2.output",
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
        modelId: "alibaba:wan2.7-image-pro",
        dependsOn: linear("step1"),
        inputs: {
          prompt:
            "A premium, versatile campaign hero image suitable for a multi-channel marketing campaign, clean composition, professional commercial photography style.",
        },
      },
      {
        id: "step2",
        tool: "i2i",
        modelId: "alibaba:qwen-image-edit-plus",
        dependsOn: linear("step2", "step1"),
        inputs: {
          prompt: "Recompose this hero image into a clean square social-media variant, same subject and visual style.",
          images_list: ["$step1.output"],
        },
      },
      {
        id: "step3",
        tool: "i2i",
        modelId: "alibaba:qwen-image-2.0-pro",
        dependsOn: linear("step3", "step2"),
        inputs: {
          prompt: "Recompose this hero image into a vertical story-format variant, same subject and visual style.",
          images_list: ["$step1.output"],
        },
      },
      {
        id: "step4",
        tool: "i2v",
        modelId: "alibaba:wan2.7-i2v",
        dependsOn: linear("step4", "step3"),
        inputs: {
          prompt: "Cinematic animated teaser based on the hero image, smooth elegant camera movement.",
          image_url: "$step1.output",
          duration: 5,
          resolution: "720p",
        },
      },
    ],
  }),
];
