import StudioPage from "../page";

const TOOLS = {
  image: {
    title: "AI Image Generator",
    description: "Generate stunning images with Flux, Midjourney & 20+ AI models. Text-to-image, image-to-image, no content filters.",
    keywords: ["AI image generator", "Flux AI", "Midjourney", "text to image", "image generation", "AI art"],
  },
  video: {
    title: "AI Video Generator",
    description: "Create videos from text, images, or existing footage with Sora 2, Kling, Veo & other leading AI video models.",
    keywords: ["AI video generator", "Sora 2", "Kling AI", "Veo 3", "text to video", "AI video"],
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

export default async function StudioToolPage({ params }) {
  const { tool } = await params;
  const initialTool = VALID_TOOLS.includes(tool) ? tool : "image";
  return <StudioPage initialTool={initialTool} />;
}
