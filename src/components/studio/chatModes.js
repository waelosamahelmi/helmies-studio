import {
  IMAGE_MODELS, VIDEO_MODELS, AUDIO_MODELS, LIPSYNC_MODELS, RECAST_MODELS,
  CINEMA_CAMERAS, CINEMA_LENS, CINEMA_FOCAL, CINEMA_APERTURE,
  MARKETING_AVATARS, INFLUENCER_TABS,
} from "@/lib/models";

export const CHAT_MODES = {
  image: {
    tool: "image",
    label: "Image",
    models: IMAGE_MODELS,
    defaultModel: IMAGE_MODELS[0],
    settings: [
      { key: "aspect_ratio", label: "Aspect", type: "pills", fromModel: "aspectRatios", default: "1:1" },
      { key: "resolution", label: "Resolution", type: "pills", fromModel: "resolutions", default: "1k" },
      { key: "seed", label: "Seed", type: "number", advanced: true, default: -1 },
    ],
    uploads: [{ key: "image_url", label: "Reference Image", accept: "image/*", max: 1 }],
    promptPlaceholder: "A portrait of a warrior princess in golden armor...",
    resultType: "image",
  },

  video: {
    tool: "video",
    label: "Video",
    models: VIDEO_MODELS,
    defaultModel: VIDEO_MODELS[0],
    settings: [
      { key: "aspect_ratio", label: "Aspect", type: "pills", fromModel: "aspectRatios", default: "16:9" },
      { key: "duration", label: "Duration", type: "pills", fromModel: "durations", default: 5, suffix: "s" },
    ],
    uploads: [{ key: "start_frame_url", label: "Start Frame", accept: "image/*", max: 1, optional: true }],
    promptPlaceholder: "A drone shot flying over neon-lit Tokyo streets at night...",
    resultType: "video",
  },

  audio: {
    tool: "audio",
    label: "Audio",
    models: AUDIO_MODELS,
    defaultModel: AUDIO_MODELS[0],
    settings: [
      { key: "duration", label: "Duration", type: "number", default: 30, min: 5, max: 300, suffix: "s", showIf: (m) => m.inputs?.duration },
      { key: "voice", label: "Voice", type: "select", fromModel: "inputs.voice.enum", default: null, showIf: (m) => m.inputs?.voice },
    ],
    uploads: [{ key: "audio_url", label: "Reference Audio", accept: "audio/*", max: 1, showIf: (m) => m.inputs?.audio_url }],
    promptPlaceholder: "Epic orchestral music with soaring strings and thunderous drums...",
    resultType: "audio",
    dynamicFields: true,
  },

  cinema: {
    tool: "cinema",
    label: "Cinema",
    models: null,
    defaultModel: null,
    settings: [
      { key: "camera", label: "Camera", type: "select", options: CINEMA_CAMERAS, default: CINEMA_CAMERAS[0].id },
      { key: "lens", label: "Lens", type: "select", options: CINEMA_LENS, default: CINEMA_LENS[0].id },
      { key: "focal", label: "Focal", type: "select", options: CINEMA_FOCAL, default: CINEMA_FOCAL[3].id },
      { key: "aperture", label: "Aperture", type: "select", options: CINEMA_APERTURE, default: CINEMA_APERTURE[0].id },
      { key: "aspect_ratio", label: "Aspect", type: "pills", options: ["1:1", "16:9", "9:16", "4:3", "3:4", "21:9", "2:3", "3:2"], default: "16:9" },
      { key: "resolution", label: "Resolution", type: "pills", options: ["1k", "2k", "4k"], default: "1k" },
    ],
    uploads: [{ key: "image_url", label: "Reference Image", accept: "image/*", max: 1, optional: true }],
    promptPlaceholder: "A lone figure standing in the rain, neon reflections on wet pavement...",
    resultType: "image",
    buildPrompt: (prompt, settings) => {
      const cam = CINEMA_CAMERAS.find(c => c.id === settings.camera);
      const lens = CINEMA_LENS.find(l => l.id === settings.lens);
      const focal = CINEMA_FOCAL.find(f => f.id === settings.focal);
      const ap = CINEMA_APERTURE.find(a => a.id === settings.aperture);
      return [prompt, cam?.prompt, lens?.prompt, focal?.prompt, ap?.prompt].filter(Boolean).join(", ");
    },
  },

  "vibe-motion": {
    tool: "motion",
    label: "Motion",
    models: null,
    defaultModel: null,
    settings: [
      { key: "mode", label: "Mode", type: "pills", options: ["generate", "edit"], default: "generate" },
      { key: "aspect_ratio", label: "Aspect", type: "pills", options: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"], default: "16:9" },
      { key: "duration", label: "Duration", type: "pills", options: [3, 6, 10, 15], default: 6, suffix: "s" },
    ],
    uploads: [],
    promptPlaceholder: "Smooth motion graphics with flowing particles and gradient transitions...",
    resultType: "video",
    needsRequestId: (settings) => settings.mode === "edit",
  },

  clipping: {
    tool: "clipping",
    label: "Clipping",
    models: null,
    defaultModel: null,
    settings: [
      { key: "num_highlights", label: "Highlights", type: "number", default: 3, min: 1, max: 10 },
      { key: "aspect_ratio", label: "Aspect", type: "pills", options: ["16:9", "9:16", "1:1", "4:3", "3:4"], default: "16:9" },
      { key: "output_mode", label: "Output", type: "pills", options: ["clips", "coordinates"], default: "clips" },
    ],
    uploads: [{ key: "video_url", label: "Source Video", accept: "video/*", max: 1, required: true }],
    promptPlaceholder: "Describe what highlights to extract (optional)...",
    resultType: "video",
    noPrompt: true,
  },

  marketing: {
    tool: "marketing",
    label: "Marketing",
    models: null,
    defaultModel: null,
    settings: [
      { key: "aspect_ratio", label: "Aspect", type: "pills", options: ["9:16", "16:9", "1:1"], default: "9:16" },
      { key: "duration", label: "Duration", type: "pills", options: [5, 10, 15], default: 10, suffix: "s" },
      { key: "resolution", label: "Resolution", type: "pills", options: ["720p", "1080p"], default: "1080p" },
    ],
    uploads: [
      { key: "avatars", label: "Avatar Presets", type: "avatar-grid", options: MARKETING_AVATARS, max: 4 },
      { key: "custom_images", label: "Upload Your Own", accept: "image/*", max: 4, optional: true },
    ],
    promptPlaceholder: "A UGC-style ad for a luxury skincare product, energetic and authentic...",
    resultType: "video",
  },

  lipsync: {
    tool: "lipsync",
    label: "Lip Sync",
    models: LIPSYNC_MODELS,
    defaultModel: LIPSYNC_MODELS[0],
    settings: [
      { key: "resolution", label: "Resolution", type: "pills", fromModel: "resolutions", default: "720p", showIf: (m) => m.resolutions },
    ],
    uploads: [
      { key: "image_url", label: "Portrait Image", accept: "image/*", max: 1, required: true, showIf: (m) => m.mode === "image" },
      { key: "video_url", label: "Source Video", accept: "video/*", max: 1, required: true, showIf: (m) => m.mode === "video" },
      { key: "audio_url", label: "Audio Track", accept: "audio/*", max: 1, required: true },
    ],
    promptPlaceholder: "Describe the lip sync task (optional)...",
    resultType: "video",
    noPrompt: true,
  },

  "body-swap": {
    tool: "recast",
    label: "Body Swap",
    models: RECAST_MODELS,
    defaultModel: RECAST_MODELS[0],
    settings: [
      { key: "aspect_ratio", label: "Aspect", type: "pills", fromModel: "aspectRatios", default: "16:9" },
      { key: "character_orientation", label: "Orientation", type: "pills", options: ["left", "right"], default: "left", showIf: (m) => m.hasOrientation },
    ],
    uploads: [
      { key: "video_url", label: "Source Video", accept: "video/*", max: 1, required: true },
      { key: "image_url", label: "Face Image", accept: "image/*", max: 1, required: true },
    ],
    promptPlaceholder: "Describe the body swap (optional)...",
    resultType: "video",
    noPrompt: true,
  },

  influencer: {
    tool: "influencer",
    label: "Influencer",
    models: null,
    defaultModel: null,
    settings: [
      { key: "aspect_ratio", label: "Aspect", type: "pills", options: ["1:1", "3:4", "4:3", "9:16", "16:9"], default: "3:4" },
      ...INFLUENCER_TABS.flatMap(tab =>
        tab.categories.map(cat => ({
          key: `influencer_${cat.id}`,
          label: cat.label,
          type: "pills",
          options: cat.options.map(o => ({ id: o.id, label: o.label, promptVal: o.promptVal })),
          default: cat.options[0].id,
          group: tab.label,
        }))
      ),
    ],
    uploads: [],
    promptPlaceholder: "Additional custom prompt (optional)...",
    resultType: "image",
    buildPrompt: (prompt, settings) => {
      const parts = INFLUENCER_TABS.flatMap(tab =>
        tab.categories.map(cat => {
          const sel = settings[`influencer_${cat.id}`];
          const opt = cat.options.find(o => o.id === sel);
          return opt?.promptVal;
        })
      ).filter(Boolean);
      return [...parts, prompt, "high quality, professional photo, detailed"].filter(Boolean).join(", ");
    },
  },
};

export function getModeConfig(toolId) {
  return CHAT_MODES[toolId] || CHAT_MODES.image;
}