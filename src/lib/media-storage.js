// Back-compat shim (Phase 4B Task 1). storeMedia's real implementation now
// lives in src/lib/storage/ingest.js (ingestFromUrl) — this file preserves
// the OLD signature/shape (providerUrl, contentType) -> url string so the
// three pre-existing call sites in src/lib/director-executor.js and the one
// in src/lib/generation-handler.js need no change in this task. Phase 4B
// Task 4 switches those call sites to ingestFromUrl directly (for the
// richer { url, key, bytes, sha256 } return) and deletes this file.
import { ingestFromUrl } from "./storage/ingest.js";

export async function storeMedia(providerUrl, contentType) {
  const { url } = await ingestFromUrl(providerUrl, { contentType });
  return url;
}
