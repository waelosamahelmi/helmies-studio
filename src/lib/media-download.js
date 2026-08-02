// Back-compat shim (Phase 4B Task 1) for the storage-related exports.
// downloadAllMedia's real per-url download now goes through
// src/lib/storage/ingest.js's ingestFromUrl — this file preserves the OLD
// downloadAllMedia return shape (the first successfully-downloaded local
// url, or null) so the two pre-existing call sites
// (src/lib/generation-webhook.js, src/lib/job-runner.js) need no change in
// this task. extractKieResults is unrelated to storage (pure payload
// parsing) and is untouched. Phase 4B Task 4 switches the two call sites to
// ingestFromUrl directly and deletes downloadMedia/downloadAllMedia from
// this file — extractKieResults stays.
import { ingestFromUrl } from "./storage/ingest.js";

/**
 * Download a media file from a URL to local storage.
 * Returns the local url (/api/media/local/{filename}) or the original URL if download fails.
 */
export async function downloadMedia(url) {
  if (!url || typeof url !== "string") return null;

  // Already a local URL
  if (url.startsWith("/api/media/local/")) return url;

  try {
    const { url: storedUrl } = await ingestFromUrl(url);
    return storedUrl;
  } catch (e) {
    console.error("downloadMedia error:", e.message);
    // Fall back to original URL if download fails
    return url;
  }
}

/**
 * Download all media URLs from a KIE resultJson or outputs array.
 * Returns the first downloaded local URL (for backward compat with outputUrl field).
 */
export async function downloadAllMedia(urls) {
  if (!urls || !Array.isArray(urls) || urls.length === 0) return null;

  const downloaded = [];
  for (const url of urls) {
    const local = await downloadMedia(url);
    if (local) downloaded.push(local);
  }

  return downloaded.length > 0 ? downloaded[0] : null;
}

/**
 * Parse KIE callback format and extract result URLs.
 * KIE sends: { code: 200, data: { taskId, state, resultJson: '{"resultUrls":["..."]}' } }
 */
export function extractKieResults(body) {
  // KIE Market API format
  if (body.data?.resultJson) {
    try {
      const parsed = JSON.parse(body.data.resultJson);
      return {
        taskId: body.data.taskId,
        state: body.data.state,
        urls: parsed.resultUrls || parsed.output || [],
        error: body.data.failMsg || null,
      };
    } catch {
      return { taskId: body.data?.taskId, state: body.data?.state, urls: [], error: "Failed to parse resultJson" };
    }
  }

  // KIE Veo/Suno format (legacy)
  if (body.data?.resultUrls) {
    try {
      const urls = typeof body.data.resultUrls === "string" ? JSON.parse(body.data.resultUrls) : body.data.resultUrls;
      return {
        taskId: body.data?.taskId,
        state: body.data?.successFlag === 1 ? "success" : body.data?.successFlag === 2 ? "fail" : "generating",
        urls: Array.isArray(urls) ? urls : [urls],
        error: null,
      };
    } catch {
      return { taskId: body.data?.taskId, state: "unknown", urls: [], error: null };
    }
  }

  // Generic request_id format (backward compat with legacy providers)
  if (body.request_id || body.data?.request_id) {
    return {
      taskId: body.data?.request_id || body.request_id,
      state: body.status || body.data?.status,
      urls: body.outputs || body.data?.output || [],
      error: body.error || body.data?.error,
    };
  }

  return null;
}
