// Helmies Studio — Agent output classification + display + assembly (pure).
//
// Worker-safe shared core extracted from src/lib/agents.js (Phase A): the
// durable agent runner (src/lib/agent-runner.js) executes in the plain-node
// worker where the "@/" alias cannot resolve, so these pure helpers live
// here with zero imports. agents.js re-exports/delegates to this module so
// the web path and the worker path never diverge.
//
// Media classification heuristics match what WorkflowStudio uses to decide
// what a URL is, so the builder's thumbnails and the engine's step wiring
// never disagree: the file extension, plus the "/video/" path segment some
// delivery URLs carry instead of one.

export const MEDIA_AGENT_KEYS = new Set([
  "image", "video", "audio", "marketing", "i2v", "upscale", "music", "voiceover",
]);

// Light slug normalization — the worker cannot load the AGENTS registry
// (agents.js uses "@/" imports), and for media-kind dispatch the canonical
// keys are already literal slugs, so slugify alone suffices here. The full
// registry-aware normalizeAgentKey stays in agents.js for the web path.
export function normalizeAgentKeyLite(agent) {
  if (!agent || typeof agent !== "string") return "";
  return agent.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

export const isMediaAgent = (agent) => MEDIA_AGENT_KEYS.has(normalizeAgentKeyLite(agent));

export const isMediaUrl = (v) => typeof v === "string" && /^(https?:\/\/|\/)/.test(v.trim());
export const isVideoOutput = (v) => isMediaUrl(v) && (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(v) || v.includes("/video/"));
export const isAudioOutput = (v) => isMediaUrl(v) && /\.(mp3|wav|ogg|m4a|flac|aac)(\?|$)/i.test(v);
export const isImageOutput = (v) => isMediaUrl(v) && !isVideoOutput(v) && !isAudioOutput(v);

// The newest earlier output that is a still image. Videos and audio are
// skipped rather than mistaken for a frame.
export function latestImageOutput(previousOutputs = []) {
  for (let i = previousOutputs.length - 1; i >= 0; i--) {
    if (isImageOutput(previousOutputs[i])) return previousOutputs[i];
  }
  return null;
}

const isHttpUrl = (v) => typeof v === "string" && /^https?:\/\//i.test(v);
export const proxiedUrl = (url) => `/api/media/proxy?url=${encodeURIComponent(url)}`;

// Display form of a step output: media URLs go through the app's own proxy
// so no provider hostname is ever user-facing; text passes through. An
// export step's result object carries raw URLs inside — its deliverable and
// manifest entries are proxied the same way before anything user-facing
// sees them.
export function displayOutputFor(step, output) {
  if (output && typeof output === "object" && output.kind === "export") {
    return {
      ...output,
      url: isHttpUrl(output.url) ? proxiedUrl(output.url) : output.url,
      manifest: Array.isArray(output.manifest)
        ? output.manifest.map((entry) => (isHttpUrl(entry?.url) ? { ...entry, url: proxiedUrl(entry.url) } : entry))
        : output.manifest,
    };
  }
  if (isMediaAgent(step?.agent) && isHttpUrl(output)) return proxiedUrl(output);
  return output;
}

function manifestEntry(output, index) {
  const step = index + 1;
  if (isVideoOutput(output)) return { step, type: "video", url: output };
  if (isAudioOutput(output)) return { step, type: "audio", url: output };
  if (isImageOutput(output)) return { step, type: "image", url: output };
  if (typeof output === "string") return { step, type: "text", text: output.slice(0, 2000) };
  return { step, type: "data", data: output ?? null };
}

// Export — the closing step's result: names the deliverable and lists
// everything the run made. Pure (the durable runner executes it in-worker).
export function buildExportResult(params, previousOutputs = [], task = null) {
  const manifest = previousOutputs.map(manifestEntry);
  // The deliverable is the newest video (an assembled cut is a video, and it
  // is by construction the last one), else the newest file of any kind.
  const deliverable =
    [...previousOutputs].reverse().find(isVideoOutput) ||
    [...previousOutputs].reverse().find(isMediaUrl) ||
    null;
  return {
    kind: "export",
    name: params?.name || task || "Deliverable",
    url: deliverable,
    manifest,
  };
}

// Assemble the run's final display outputs. `outputs` is the per-step array
// of display-form outputs (null for hidden steps like storyboard); `steps`
// is the plan's step list (for agent labels + assembly detection).
export function assembleOutputs(outputs, steps) {
  const images = [];
  const videos = [];
  const audio = [];
  const text = [];
  let deliverable = null;

  outputs.forEach((output, i) => {
    if (!output) return; // storyboard steps leave a null display output by design
    if (output && typeof output === "object" && output.kind === "export") {
      if (typeof output.url === "string" && output.url) {
        deliverable = { url: output.url, name: output.name || "Deliverable" };
      }
      return; // never dump the export manifest into the text bucket
    }
    if (typeof output !== "string") {
      text.push({ step: i + 1, agent: steps[i]?.agent, content: JSON.stringify(output)?.slice(0, 500) });
      return;
    }
    if (output.match(/\.(jpg|jpeg|png|webp|gif)$/i) || (output.includes("cloudfront") && !output.match(/\.(mp4|webm)$/i))) {
      images.push({ step: i + 1, url: output });
    } else if (output.match(/\.(mp4|webm|mov)$/i)) {
      videos.push({ step: i + 1, url: output });
    } else if (output.match(/\.(mp3|wav|ogg|flac)$/i)) {
      audio.push({ step: i + 1, url: output });
    } else {
      text.push({ step: i + 1, content: output.slice(0, 2000) });
    }
  });

  // No export step ran, but an assembly joined clips — the assembled cut
  // (by construction the newest video) IS the deliverable.
  if (!deliverable && videos.length && Array.isArray(steps) && steps.some((s) => normalizeAgentKeyLite(s?.agent) === "assembly")) {
    deliverable = { url: videos[videos.length - 1].url, name: "Assembled video" };
  }

  return { images, videos, audio, text, deliverable, total: outputs.length };
}
