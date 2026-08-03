import {
  IcSpark, IcImage, IcVideo, IcFilm, IcMusic, IcMic, IcScissors, IcMegaphone,
  IcPersona, IcSwap, IcLayers, IcCamera, IcFlow, IcPalette, IcArchive, IcBrain,
} from "./Icons";

/* ══════════════════════════════════════════════════════════════════════════
   TOOL REGISTRY — the single source of truth
   ──────────────────────────────────────────────────────────────────────────
   The studio shell, the mobile dock, the command palette and the /studio/[tool]
   route metadata all read from here. Previously the registry was duplicated in
   StudioClient and again in the phone app, and the two had already drifted.

   `group` orders the rail. `dock` marks the four that get a bottom-nav slot.
   ══════════════════════════════════════════════════════════════════════════ */

export const TOOLS = [
  // ── Direct ──────────────────────────────────────────────────────────────
  { id: "orchestrator", label: "Agent",      icon: IcSpark,     group: "direct", dock: true,
    title: "Creative Agent",
    blurb: "Describe the outcome and let the agent plan the production." },
  { id: "director",     label: "Director",   icon: IcFilm,      group: "direct",
    title: "Director",
    blurb: "Plan and shoot a multi-shot piece with continuity between takes." },
  { id: "workflows",    label: "Workflows",  icon: IcFlow,      group: "direct",
    title: "Workflows",
    blurb: "Chain steps into a pipeline you can run again on new inputs." },

  // ── Make ────────────────────────────────────────────────────────────────
  { id: "image",        label: "Image",      icon: IcImage,     group: "make", dock: true,
    title: "Image",
    blurb: "Generate or transform a still with a precise brief." },
  // Text→video and image→video are separate tools (EDITSv1 E1.3): they have
  // different requirements (i2v cannot run without a source image), largely
  // disjoint model pools, and burying the split in an in-component toggle
  // hid the second job entirely. Both mount VideoStudio with a fixed mode;
  // /studio/video keeps working (text mode) for old links.
  { id: "video",        label: "Text to Video", icon: IcVideo,  group: "make", dock: true,
    title: "Text to Video",
    blurb: "Generate motion from a written brief." },
  { id: "i2v",          label: "Image to Video", icon: IcVideo, group: "make",
    title: "Image to Video",
    blurb: "Animate a still — your image becomes the first frame." },
  { id: "canvas",       label: "Canvas",     icon: IcLayers,    group: "make",
    title: "Canvas",
    blurb: "Compose layers, mask regions, and direct the edit visually." },
  { id: "cinema",       label: "Cinema",     icon: IcCamera,    group: "make",
    title: "Cinema",
    blurb: "Direct the camera: lens, movement, and light." },
  { id: "audio",        label: "Audio",      icon: IcMusic,     group: "make",
    title: "Audio",
    blurb: "Generate speech and sound design." },
  { id: "music",        label: "Music",      icon: IcMusic,     group: "make",
    title: "Music",
    blurb: "Compose a track from a description or a reference." },

  // ── Perform ─────────────────────────────────────────────────────────────
  { id: "lipsync",      label: "Lip Sync",   icon: IcMic,       group: "perform",
    title: "Lip Sync",
    blurb: "Match a performance to a voice track." },
  { id: "avatar",       label: "Avatar",     icon: IcPersona,   group: "perform",
    title: "Avatar",
    blurb: "Make a portrait speak from a driving audio track." },
  { id: "body-swap",    label: "Recast",     icon: IcSwap,      group: "perform",
    title: "Recast",
    blurb: "Place an identity into another scene." },
  { id: "influencer",   label: "Persona",    icon: IcPersona,   group: "perform",
    title: "Persona",
    blurb: "Build a character that stays consistent across shots." },

  // ── Edit ────────────────────────────────────────────────────────────────
  { id: "vibe-motion",  label: "Motion",     icon: IcFilm,      group: "edit",
    title: "Motion",
    blurb: "Animate a still or restyle existing motion." },
  { id: "video-edit",   label: "Video Edit", icon: IcVideo,     group: "edit",
    title: "Video Edit",
    blurb: "Extend, retime, and restyle footage." },
  { id: "clipping",     label: "Clipping",   icon: IcScissors,  group: "edit",
    title: "Clipping",
    blurb: "Find the moments worth keeping and cut them out." },
  { id: "marketing",    label: "Marketing",  icon: IcMegaphone, group: "edit",
    title: "Marketing",
    blurb: "Produce campaign deliverables from a single brief." },

  // ── Library ─────────────────────────────────────────────────────────────
  { id: "assets",       label: "Assets",     icon: IcArchive,   group: "library", dock: true,
    title: "Assets",
    blurb: "Everything you have made, with its lineage." },
  { id: "brands",       label: "Brands",     icon: IcPalette,   group: "library",
    title: "Brand Kits",
    blurb: "Identity, palette, and the rules every render should follow." },
  { id: "memory",       label: "Projects",   icon: IcBrain,     group: "library",
    title: "Projects",
    blurb: "Characters, styles, and context the models can reuse." },
];

export const GROUPS = [
  { id: "direct",  label: "Direct" },
  { id: "make",    label: "Make" },
  { id: "perform", label: "Perform" },
  { id: "edit",    label: "Edit" },
  { id: "library", label: "Library" },
];

export const TOOL_IDS = TOOLS.map((t) => t.id);
export const DOCK_TOOLS = TOOLS.filter((t) => t.dock);

export const getTool = (id) => TOOLS.find((t) => t.id === id) || TOOLS[0];

export const byGroup = () =>
  GROUPS.map((g) => ({ ...g, tools: TOOLS.filter((t) => t.group === g.id) }))
        .filter((g) => g.tools.length);
