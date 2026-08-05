import {
  IcSpark, IcImage, IcVideo, IcFilm, IcMusic, IcMegaphone,
  IcPersona, IcFlow, IcPalette, IcArchive, IcBrain,
} from "./Icons";

/* ══════════════════════════════════════════════════════════════════════════
   TOOL REGISTRY — the single source of truth
   ──────────────────────────────────────────────────────────────────────────
   The studio shell, the mobile dock, the command palette and the /studio/[tool]
   route metadata all read from here.

   S1 (2026-08-05): the 20-tool rail consolidated into mode-switching
   studios. Image absorbs Canvas/Cinema/Influencer (modes + Create presets),
   Video absorbs Image-to-Video/Motion/Video-Edit/Recast/Clipping (modes +
   presets), Audio gains a Tools mode, and the new Perform studio absorbs
   Lip Sync/Avatar/Persona as modes. Every retired slug redirects to its new
   studio + `?mode=` in src/app/studio/[tool]/page.js — bookmarks keep
   working.

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
    blurb: "Create, edit, upscale, or compose a still — one studio, four modes." },
  { id: "video",        label: "Video",      icon: IcVideo,     group: "make", dock: true,
    title: "Video",
    blurb: "Text or a still becomes motion; edit and clip what you have." },
  { id: "audio",        label: "Audio",      icon: IcMusic,     group: "make",
    title: "Audio",
    blurb: "Speech, dialogue, voice cloning, sound effects, and audio tools." },
  { id: "music",        label: "Music",      icon: IcMusic,     group: "make",
    title: "Music",
    blurb: "Compose a track from a description or a reference." },

  // ── Perform ─────────────────────────────────────────────────────────────
  { id: "perform",      label: "Perform",    icon: IcPersona,   group: "perform",
    title: "Perform",
    blurb: "Lip sync, speaking avatars, and consistent personas." },
  { id: "marketing",    label: "Marketing",  icon: IcMegaphone, group: "perform",
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
  { id: "library", label: "Library" },
];

export const TOOL_IDS = TOOLS.map((t) => t.id);
export const DOCK_TOOLS = TOOLS.filter((t) => t.dock);

export const getTool = (id) => TOOLS.find((t) => t.id === id) || TOOLS[0];

export const byGroup = () =>
  GROUPS.map((g) => ({ ...g, tools: TOOLS.filter((t) => t.group === g.id) }))
        .filter((g) => g.tools.length);
