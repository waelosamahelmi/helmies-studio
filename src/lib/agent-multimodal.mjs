// Helmies Studio — turning what a person attached or said into something the
// model actually receives.
//
// OpenAI-shaped chat content is either a plain string or an ARRAY of typed
// parts. Everything in this studio spoke the string form, which is why the
// attach button had no effect for as long as it existed: the url travelled to
// the server, the server passed a string, and the picture was never in the
// request at all. The model then answered about it — confidently, from the
// filename and the surrounding sentence — and nothing anywhere said that it
// had not looked.
//
// Pure and worker-safe: no fetch, no prisma. Building the parts is separate
// from sending them so the shape can be tested without a network.

const IMAGE_RE = /\.(png|jpe?g|webp|gif|bmp)(\?|$)/i;
const AUDIO_RE = /\.(mp3|wav|m4a|ogg|flac|aac|webm)(\?|$)/i;
const VIDEO_RE = /\.(mp4|mov|webm|m4v)(\?|$)/i;

/** What an attachment IS, from its url or declared mime type. */
export function attachmentKind({ url = "", type = "" } = {}) {
  const mime = String(type || "").toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  const u = String(url || "");
  if (IMAGE_RE.test(u)) return "image";
  if (AUDIO_RE.test(u)) return "audio";
  if (VIDEO_RE.test(u)) return "video";
  return "file";
}

/**
 * Absolute urls, because the provider is not on our host.
 *
 * A relative "/api/media/local/x.png" is perfectly valid to a browser and
 * completely meaningless to OpenRouter — it resolves against THEIR host and
 * 404s. The same trap absolutizeMediaUrls exists for on the generation side.
 */
export function absoluteUrl(url, base) {
  const raw = String(url || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  const host = String(base || "").replace(/\/+$/, "");
  return raw.startsWith("/") ? `${host}${raw}` : `${host}/${raw}`;
}

/**
 * A user turn carrying files, as OpenAI content parts.
 *
 * The text always leads: a model given three pictures and no sentence will
 * describe them rather than do the job they were attached for.
 *
 * Anything that is not an image, audio or video is NAMED IN THE TEXT instead
 * of being dropped. A silently discarded attachment is the bug this module
 * exists to end, and quietly discarding the ones we cannot inline would be
 * the same bug wearing a different hat.
 */
export function buildUserParts(text, attachments = [], { baseUrl = "" } = {}) {
  const list = Array.isArray(attachments) ? attachments.slice(0, 8) : [];
  if (!list.length) return String(text ?? "");

  const parts = [];
  const unsupported = [];

  for (const a of list) {
    const url = absoluteUrl(a?.url, baseUrl);
    if (!url) continue;
    const kind = attachmentKind({ url, type: a?.type });
    if (kind === "image") {
      parts.push({ type: "image_url", image_url: { url } });
    } else if (kind === "audio") {
      // OpenRouter takes audio inline as base64; a url-only audio part is
      // not part of the schema, so it is named rather than pretended at.
      unsupported.push(`${a?.name || "audio"} (${url})`);
    } else if (kind === "video") {
      unsupported.push(`${a?.name || "video"} (${url})`);
    } else {
      unsupported.push(`${a?.name || "file"} (${url})`);
    }
  }

  const notes = unsupported.length
    ? `\n\n[Also attached, which you cannot open directly — refer to them by url when planning steps: ${unsupported.join("; ")}]`
    : "";

  return [{ type: "text", text: `${String(text ?? "")}${notes}` }, ...parts];
}

/** An audio clip as the part OpenRouter's audio-capable models expect. */
export function audioPart(base64, format = "wav") {
  return { type: "input_audio", input_audio: { data: base64, format } };
}

/** Plain text of a turn whose content may be parts — for persistence and logs. */
export function contentText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.filter((p) => p?.type === "text").map((p) => p.text).join("\n").trim();
}
