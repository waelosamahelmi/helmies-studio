import { writeFile, mkdir } from "fs/promises";
import path from "path";
import crypto from "crypto";

/**
 * Download a media file from a URL to local storage.
 * Returns the local path (/api/media/local/{filename}) or the original URL if download fails.
 */
export async function downloadMedia(url) {
  if (!url || typeof url !== "string") return null;

  // Already a local URL
  if (url.startsWith("/api/media/local/")) return url;

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(60000),
    });

    if (!res.ok) return url; // Fall back to original URL

    const contentType = res.headers.get("content-type") || "";
    const buffer = Buffer.from(await res.arrayBuffer());

    // Determine extension from content-type
    const extMap = {
      "image/jpeg": ".jpg",
      "image/jpg": ".jpg",
      "image/png": ".png",
      "image/gif": ".gif",
      "image/webp": ".webp",
      "image/svg+xml": ".svg",
      "video/mp4": ".mp4",
      "video/webm": ".webm",
      "video/quicktime": ".mov",
      "audio/mpeg": ".mp3",
      "audio/wav": ".wav",
      "audio/ogg": ".ogg",
      "audio/x-wav": ".wav",
      "application/octet-stream": ".bin",
    };

    // Try to get extension from URL
    let ext = extMap[contentType];
    if (!ext) {
      const urlPath = new URL(url).pathname;
      const urlExt = path.extname(urlPath).toLowerCase();
      ext = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".mp4", ".webm", ".mov", ".mp3", ".wav", ".ogg"].includes(urlExt) ? urlExt : ".bin";
    }

    // Generate unique filename
    const filename = `${Date.now()}_${crypto.randomBytes(6).toString("hex")}${ext}`;
    const uploadDir = path.join(process.cwd(), "public", "uploads");
    const filePath = path.join(uploadDir, filename);

    // Ensure upload directory exists
    await mkdir(uploadDir, { recursive: true });

    // Write file
    await writeFile(filePath, buffer);

    // Return local API path
    return `/api/media/local/${filename}`;
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

  // WaveSpeed format (backward compat)
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