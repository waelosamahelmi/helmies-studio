import { describe, it, expect, vi, beforeEach } from "vitest";
import { join } from "node:path";

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  unlink: vi.fn(),
}));

import { readFile, writeFile, mkdir, unlink } from "node:fs/promises";
import { putObject, getObject, deleteObject, exists, getSignedUrl } from "@/lib/storage/local-driver";

const MEDIA_DIR = join(process.cwd(), "public", "media");
const UPLOADS_DIR = join(process.cwd(), "public", "uploads");

beforeEach(() => vi.clearAllMocks());

describe("local-driver putObject — writes under public/media", () => {
  it("writes the buffer under public/media/<key> and returns the local serving url", async () => {
    writeFile.mockResolvedValue();
    mkdir.mockResolvedValue();
    const buffer = Buffer.from("hello world");

    const result = await putObject("abc123-def456.jpg", buffer, "image/jpeg");

    expect(mkdir).toHaveBeenCalledWith(MEDIA_DIR, { recursive: true });
    expect(writeFile).toHaveBeenCalledWith(join(MEDIA_DIR, "abc123-def456.jpg"), buffer);
    expect(result).toEqual({ key: "abc123-def456.jpg", url: "/api/media/local/abc123-def456.jpg" });
  });

  it("sanitizes the key to its basename — no path traversal out of public/media", async () => {
    writeFile.mockResolvedValue();
    mkdir.mockResolvedValue();

    const result = await putObject("../../etc/passwd.jpg", Buffer.from("x"), "image/jpeg");

    expect(writeFile).toHaveBeenCalledWith(join(MEDIA_DIR, "passwd.jpg"), Buffer.from("x"));
    expect(result.key).toBe("passwd.jpg");
    expect(result.url).toBe("/api/media/local/passwd.jpg");
  });
});

describe("local-driver getObject — checks public/media then public/uploads", () => {
  it("returns the buffer and a content-type from public/media when found there", async () => {
    const buf = Buffer.from("image bytes");
    readFile.mockImplementation(async (path) => {
      if (path === join(MEDIA_DIR, "x.png")) return buf;
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });

    const result = await getObject("x.png");

    expect(result).toEqual({ buffer: buf, contentType: "image/png" });
    expect(readFile).toHaveBeenCalledWith(join(MEDIA_DIR, "x.png"));
  });

  it("falls back to public/uploads when the key is not in public/media", async () => {
    const buf = Buffer.from("upload bytes");
    readFile.mockImplementation(async (path) => {
      if (path === join(UPLOADS_DIR, "y.jpg")) return buf;
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });

    const result = await getObject("y.jpg");

    expect(result).toEqual({ buffer: buf, contentType: "image/jpeg" });
    expect(readFile).toHaveBeenCalledWith(join(MEDIA_DIR, "y.jpg"));
    expect(readFile).toHaveBeenCalledWith(join(UPLOADS_DIR, "y.jpg"));
  });

  it("returns null when the key exists in neither directory", async () => {
    readFile.mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));

    const result = await getObject("missing.png");

    expect(result).toBeNull();
  });
});

describe("local-driver deleteObject / exists", () => {
  it("deleteObject removes the file from public/media and returns true", async () => {
    unlink.mockResolvedValue();

    const result = await deleteObject("z.png");

    expect(result).toBe(true);
    expect(unlink).toHaveBeenCalledWith(join(MEDIA_DIR, "z.png"));
  });

  it("deleteObject falls back to public/uploads when not in public/media", async () => {
    unlink.mockImplementation(async (path) => {
      if (path === join(MEDIA_DIR, "z.png")) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });

    const result = await deleteObject("z.png");

    expect(result).toBe(true);
    expect(unlink).toHaveBeenCalledWith(join(UPLOADS_DIR, "z.png"));
  });

  it("deleteObject returns false when the key is in neither directory", async () => {
    unlink.mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));

    const result = await deleteObject("nope.png");

    expect(result).toBe(false);
  });

  it("exists returns true when getObject finds the key, false otherwise", async () => {
    readFile.mockResolvedValueOnce(Buffer.from("x"));
    expect(await exists("found.png")).toBe(true);

    readFile.mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
    expect(await exists("missing.png")).toBe(false);
  });
});

describe("local-driver getSignedUrl — ttl is ignored", () => {
  it("returns the same plain url regardless of ttlSeconds", () => {
    expect(getSignedUrl("k.png", 60)).toBe("/api/media/local/k.png");
    expect(getSignedUrl("k.png", 999999)).toBe("/api/media/local/k.png");
    expect(getSignedUrl("../k.png")).toBe("/api/media/local/k.png");
  });
});
