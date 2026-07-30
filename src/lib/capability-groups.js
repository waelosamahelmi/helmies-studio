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
  ttv: ["text-to-video"],
  i2v: ["image-to-video", "i2v"],
  v2v: ["video-to-video", "v2v", "video-upscale"],
  audio: ["audio", "text-to-speech"],
  lipsync: ["lipsync", "avatar-video"],
};

export function matchesGroup(model, group) {
  const caps = CAPABILITY_GROUPS[group] || [];
  return caps.includes(model?.capability);
}
