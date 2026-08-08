import { redirect } from "next/navigation";
import StudioClient from "../StudioClient";

/* ══════════════════════════════════════════════════════════════════════════
   S1 — legacy-slug redirects
   ──────────────────────────────────────────────────────────────────────────
   The 20-tool rail consolidated into mode-switching studios. Every retired
   slug 307s to its new studio + `?mode=` (and `?preset=` where the old tool
   became a preset), so bookmarks and template deep-links keep working; any
   other query params (template, model) are carried across.
   ══════════════════════════════════════════════════════════════════════════ */
const LEGACY_REDIRECTS = {
  cinema:       { tool: "image",   mode: "create",  preset: "cinematic" },
  canvas:       { tool: "image",   mode: "canvas" },
  i2v:          { tool: "video",   mode: "i2v" },
  "vibe-motion": { tool: "video",  mode: "ttv",     preset: "motion" },
  "video-edit": { tool: "video",   mode: "edit" },
  "body-swap":  { tool: "video",   mode: "edit",    preset: "recast" },
  clipping:     { tool: "video",   mode: "clips" },
  "audio-tools": { tool: "audio",  mode: "tools" },
  lipsync:      { tool: "perform", mode: "lipsync" },
  avatar:       { tool: "perform", mode: "avatar" },
  influencer:   { tool: "perform", mode: "persona" },
};

function legacyTarget(tool, sp = {}) {
  const target = LEGACY_REDIRECTS[tool];
  if (!target) return null;
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (k === "mode" || k === "preset" || v == null) continue;
    q.set(k, Array.isArray(v) ? v[0] : v);
  }
  q.set("mode", target.mode);
  if (target.preset) q.set("preset", target.preset);
  return `/studio/${target.tool}?${q.toString()}`;
}

const TOOLS = {
  projects: {
    title: "Projects — Films, Series, Ads & Campaigns",
    description: "Hold the scenario, the format, the cast and every scene of a production in one place, and shoot them with continuity.",
    keywords: ["AI film project", "AI production planning", "scene breakdown", "character consistency", "AI series"],
  },
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
    title: "AI Video Generator",
    description: "Create videos from text or a still, edit and restyle footage, and cut clips — Sora 2, Kling, Veo & other leading AI video models.",
    keywords: ["AI video generator", "Sora 2", "Kling AI", "Veo 3", "text to video", "image to video", "AI video editor"],
  },
  audio: {
    title: "AI Audio Generator — Speech, Dialogue & SFX",
    description: "Generate speech, multi-speaker dialogue, cloned voices, and sound effects with leading AI audio models.",
    keywords: ["AI voice generator", "AI text to speech", "AI dialogue", "voice cloning", "AI sound effects"],
  },
  marketing: {
    title: "AI Marketing Studio",
    description: "Create UGC video ads, product shots, and marketing content with AI. No studio needed.",
    keywords: ["AI marketing", "UGC video ads", "AI product shots", "AI advertising"],
  },
  perform: {
    title: "AI Performance Studio — Lip Sync, Avatars & Personas",
    description: "Sync audio to portraits or video, make portraits speak, and build consistent AI personas — one performance studio.",
    keywords: ["AI lip sync", "AI avatar", "talking portrait", "AI persona", "virtual influencer"],
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
  workflows: {
    title: "Creative Workflows", description: "Build and run repeatable multi-step creative generation workflows.", keywords: ["AI workflow", "creative automation", "generation pipeline"],
  },
  brands: {
    title: "Brand Kits", description: "Manage visual identity, voice, references, and creative guardrails.", keywords: ["AI brand kit", "brand identity", "creative guardrails"],
  },
  cast: {
    title: "Cast", description: "Define a character once — their face from every angle, their voice, what they wear — and every shot renders the same person.", keywords: ["character consistency", "AI character", "reference images", "identity sheet"],
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
  const sp = await searchParams;

  /* S1: retired slugs 307 to their new studio + mode before anything renders */
  const legacy = legacyTarget(tool, sp || {});
  if (legacy) redirect(legacy);

  const initialTool = VALID_TOOLS.includes(tool) ? tool : "image";
  const initialModel = sp?.model || null;
  return <StudioClient initialTool={initialTool} initialModel={initialModel} />;
}
