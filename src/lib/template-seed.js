// Helmies Studio — Pre-built Template Seeds
// Each template pre-fills tool settings under `config` so users get one-click generation.

export const TEMPLATE_SEEDS = [
  // ── Creative (3) ──
  {
    slug: "young-meets-old",
    name: "Young You Meets Old You",
    description:
      "A cinematic split-screen portrait showing your younger and older self sharing a moment of connection. Upload a clear front-facing portrait and watch two versions of you meet across time.",
    category: "creative",
    toolType: "image",
    pricingModel: "subscription",
    isPublished: true,
    isFeatured: true,
    config: {
      model: "flux-2-pro",
      prompt:
        "A cinematic split-screen portrait. On the left, a youthful version of the person in the reference image with bright eyes, smooth skin, and hopeful expression. On the right, the same person aged gracefully with silver hair, wisdom lines, and a warm knowing smile. Both wearing complementary neutral-toned clothing. Soft studio lighting, shallow depth of field, 85mm lens aesthetic. The two figures are looking at each other with deep recognition and love. High-end editorial portrait photography style.",
      negativePrompt:
        "cartoon, illustration, blurry, deformed, asymmetrical, watermark, text, low quality",
      aspectRatio: "1:1",
      resolution: "2K",
      inputRequirements: {
        type: "image",
        description: "Upload a clear front-facing portrait",
        required: true,
      },
    },
  },
  {
    slug: "dream-portrait",
    name: "Dream Portrait — Ethereal Fantasy",
    description:
      "Transform any portrait into an ethereal fantasy dreamscape with glowing elements, soft magical lighting, and a painterly aesthetic.",
    category: "creative",
    toolType: "image",
    pricingModel: "subscription",
    isPublished: true,
    isFeatured: false,
    config: {
      model: "flux-2-pro",
      prompt:
        "An ethereal dream portrait based on the reference image. The subject is enveloped in soft glowing light particles and magical bokeh. Delicate flowers and luminous butterflies float around them. Pastel color palette with touches of gold. Painterly, romantic fantasy aesthetic. Soft focus edges, dreamlike atmosphere, 85mm f/1.4 shallow depth of field.",
      negativePrompt:
        "dark, scary, horror, deformed, blurry, low quality, watermark, text, cartoon",
      aspectRatio: "2:3",
      resolution: "2K",
      inputRequirements: {
        type: "image",
        description: "Upload a portrait photo",
        required: true,
      },
    },
  },
  {
    slug: "cyberspace-self",
    name: "Cyberspace Avatar",
    description:
      "Reimagine yourself as a cyberpunk character in a neon-lit futuristic world. Perfect for gaming profiles and digital identities.",
    category: "creative",
    toolType: "image",
    pricingModel: "subscription",
    isPublished: true,
    isFeatured: true,
    config: {
      model: "flux-2-pro",
      prompt:
        "A cyberpunk character portrait based on the reference image. The subject has subtle cybernetic enhancements — glowing circuit lines tracing along the jawline, one eye with a subtle holographic iris. Neon blue and magenta lighting from below. Rain-slicked streets reflecting in the background. Leather jacket with subtle LED trim. Cinematic composition, Blade Runner 2049 aesthetic, volumetric lighting, anamorphic lens flares.",
      negativePrompt:
        "gory, scary, deformed, cartoony, blurry, low quality, watermark, text",
      aspectRatio: "2:3",
      resolution: "2K",
      inputRequirements: {
        type: "image",
        description: "Upload a clear portrait photo",
        required: true,
      },
    },
  },

  // ── Social (3) ──
  {
    slug: "instagram-product",
    name: "Instagram Product Showcase",
    description:
      "Studio-quality product photography template optimized for Instagram's square format. Clean, bright, conversion-focused aesthetic.",
    category: "social",
    toolType: "image",
    pricingModel: "subscription",
    isPublished: true,
    isFeatured: false,
    config: {
      model: "flux-2-pro",
      prompt:
        "A stunning product photography shot worthy of a premium Instagram feed. The product is elegantly positioned with soft studio lighting, gentle shadows, and a minimal aesthetic background in warm cream tones. Fresh botanicals or natural elements delicately placed around the product for lifestyle context. Natural sunlight from a large window, golden hour warmth. Shot on 50mm f/1.4, shallow depth of field, editorial product photography style.",
      negativePrompt:
        "cluttered, dark, messy, text overlay, watermark, reflections, distorted",
      aspectRatio: "1:1",
      resolution: "2K",
      inputRequirements: {
        type: "image",
        description: "Upload your product photo",
        required: true,
      },
    },
  },
  {
    slug: "tiktok-dance",
    name: "TikTok Dance Visual Effect",
    description:
      "Add a viral-worthy visual effect overlay to any dance clip. Light trails, energy particles, and motion blur that pops on the For You page.",
    category: "social",
    toolType: "video",
    pricingModel: "subscription",
    isPublished: true,
    isFeatured: false,
    config: {
      model: "wan-2.1",
      prompt:
        "Apply a dynamic visual effect to this dance video: glowing neon light trails following the dancer's movements, particle sparkles at key moments, subtle chromatic aberration at the edges, and a slight slow-motion effect on the best moves. Keep the original dancer clearly visible. Vibrant, high-energy aesthetic optimized for TikTok vertical format.",
      negativePrompt:
        "blurry, dark, ghosting, distorted face, watermark, text overlay",
      aspectRatio: "9:16",
      resolution: "1080p",
      inputRequirements: {
        type: "video",
        description: "Upload a short dance video clip (15–60 seconds)",
        required: true,
      },
    },
  },
  {
    slug: "youtube-thumbnail",
    name: "YouTube Thumbnail Generator",
    description:
      "Eye-catching YouTube thumbnail in one click. Bold text placement, dramatic lighting, and that signature reaction-face energy.",
    category: "social",
    toolType: "image",
    pricingModel: "onetime",
    oneTimePrice: 99,
    isPublished: true,
    isFeatured: false,
    config: {
      model: "flux-2-pro",
      prompt:
        "A dramatic, high-contrast YouTube thumbnail composition. The person from the reference image has an exaggerated shocked or excited expression. Bright colorful background with strong rim lighting separating the subject. Bold, clear negative space on the left/right for text overlay. Intense eyes looking directly at camera. Ultra-sharp details, vibrant saturation, thumbnail-optimized lighting. Professional YouTube creator style.",
      negativePrompt:
        "blurry, dark, low contrast, muted colors, busy background, watermark, small text",
      aspectRatio: "16:9",
      resolution: "2K",
      inputRequirements: {
        type: "image",
        description: "Upload a portrait or reaction photo",
        required: true,
      },
    },
  },

  // ── Cinematic (2) ──
  {
    slug: "noir-scene",
    name: "Film Noir Scene",
    description:
      "Generate a moody black-and-white film noir still with dramatic shadows, venetian blind light patterns, and classic detective atmosphere.",
    category: "cinematic",
    toolType: "image",
    pricingModel: "subscription",
    isPublished: true,
    isFeatured: true,
    config: {
      model: "flux-2-pro",
      prompt:
        "A cinematic film noir still photograph. Dramatic chiaroscuro lighting with deep blacks and piercing highlights. Venetian blind shadows cast across a smoky room. A silhouetted figure in a trench coat and fedora stands by a rain-streaked window. The glow of a neon sign outside casts a pale blue edge light. Film grain texture, 1940s noir aesthetic. Shot on 35mm black and white film, anamorphic widescreen ratio. Moody, mysterious, atmospheric.",
      negativePrompt:
        "color, bright, cheerful, cartoon, digital art, clean, modern, watermark",
      aspectRatio: "2.39:1",
      resolution: "2K",
      inputRequirements: {
        type: "text",
        description: "Describe your detective or scene subject (optional)",
        required: false,
      },
    },
  },
  {
    slug: "sunset-drone",
    name: "Golden Hour Aerial Drone",
    description:
      "Breathtaking aerial cinematography at golden hour. Perfect establishing shot with warm light, long shadows, and cinematic color grading.",
    category: "cinematic",
    toolType: "video",
    pricingModel: "subscription",
    isPublished: true,
    isFeatured: false,
    config: {
      model: "wan-2.1",
      prompt:
        "A breathtaking aerial drone shot during golden hour. The camera sweeps gracefully over a stunning landscape — rolling hills, a winding river reflecting the warm orange sun, or a coastline with gentle waves. Long dramatic shadows stretching across the terrain. Slight haze in the distance creating atmospheric depth. Cinematic color grading with warm golden tones and teal shadows. Smooth, sweeping camera movement. Nature documentary quality.",
      negativePrompt:
        "shaky, static, dark, overcast, urban, buildings, people, cars, low quality",
      aspectRatio: "16:9",
      resolution: "1080p",
      inputRequirements: {
        type: "text",
        description: "Describe the landscape or scene you want (optional)",
        required: false,
      },
    },
  },

  // ── Audio (2) ──
  {
    slug: "podcast-intro",
    name: "Podcast Intro Music",
    description:
      "Professional podcast intro music with a modern, energetic sound. Perfect for setting the tone of your show in the first 10 seconds.",
    category: "audio",
    toolType: "audio",
    pricingModel: "subscription",
    isPublished: true,
    isFeatured: false,
    config: {
      model: "musicgen",
      prompt:
        "A modern, energetic podcast intro music clip. Upbeat electronic elements with a driving bassline and crisp percussion. Clean, professional sound with a confident vibe. Subtle riser and swell in the first 3 seconds, then a groovy drop that sustains energy. Suitable for a tech, business, or creative podcast. 10-15 second duration, radio-ready production quality.",
      negativePrompt:
        "distorted, lo-fi, slow, sad, classical, acoustic only, vocals, singing",
      duration: 15,
      inputRequirements: {
        type: "text",
        description: "Describe your podcast genre and vibe (optional)",
        required: false,
      },
    },
  },
  {
    slug: "lofi-beat",
    name: "Lo-Fi Study Beat",
    description:
      "Chill lo-fi hip hop beat perfect for study sessions, work focus, or relaxing background music. Warm vinyl crackle included.",
    category: "audio",
    toolType: "audio",
    pricingModel: "subscription",
    isPublished: true,
    isFeatured: false,
    config: {
      model: "musicgen",
      prompt:
        "A chill lo-fi hip hop instrumental beat. Warm, mellow chords with a relaxed boom-bap drum pattern. Soft vinyl crackle and tape hiss for authentic vintage texture. Gentle jazzy piano melody floating over a smooth bassline. Rain ambience subtly in the background. Perfect for studying, working, or relaxing. 30-60 second loop-friendly duration. Nujabes / J Dilla inspired production.",
      negativePrompt:
        "aggressive, loud, fast tempo, heavy bass, distorted, vocals, singing, metal, rock",
      duration: 60,
      inputRequirements: {
        type: "text",
        description: "Describe the mood or add specific instruments (optional)",
        required: false,
      },
    },
  },

  // ── Marketing (2) ──
  {
    slug: "product-hero",
    name: "Product Hero Image",
    description:
      "High-conversion hero image for your landing page or product launch. Clean composition with strategic copy space and premium lighting.",
    category: "marketing",
    toolType: "image",
    pricingModel: "onetime",
    oneTimePrice: 199,
    isPublished: true,
    isFeatured: true,
    config: {
      model: "flux-2-pro",
      prompt:
        "A premium product hero image suitable for a SaaS landing page or product launch. The product (from the reference image) is the clear hero, elevated on a minimal pedestal or floating elegantly. Clean gradient background in sophisticated brand colors — deep navy fading to soft lavender. Subtle light rays sweeping across the scene. Ample negative space on the left/right for headline and CTA text. Professional studio lighting with soft shadows. Apple-keynote-level product photography. 3D render quality.",
      negativePrompt:
        "cluttered, busy, text, watermark, distorted, cheap looking, amateur, reflections on screen",
      aspectRatio: "16:9",
      resolution: "4K",
      inputRequirements: {
        type: "image",
        description: "Upload your product screenshot or photo",
        required: true,
      },
    },
  },
  {
    slug: "testimonial-ad",
    name: "Testimonial Social Ad",
    description:
      "Generate a social media ad creative featuring customer testimonials with professional portrait backgrounds and brand-consistent styling.",
    category: "marketing",
    toolType: "image",
    pricingModel: "onetime",
    oneTimePrice: 149,
    isPublished: true,
    isFeatured: false,
    config: {
      model: "flux-2-pro",
      prompt:
        "A professional social media ad creative for a customer testimonial. A warm, authentic portrait of the person from the reference image looking genuinely happy and successful. Soft natural lighting, lifestyle setting — perhaps a modern office or cozy cafe. Clean, minimal design with clearly defined areas for testimonial quote text overlay. Brand-appropriate color palette with a subtle gradient overlay. Trustworthy, aspirational, conversion-optimized ad creative style. Facebook/Instagram ad dimensions.",
      negativePrompt:
        "stock photo look, fake smile, stiff, corporate, watermark, text, low quality",
      aspectRatio: "1:1",
      resolution: "2K",
      inputRequirements: {
        type: "image",
        description: "Upload a portrait of the testimonial giver",
        required: true,
      },
    },
  },
];
