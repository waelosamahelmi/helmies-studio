import { describe, it, expect, vi, beforeEach } from "vitest";

const getObject = vi.fn();
vi.mock("@/lib/storage", () => ({
  getDriver: () => ({ getObject }),
  localDriver: { getObject },
}));

const { GET } = await import("@/app/api/media/local/[name]/route");

const BODY = Buffer.from("0123456789abcdefghij"); // 20 bytes
const req = (range) => ({ headers: { get: (k) => (k.toLowerCase() === "range" ? range : null) } });
const params = Promise.resolve({ name: "clip.mp4" });

beforeEach(() => {
  vi.clearAllMocks();
  getObject.mockResolvedValue({ buffer: BODY });
});

describe("video on an iPhone", () => {
  it("always says it can seek", async () => {
    // iOS decides whether a video is playable from this header before it
    // even asks for bytes.
    const res = await GET(req(null), { params });
    expect(res.headers.get("Accept-Ranges")).toBe("bytes");
    expect(res.status).toBe(200);
  });

  it("answers the opening probe with 206, not the whole file", async () => {
    // Safari opens with `Range: bytes=0-1`. A 200 with the entire body is
    // read as unseekable and the element never starts — which is exactly
    // what "videos don't open on iPhone" looked like.
    const res = await GET(req("bytes=0-1"), { params });
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe("bytes 0-1/20");
    expect(res.headers.get("Content-Length")).toBe("2");
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe("01");
  });

  it("serves an open-ended range to the end of the file", async () => {
    const res = await GET(req("bytes=10-"), { params });
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe("bytes 10-19/20");
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe("abcdefghij");
  });

  it("reads a suffix range as the LAST n bytes, not the first n", async () => {
    // "bytes=-5" means the final five. Getting this backwards serves the
    // wrong part of the file and the player shows nothing.
    const res = await GET(req("bytes=-5"), { params });
    expect(res.status).toBe(206);
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe("fghij");
  });

  it("clamps a range that runs past the end instead of over-reading", async () => {
    const res = await GET(req("bytes=15-999"), { params });
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe("bytes 15-19/20");
  });

  it("refuses a range that starts past the end, with the real size", async () => {
    const res = await GET(req("bytes=999-"), { params });
    expect(res.status).toBe(416);
    expect(res.headers.get("Content-Range")).toBe("bytes */20");
  });

  it("ignores a malformed range rather than serving the wrong bytes", async () => {
    const res = await GET(req("pages=1-2"), { params });
    expect(res.status).toBe(200);
    expect(Buffer.from(await res.arrayBuffer()).length).toBe(20);
  });

  it("still refuses to serve svg as active content", async () => {
    // The range work must not have widened what this route will render.
    const res = await GET(req(null), { params: Promise.resolve({ name: "x.svg" }) });
    expect(res.headers.get("Content-Type")).toBe("application/octet-stream");
  });
});
