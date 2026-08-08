import {
  IcSpark, IcImage, IcVideo, IcFilm, IcMusic, IcMegaphone,
  IcPersona, IcFlow, IcPalette, IcArchive, IcBrain, IcLayers,
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
  // Projects leads the rail: it is where a production is defined, and every
  // other surface is something you do inside one. Director is no longer a
  // rail entry — a scene IS a director pipeline, so its board is reached by
  // opening a scene. /studio/director still works for anyone who kept it.
  { id: "projects",     label: "Projects",   icon: IcLayers,    group: "direct", dock: true,
    title: "Projects",
    blurb: "The scenario, the format, the cast, and every scene made from them." },
  { id: "orchestrator", label: "Agent",      icon: IcSpark,     group: "direct", dock: true,
    title: "Creative Agent",
    blurb: "Describe the outcome and let the agent plan the production." },
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
  { id: "assets",       label: "Assets",     icon: IcArchive,   group: "library",
    title: "Assets",
    blurb: "Everything you have made, with its lineage." },
  { id: "brands",       label: "Brands",     icon: IcPalette,   group: "library",
    title: "Brand Kits",
    blurb: "Identity, palette, and the rules every render should follow." },
  { id: "cast",         label: "Cast",       icon: IcPersona,   group: "library",
    title: "Cast",
    blurb: "Characters, products and places that must look the same in every shot." },
  { id: "memory",       label: "Memory",     icon: IcBrain,     group: "library",
    title: "Creative memory",
    blurb: "Styles and context the models can reuse across productions." },

  // ── Reachable, not listed ───────────────────────────────────────────────
  // `hidden` is not a group in GROUPS, so byGroup() drops these from the
  // rail while TOOL_IDS keeps them routable. Director's board is where a
  // scene opens; it is not a destination you pick from a menu any more.
  { id: "director",     label: "Shot board", icon: IcFilm,      group: "hidden",
    title: "Shot board",
    blurb: "The shots of one scene, with continuity between takes." },
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
