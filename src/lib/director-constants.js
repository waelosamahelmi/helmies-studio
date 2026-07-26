export const SECTION_VISUAL_STRATEGY = {
  intro: {
    camera: { framing: "wide establishing shot", angle: "eye-level or low angle", lens: "24mm wide", movement: "subtle push-in or static", intensity: "building" },
    energy: "atmospheric slow reveal",
    notes: "Set the scene, establish environment and mood"
  },
  verse: {
    camera: { framing: "medium shot", angle: "eye-level", lens: "35mm or 50mm", movement: "subtle handheld float or static", intensity: "steady narrative" },
    energy: "intimate storytelling",
    notes: "Character focus, subtle motion, grounded energy"
  },
  chorus: {
    camera: { framing: "dynamic mix — wide + close-ups", angle: "low angle, dutch tilt, or sweeping", lens: "16-24mm wide + 85mm tight", movement: "dynamic — dolly, crane, or whip pan", intensity: "peak energy" },
    energy: "bold, high-impact",
    notes: "Maximize visual impact, hit downbeats, bold framing"
  },
  bridge: {
    camera: { framing: "unique — top-down, macro, or extreme close-up", angle: "unconventional angle", lens: "macro 100mm or 14mm ultrawide", movement: "slow, dreamlike drift", intensity: "contrasting shift" },
    energy: "dreamy, surreal contrast",
    notes: "Provide visual contrast from verse/chorus, experimental"
  },
  outro: {
    camera: { framing: "wide shot, pulling back", angle: "eye-level or high angle", lens: "24mm wide", movement: "slow pull-back or fade to black", intensity: "fading" },
    energy: "reflective, resolving",
    notes: "Pull back, let the scene breathe, resolve the energy"
  },
  instrumental: {
    camera: { framing: "sweeping landscape or texture macro", angle: "aerial or macro", lens: "16mm ultrawide or 100mm macro", movement: "smooth sweeping motion", intensity: "atmospheric" },
    energy: "environment-driven, textural",
    notes: "Focus on environment, textures, atmosphere — not characters"
  },
  dialogue: {
    camera: { framing: "medium close-up, over-shoulder", angle: "eye-level", lens: "35mm or 50mm", movement: "minimal, locked or subtle drift", intensity: "conversational" },
    energy: "character-driven, intimate",
    notes: "Focus on facial expressions, eye contact, reaction shots"
  },
  action: {
    camera: { framing: "dynamic — wide + tracking", angle: "low angle or chase cam", lens: "24mm wide", movement: "tracking, handheld, or follow", intensity: "high" },
    energy: "kinetic, high-adrenaline",
    notes: "Fast cuts, dynamic movement, physical action focus"
  }
};

export const PRODUCTION_TYPE_PRESETS = {
  music_video: {
    label: "Music Video",
    defaultAspectRatio: "9:16",
    defaultDuration: 180,
    defaultModelImage: "flux-dev",
    defaultModelVideo: "wan-2.6",
    defaultModelAudio: "suno-v4",
    sectionStrategy: SECTION_VISUAL_STRATEGY,
    requireAudio: true,
    beatAware: true,
    shotsPerSection: { intro: 1, verse: 2, chorus: 2, bridge: 1, outro: 1, instrumental: 1 }
  },
  short_film: {
    label: "Short Film",
    defaultAspectRatio: "16:9",
    defaultDuration: 300,
    defaultModelImage: "flux-dev",
    defaultModelVideo: "kling-v2.1-i2v",
    defaultModelAudio: "suno-v4",
    sectionStrategy: SECTION_VISUAL_STRATEGY,
    requireAudio: true,
    beatAware: false,
    shotsPerSection: { intro: 1, verse: 1, chorus: 1, bridge: 1, outro: 1, dialogue: 2, action: 1 }
  },
  ad_product: {
    label: "Ad / Product Video",
    defaultAspectRatio: "1:1",
    defaultDuration: 30,
    defaultModelImage: "flux-dev",
    defaultModelVideo: "seedance-2.0",
    defaultModelAudio: "suno-v4",
    sectionStrategy: SECTION_VISUAL_STRATEGY,
    requireAudio: true,
    beatAware: false,
    shotsPerSection: { intro: 1, action: 2, outro: 1 }
  },
  social_campaign: {
    label: "Social Campaign",
    defaultAspectRatio: "9:16",
    defaultDuration: 60,
    defaultModelImage: "flux-dev",
    defaultModelVideo: "wan-2.6",
    defaultModelAudio: "suno-v4",
    sectionStrategy: SECTION_VISUAL_STRATEGY,
    requireAudio: true,
    beatAware: false,
    shotsPerSection: { intro: 1, chorus: 1, verse: 1, outro: 1 }
  },
  viral_video: {
    label: "Viral Video",
    defaultAspectRatio: "9:16",
    defaultDuration: 30,
    defaultModelImage: "flux-dev",
    defaultModelVideo: "wan-2.6",
    defaultModelAudio: "suno-v4",
    sectionStrategy: SECTION_VISUAL_STRATEGY,
    requireAudio: true,
    beatAware: false,
    shotsPerSection: { intro: 1, chorus: 1, action: 1, outro: 1 }
  }
};
