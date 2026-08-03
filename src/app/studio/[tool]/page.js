import StudioClient from "../StudioClient";

const TOOLS = {
  orchestrator: {
    title: "Helmies Creative Agent",
    description: "Plan and execute connected creative productions with specialized AI models, project context, and inspectable budgets.",
    keywords: ["AI creative agent", "AI production planner", "multi-model orchestration"],
  },
  image: {
    title: "AI Image Generator",
    description: "Generate stunning images with Flux, Midjourney & 20+ AI models. Text-to-image, image-to-image, no content filters.",
    keywords: ["AI image generator", "Flux AI", "Midjourney", "text to image", "image generation", "AI art"],
  },
  video: {
    title: "AI Text to Video Generator",
    description: "Create videos from a written brief with Sora 2, Kling, Veo & other leading AI video models.",
    keywords: ["AI video generator", "Sora 2", "Kling AI", "Veo 3", "text to video", "AI video"],
  },
  i2v: {
    title: "AI Image to Video Generator",
    description: "Animate a still image into motion — your image becomes the first frame. Kling, Veo, Wan & 20+ image-to-video models.",
    keywords: ["AI image to video", "animate image", "image to video generator", "still to video"],
  },
  audio: {
    title: "AI Audio & Music Generator",
    description: "Generate music, voice, and sound effects with Suno, MusicGen & more. One subscription, no filters.",
    keywords: ["AI music generator", "AI voice", "AI sound effects", "audio generation"],
  },
  cinema: {
    title: "AI Cinema Studio",
    description: "Cinematic camera controls for AI-generated video. Professional shot composition and film-style direction.",
    keywords: ["AI cinema", "cinematic AI", "camera controls AI", "film AI"],
  },
  "vibe-motion": {
    title: "AI Motion Graphics",
    description: "Motion graphics and remix tools for AI-generated content. Animate and transform your creations.",
    keywords: ["AI motion graphics", "AI animation", "motion design", "AI remix"],
  },
  clipping: {
    title: "AI Highlight Extraction",
    description: "Extract highlights and key moments from video with AI-powered clipping tools.",
    keywords: ["AI video clipping", "highlight extraction", "AI video editing"],
  },
  marketing: {
    title: "AI Marketing Studio",
    description: "Create UGC video ads, product shots, and marketing content with AI. No studio needed.",
    keywords: ["AI marketing", "UGC video ads", "AI product shots", "AI advertising"],
  },
  lipsync: {
    title: "AI Lip Sync Studio",
    description: "Sync audio to portraits or video with 8 AI lip sync models. Perfect mouth movement every time.",
    keywords: ["AI lip sync", "lip sync AI", "face sync", "audio to face"],
  },
  "body-swap": {
    title: "AI Body Swap Studio",
    description: "Recast faces into any scene with AI body swap technology. Seamless face replacement.",
    keywords: ["AI body swap", "face swap AI", "face replacement", "deepfake AI"],
  },
  influencer: {
    title: "AI Influencer Studio",
    description: "Build AI personas and virtual influencers. Create consistent AI characters for social media.",
    keywords: ["AI influencer", "virtual influencer", "AI persona", "AI character"],
  },
  canvas: {
    title: "AI Canvas Editor",
    description: "Visual composition editor with mask tools, semantic roles, and AI-aware layout. Design visual instructions for generation.",
    keywords: ["AI canvas", "visual editor", "mask tools", "AI composition", "inpainting"],
  },
  director: {
    title: "AI Director — Multi-Shot Production",
    description: "Plan and produce multi-shot AI videos — music videos, short films, ads & social campaigns with continuity tracking.",
    keywords: ["AI director", "multi-shot video", "AI video production", "AI music video", "AI short film"],
  },
  assets: {
    title: "AI Asset Library",
    description: "Manage all your AI-generated images, videos, and audio in one place. Track lineage, organize, and reuse assets.",
    keywords: ["AI asset library", "AI media management", "AI content library", "asset tracking"],
  },
  music: {
    title: "AI Music Studio", description: "Compose music, speech, and sound effects with controllable AI audio models.", keywords: ["AI music", "AI speech", "sound effects"],
  },
  avatar: {
    title: "AI Avatar Studio", description: "Create speaking avatar videos from portraits and driving audio.", keywords: ["AI avatar", "talking portrait", "avatar video"],
  },
  "video-edit": {
    title: "AI Video Editor", description: "Transform, extend, and restyle footage with AI video editing models.", keywords: ["AI video editor", "video transformation", "video extension"],
  },
  workflows: {
    title: "Creative Workflows", description: "Build and run repeatable multi-step creative generation workflows.", keywords: ["AI workflow", "creative automation", "generation pipeline"],
  },
  brands: {
    title: "Brand Kits", description: "Manage visual identity, voice, references, and creative guardrails.", keywords: ["AI brand kit", "brand identity", "creative guardrails"],
  },
  memory: {
    title: "Creative Projects", description: "Organize reusable characters, styles, assets, and project memory.", keywords: ["creative projects", "AI memory", "character consistency"],
  },
};

const VALID_TOOLS = Object.keys(TOOLS);

export async function generateMetadata({ params }) {
  const { tool } = await params;
  if (!VALID_TOOLS.includes(tool)) {
    return { title: "Studio | Helmies Studio" };
  }
  const t = TOOLS[tool];
  const url = `${process.env.NEXTAUTH_URL || "https://studio.helmies.fi"}/studio/${tool}`;

  return {
    title: `${t.title} | Helmies Studio`,
    description: t.description,
    keywords: t.keywords,
    openGraph: {
      type: "website",
      locale: "en_US",
      url,
      siteName: "Helmies Studio",
      title: `${t.title} | Helmies Studio`,
      description: t.description,
      images: [{ url: "/og-image.png", width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${t.title} | Helmies Studio`,
      description: t.description,
      images: ["/og-image-twitter.png"],
    },
    alternates: { canonical: url },
  };
}

// Force dynamic rendering — never serve a static prerender for tool pages
// so the latest component code is always used.
export const dynamic = "force-dynamic";

export default async function StudioToolPage({ params, searchParams }) {
  const { tool } = await params;
  const initialTool = VALID_TOOLS.includes(tool) ? tool : "image";
  const sp = await searchParams;
  const initialModel = sp?.model || null;
  return <StudioClient initialTool={initialTool} initialModel={initialModel} />;
}
