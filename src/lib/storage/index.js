// Storage driver selection (Phase 4B Task 1-2). One env var, STORAGE_DRIVER,
// picks the active backend everywhere media is read or written —
// storage/ingest.js, the serving route (src/app/api/media/local/[name]/route.js,
// Task 3), and anything else that calls getDriver(). "local" (today's only
// backend: public/media + public/uploads on disk) is the default so an
// unset STORAGE_DRIVER changes nothing about current production behavior.
// "s3" (Task 2) is the S3-compatible driver — its live path is BLOCKED
// pending credentials; see s3-driver.js's header comment.
//
// Plain-node safe: reachable from scripts/worker.mjs via
// src/lib/job-runner.js -> storage/ingest.js -> here (Task 4) — no "@/"
// alias, no extensionless relative import.
import * as localDriver from "./local-driver.js";
import * as s3Driver from "./s3-driver.js";

// Driver contract every backend implements identically:
//   putObject(key, buffer, contentType) -> { key, url }
//     `url` is an app-relative "/api/media/local/<key>" path from BOTH
//     drivers — stable and driver-independent, since it's what gets
//     persisted into Generation.outputUrl. Never a presigned or
//     bucket/CDN-direct URL; use getSignedUrl() for that instead.
//   getObject(key)                      -> { buffer, contentType } | null
//   deleteObject(key)                   -> boolean
//   exists(key)                         -> boolean
//   getSignedUrl(key, ttlSeconds)       -> string (direct, time-limited
//     link for callers that need one — NOT for persistence)
export function getDriver() {
  const which = (process.env.STORAGE_DRIVER || "local").toLowerCase();
  if (which === "s3") return s3Driver;
  if (which === "local") return localDriver;
  throw new Error(`Unknown STORAGE_DRIVER "${which}" — expected "local" or "s3".`);
}

export { localDriver, s3Driver };
