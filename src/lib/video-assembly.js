import { execFile } from "child_process";
import { promisify } from "util";
import { createHash, randomBytes } from "crypto";
import { writeFile, mkdir, unlink } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import { validateOutboundUrl } from "@/lib/net-allowlist";

const execFileAsync = promisify(execFile);
const MEDIA_DIR = join(process.cwd(), "public", "media");

// Hard caps — this writes attacker-influenced bytes to local disk.
export const MAX_CLIPS = 40;
const MAX_BYTES_PER_CLIP = 500 * 1024 * 1024; // 500MB

async function ensureMediaDir() {
  if (!existsSync(MEDIA_DIR)) await mkdir(MEDIA_DIR, { recursive: true });
}

async function downloadToTemp(url) {
  // SSRF guard: only allowlisted provider hosts (plus our own origin).
  const check = await validateOutboundUrl(url, { allowSelf: true });
  if (!check.ok) throw new Error(`Refusing to fetch URL: ${check.error}`);

  const res = await fetch(check.parsed.toString(), { signal: AbortSignal.timeout(120000) });
  if (!res.ok) throw new Error(`Failed to download: ${res.status}`);

  // Reject on the advertised length before buffering when the server gives it.
  const declared = parseInt(res.headers.get("content-length") || "", 10);
  if (Number.isFinite(declared) && declared > MAX_BYTES_PER_CLIP) {
    throw new Error("Clip too large");
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length > MAX_BYTES_PER_CLIP) throw new Error("Clip too large");

  const hash = createHash("sha256").update(url).digest("hex").slice(0, 8);
  const ext = check.parsed.pathname.match(/\.(mp4|webm|mov)$/i)?.[1]?.toLowerCase() || "mp4";
  const tmpPath = join(MEDIA_DIR, `_tmp_${hash}_${randomBytes(4).toString("hex")}.${ext}`);
  await writeFile(tmpPath, buffer);
  return tmpPath;
}

export async function assembleVideos(urls, options = {}) {
  if (!Array.isArray(urls) || urls.length === 0) throw new Error("No videos to assemble");
  if (urls.length > MAX_CLIPS) throw new Error(`Too many clips (max ${MAX_CLIPS})`);

  // Validate every URL up-front so nothing is written to disk if any is bad.
  for (const url of urls) {
    const check = await validateOutboundUrl(url, { allowSelf: true });
    if (!check.ok) throw new Error(`Refusing to fetch URL: ${check.error}`);
  }

  await ensureMediaDir();

  const transition = options.transition || "fade";
  const transitionDuration = options.transitionDuration || 0.5;
  const outputName = `assembled_${randomBytes(8).toString("hex")}.mp4`;
  const outputPath = join(MEDIA_DIR, outputName);

  const tempFiles = [];
  try {
    for (const url of urls) {
      const tmpPath = await downloadToTemp(url);
      tempFiles.push(tmpPath);
    }

    if (tempFiles.length === 0) throw new Error("No videos to assemble");
    if (tempFiles.length === 1) {
      const singlePath = join(MEDIA_DIR, outputName);
      const { rename } = await import("fs/promises");
      await rename(tempFiles[0], singlePath);
      return `/api/media/local/${outputName}`;
    }

    const concatList = tempFiles.map((f) => `file '${f.replace(/\\/g, "/")}'`).join("\n");
    const listPath = join(MEDIA_DIR, `_concat_${randomBytes(4).toString("hex")}.txt`);
    await writeFile(listPath, concatList);

    const args = [
      "-f", "concat",
      "-safe", "0",
      "-i", listPath,
      "-c:v", "libx264",
      "-preset", "fast",
      "-crf", "23",
      "-c:a", "aac",
      "-b:a", "128k",
      "-movflags", "+faststart",
      "-y",
      outputPath,
    ];

    await execFileAsync("ffmpeg", args, { timeout: 300000 });

    return `/api/media/local/${outputName}`;
  } finally {
    for (const f of tempFiles) {
      try { await unlink(f); } catch {}
    }
    const listPath = join(MEDIA_DIR, `_concat_*.txt`);
    try { await unlink(listPath); } catch {}
  }
}
