import { describe, it, expect, vi, beforeEach } from "vitest";

// The upload route validates declared MIME + size (pre-existing), then
// writes bytes to disk and creates an Asset row. Task 5 adds a byte-level
// check: the actual content must match the declared MIME, using the same
// buffer already read for the write (no extra I/O). A mismatch must reject
// before any write or Asset creation.

vi.mock("@/lib/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/security", () => ({ checkRateLimit: vi.fn() }));
vi.mock("@/lib/origin-check", () => ({ verifyOrigin: vi.fn(() => true) }));
vi.mock("@/lib/authz", () => ({
  authzResponse: (e) =>
    Response.json({ error: e?.publicMessage ?? "Internal error" }, { status: e?.status ?? 500 }),
}));
vi.mock("fs/promises", () => ({ writeFile: vi.fn(), mkdir: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ default: { asset: { create: vi.fn() } } }));

import { getCurrentUser } from "@/lib/session";
import { checkRateLimit } from "@/lib/security";
import { writeFile, mkdir } from "fs/promises";
import prisma from "@/lib/prisma";
import { POST } from "@/app/api/upload/route.js";

const jpegValid = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const htmlPayload = Buffer.from("<script>alert(document.cookie)</script>", "utf8");

function uploadRequest(bytes, { type = "image/png", name = "evil.png" } = {}) {
  const formData = new FormData();
  const file = new File([bytes], name, { type });
  formData.append("file", file);
  return new Request("http://test/api/upload", { method: "POST", body: formData });
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: "u1" });
  checkRateLimit.mockResolvedValue({ allowed: true });
  writeFile.mockResolvedValue();
  mkdir.mockResolvedValue();
  prisma.asset.create.mockResolvedValue({ id: "a1" });
});

describe("POST /api/upload — byte-level content verification", () => {
  it("rejects an HTML payload declared as image/png with 400 and writes nothing", async () => {
    const res = await POST(uploadRequest(htmlPayload, { type: "image/png" }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "File content does not match its declared type" });
    expect(writeFile).not.toHaveBeenCalled();
    expect(prisma.asset.create).not.toHaveBeenCalled();
  });

  it("accepts a genuine JPEG declared as image/jpeg", async () => {
    const res = await POST(uploadRequest(jpegValid, { type: "image/jpeg", name: "photo.jpg" }));

    expect(res.status).toBe(200);
    expect(writeFile).toHaveBeenCalledTimes(1);
    expect(prisma.asset.create).toHaveBeenCalledTimes(1);
  });

  it("rejects a PNG buffer declared as image/jpeg", async () => {
    const pngValid = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

    const res = await POST(uploadRequest(pngValid, { type: "image/jpeg", name: "fake.jpg" }));

    expect(res.status).toBe(400);
    expect(writeFile).not.toHaveBeenCalled();
  });
});
