/**
 * Shared capability-group mapping for studio model filtering.
 *
 * The live catalog (synced from KIE) stores FRAGMENTED capability strings —
 * e.g. valid text-to-image models carry either "text-to-image" or "image".
 * Studios must filter by GROUP, never by a single capability string.
 */
export const CAPABILITY_GROUPS = {
  tti: ["text-to-image", "image"],
  iti: ["image-to-image", "i2i", "image-edit", "image-upscale", "background-removal"],
  // Coarse "video" is a REAL first-class capability (~14 live models the
  // sync legitimately files there — see CAPABILITY_TO_MODEL_TYPE's header
  // in model-catalog-core.mjs). It belongs in ttv exactly the way coarse
  // "image" already lives in tti; before this it was in NO group, so those
  // models were invisible in every video picker.
  ttv: ["text-to-video", "video"],
  i2v: ["image-to-video", "i2v"],
  v2v: ["video-to-video", "v2v", "video-upscale"],
  r2v: ["reference-to-video"],
  audio: ["audio", "text-to-speech"],
  lipsync: ["lipsync", "avatar-video"],
};

export function matchesGroup(model, group) {
  const caps = CAPABILITY_GROUPS[group] || [];
  return caps.includes(model?.capability);
}
