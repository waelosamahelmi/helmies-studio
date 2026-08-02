import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/storage", () => ({
  getDriver: vi.fn(),
  localDriver: { getObject: vi.fn() },
}));

import { getDriver, localDriver } from "@/lib/storage";
import { GET } from "@/app/api/media/local/[name]/route.js";

function req(name) {
  return { params: Promise.resolve({ name }) };
}

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; sandbox",
};

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.STORAGE_DRIVER;
});

afterEach(() => {
  delete process.env.STORAGE_DRIVER;
});

describe("GET /api/media/local/[name] — local driver path is byte-identical to today", () => {
  it("200s with the bytes and content-type from getDriver().getObject when STORAGE_DRIVER is unset (local default)", async () => {
    const buffer = Buffer.from("jpeg bytes");
    const getObject = vi.fn().mockResolvedValue({ buffer, contentType: "image/jpeg" });
    getDriver.mockReturnValue({ getObject });

    const res = await GET({}, req("photo.jpg"));

    expect(res.status).toBe(200);
    expect(getObject).toHaveBeenCalledWith("photo.jpg");
    expect(Buffer.from(await res.arrayBuffer())).toEqual(buffer);
    expect(res.headers.get("Content-Type")).toBe("image/jpeg");
  });

  it("sanitizes the requested name to its basename before calling the driver (no path traversal)", async () => {
    const getObject = vi.fn().mockResolvedValue({ buffer: Buffer.from("x") });
    getDriver.mockReturnValue({ getObject });

    await GET({}, req("../../etc/passwd.jpg"));

    expect(getObject).toHaveBeenCalledWith("passwd.jpg");
  });

  it("404s when the local driver has no such object, without ever consulting localDriver again", async () => {
    const getObject = vi.fn().mockResolvedValue(null);
    getDriver.mockReturnValue({ getObject });

    const res = await GET({}, req("missing.png"));

    expect(res.status).toBe(404);
    expect(localDriver.getObject).not.toHaveBeenCalled();
  });

  it("derives Content-Type from the route's own fixed extension map, ignoring the driver's reported contentType", async () => {
    const getObject = vi.fn().mockResolvedValue({ buffer: Buffer.from("x"), contentType: "text/html" });
    getDriver.mockReturnValue({ getObject });

    const res = await GET({}, req("clip.mp4"));

    expect(res.headers.get("Content-Type")).toBe("video/mp4");
  });

  it("falls through to application/octet-stream for an unrecognized extension (never renders as active content)", async () => {
    const getObject = vi.fn().mockResolvedValue({ buffer: Buffer.from("x") });
    getDriver.mockReturnValue({ getObject });

    const res = await GET({}, req("file.svg"));

    expect(res.headers.get("Content-Type")).toBe("application/octet-stream");
  });
});

describe("GET /api/media/local/[name] — STORAGE_DRIVER=s3", () => {
  beforeEach(() => {
    process.env.STORAGE_DRIVER = "s3";
  });

  it("serves bytes from the S3 driver when it has the object — localDriver is never consulted", async () => {
    const buffer = Buffer.from("from s3");
    const getObject = vi.fn().mockResolvedValue({ buffer, contentType: "image/png" });
    getDriver.mockReturnValue({ getObject });

    const res = await GET({}, req("k.png"));

    expect(res.status).toBe(200);
    expect(Buffer.from(await res.arrayBuffer())).toEqual(buffer);
    expect(localDriver.getObject).not.toHaveBeenCalled();
  });

  it("falls back to the local filesystem and still 200s when S3 is missing the object", async () => {
    const buffer = Buffer.from("pre-S3-era file on disk");
    getDriver.mockReturnValue({ getObject: vi.fn().mockResolvedValue(null) });
    localDriver.getObject.mockResolvedValue({ buffer, contentType: "image/png" });

    const res = await GET({}, req("legacy.png"));

    expect(res.status).toBe(200);
    expect(Buffer.from(await res.arrayBuffer())).toEqual(buffer);
    expect(localDriver.getObject).toHaveBeenCalledWith("legacy.png");
  });

  it("404s when the key is in neither S3 nor the local fallback", async () => {
    getDriver.mockReturnValue({ getObject: vi.fn().mockResolvedValue(null) });
    localDriver.getObject.mockResolvedValue(null);

    const res = await GET({}, req("nowhere.png"));

    expect(res.status).toBe(404);
  });
});

describe("GET /api/media/local/[name] — security headers present in every 200 response", () => {
  it.each([
    ["local driver", undefined, () => getDriver.mockReturnValue({ getObject: vi.fn().mockResolvedValue({ buffer: Buffer.from("x") }) })],
    ["s3 driver hit", "s3", () => getDriver.mockReturnValue({ getObject: vi.fn().mockResolvedValue({ buffer: Buffer.from("x") }) })],
    ["s3 driver miss, local fallback", "s3", () => {
      getDriver.mockReturnValue({ getObject: vi.fn().mockResolvedValue(null) });
      localDriver.getObject.mockResolvedValue({ buffer: Buffer.from("x") });
    }],
  ])("%s", async (_label, storageDriver, setup) => {
    if (storageDriver) process.env.STORAGE_DRIVER = storageDriver;
    setup();

    const res = await GET({}, req("k.jpg"));

    expect(res.status).toBe(200);
    for (const [header, value] of Object.entries(SECURITY_HEADERS)) {
      expect(res.headers.get(header)).toBe(value);
    }
  });
});
