import { describe, it, expect } from "vitest";
import { sniffMatchesMime } from "@/lib/upload-sniff";

// Magic-byte verification of the actual upload content, independent of the
// declared Content-Type. The route already trusts the declared MIME for the
// ALLOWED_TYPES/extension decision (Task pre-existing); this closes the gap
// where an attacker declares an allowed MIME but uploads different bytes
// (e.g. an HTML/script payload declared as image/png).

const jpegValid = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const pngValid = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const webpValid = Buffer.concat([
  Buffer.from("RIFF", "ascii"),
  Buffer.from([0x24, 0x00, 0x00, 0x00]),
  Buffer.from("WEBP", "ascii"),
]);
const gifValid = Buffer.from("GIF89a\x00\x00\x00\x00\x00\x00", "ascii");
const mp4Valid = Buffer.concat([
  Buffer.from([0x00, 0x00, 0x00, 0x18]),
  Buffer.from("ftyp", "ascii"),
  Buffer.from("isom", "ascii"),
]);
const webmValid = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x00, 0x00, 0x00, 0x00]);
const mp3ValidId3 = Buffer.from("ID3\x03\x00\x00\x00\x00\x00\x00", "ascii");
const mp3ValidFrameSync = Buffer.from([0xff, 0xfb, 0x90, 0x44, 0x00, 0x00, 0x00, 0x00]);
const wavValid = Buffer.concat([
  Buffer.from("RIFF", "ascii"),
  Buffer.from([0x24, 0x00, 0x00, 0x00]),
  Buffer.from("WAVE", "ascii"),
]);

describe("sniffMatchesMime — valid signature per declared type", () => {
  it("image/jpeg — FF D8 FF", () => {
    expect(sniffMatchesMime(jpegValid, "image/jpeg")).toBe(true);
  });

  it("image/png — 89 50 4E 47 0D 0A 1A 0A", () => {
    expect(sniffMatchesMime(pngValid, "image/png")).toBe(true);
  });

  it("image/webp — RIFF....WEBP", () => {
    expect(sniffMatchesMime(webpValid, "image/webp")).toBe(true);
  });

  it("image/gif — GIF89a", () => {
    expect(sniffMatchesMime(gifValid, "image/gif")).toBe(true);
  });

  it("image/gif — GIF87a", () => {
    expect(sniffMatchesMime(Buffer.from("GIF87a\x00\x00\x00\x00\x00\x00", "ascii"), "image/gif")).toBe(true);
  });

  it("video/mp4 — ftyp at offset 4", () => {
    expect(sniffMatchesMime(mp4Valid, "video/mp4")).toBe(true);
  });

  it("video/webm — 1A 45 DF A3", () => {
    expect(sniffMatchesMime(webmValid, "video/webm")).toBe(true);
  });

  it("audio/mpeg — ID3 header", () => {
    expect(sniffMatchesMime(mp3ValidId3, "audio/mpeg")).toBe(true);
  });

  it("audio/mp3 — FF Ex/FF Fx frame sync", () => {
    expect(sniffMatchesMime(mp3ValidFrameSync, "audio/mp3")).toBe(true);
  });

  it("audio/wav — RIFF....WAVE", () => {
    expect(sniffMatchesMime(wavValid, "audio/wav")).toBe(true);
  });

  it("audio/x-wav — RIFF....WAVE", () => {
    expect(sniffMatchesMime(wavValid, "audio/x-wav")).toBe(true);
  });
});

describe("sniffMatchesMime — mismatches rejected", () => {
  it("a PNG buffer declared as image/jpeg fails", () => {
    expect(sniffMatchesMime(pngValid, "image/jpeg")).toBe(false);
  });

  it("a JPEG buffer declared as image/png fails", () => {
    expect(sniffMatchesMime(jpegValid, "image/png")).toBe(false);
  });

  it("an HTML <script> payload declared as image/png fails", () => {
    const html = Buffer.from("<script>alert(document.cookie)</script>", "utf8");
    expect(sniffMatchesMime(html, "image/png")).toBe(false);
  });

  it("an HTML <script> payload declared as image/jpeg fails", () => {
    const html = Buffer.from("<script>alert(document.cookie)</script>", "utf8");
    expect(sniffMatchesMime(html, "image/jpeg")).toBe(false);
  });

  it("an HTML <script> payload declared as image/svg+xml (unknown mime) fails", () => {
    const html = Buffer.from("<script>alert(document.cookie)</script>", "utf8");
    expect(sniffMatchesMime(html, "image/svg+xml")).toBe(false);
  });
});

describe("sniffMatchesMime — truncated buffers fail safe", () => {
  const short = Buffer.from([0x00, 0x01, 0x02]);

  it("< 12 byte buffer never matches image/webp (needs offset 8-11)", () => {
    expect(sniffMatchesMime(short, "image/webp")).toBe(false);
  });

  it("< 12 byte buffer never matches audio/wav (needs offset 8-11)", () => {
    expect(sniffMatchesMime(short, "audio/wav")).toBe(false);
  });

  it("empty buffer matches nothing", () => {
    const empty = Buffer.alloc(0);
    for (const mime of [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "video/mp4",
      "video/webm",
      "audio/mpeg",
      "audio/mp3",
      "audio/wav",
      "audio/x-wav",
    ]) {
      expect(sniffMatchesMime(empty, mime)).toBe(false);
    }
  });

  it("truncated PNG (first 4 bytes only) fails", () => {
    expect(sniffMatchesMime(pngValid.subarray(0, 4), "image/png")).toBe(false);
  });
});

describe("sniffMatchesMime — unknown mime types", () => {
  it("returns false for a mime not in the allowed set", () => {
    expect(sniffMatchesMime(jpegValid, "application/pdf")).toBe(false);
  });

  it("returns false when buffer is not a Buffer", () => {
    expect(sniffMatchesMime("not-a-buffer", "image/png")).toBe(false);
    expect(sniffMatchesMime(null, "image/png")).toBe(false);
    expect(sniffMatchesMime(undefined, "image/jpeg")).toBe(false);
  });
});
