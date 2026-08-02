// Phase 4B Task 4: the storage-related exports that used to live here
// (downloadMedia, downloadAllMedia — Task 1's back-compat shims over
// src/lib/storage/ingest.js's ingestFromUrl) were deleted once the last two
// call sites (src/lib/generation-webhook.js, src/lib/job-runner.js) moved to
// calling ingestFromUrl directly. extractKieResults is unrelated to storage
// (pure KIE callback payload parsing) and stays — src/lib/generation-webhook.js
// still imports it from here.

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
