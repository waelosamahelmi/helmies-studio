import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Fixed S3-compatible config used across this file. Path-style addressing
// (bucket in the path, not a virtual-hosted subdomain) per the Task 2 brief.
const ENV = {
  S3_ENDPOINT: "https://s3.fake-region-1.example.com",
  S3_REGION: "fake-region-1",
  S3_BUCKET: "helmies-test-bucket",
  S3_ACCESS_KEY_ID: "AKIDEXAMPLE1234567890",
  S3_SECRET_ACCESS_KEY: "secretKeyExample1234567890ABCDEFGHIJKLMN",
};

const savedEnv = {};

beforeEach(() => {
  for (const k of Object.keys(ENV)) {
    savedEnv[k] = process.env[k];
    process.env[k] = ENV[k];
  }
  delete process.env.S3_PUBLIC_BASE_URL;
});

afterEach(() => {
  for (const k of Object.keys(ENV)) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function fakeResponse({ ok = true, status = 200, statusText = "OK", headers = {}, body = Buffer.alloc(0) } = {}) {
  return {
    ok,
    status,
    statusText,
    headers: { get: (name) => headers[name.toLowerCase()] ?? null },
    arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
  };
}

describe("s3-driver putObject — SigV4 header signing", () => {
  it("issues a PUT to ${S3_ENDPOINT}/${S3_BUCKET}/${key} with Authorization, x-amz-content-sha256, x-amz-date", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse());
    vi.stubGlobal("fetch", fetchMock);
    const { putObject } = await import("@/lib/storage/s3-driver");

    await putObject("some-key.jpg", Buffer.from("hello"), "image/jpeg");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://s3.fake-region-1.example.com/helmies-test-bucket/some-key.jpg");
    expect(init.method).toBe("PUT");
    expect(init.headers.Authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=/);
    expect(init.headers["x-amz-content-sha256"]).toMatch(/^[0-9a-f]{64}$/);
    expect(init.headers["x-amz-date"]).toMatch(/^\d{8}T\d{6}Z$/);
    expect(init.headers["Content-Type"]).toBe("image/jpeg");
    expect(init.body).toEqual(Buffer.from("hello"));
  });

  it("throws when the PUT response is not ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse({ ok: false, status: 500, statusText: "Internal Server Error" })));
    const { putObject } = await import("@/lib/storage/s3-driver");

    await expect(putObject("k.jpg", Buffer.from("x"), "image/jpeg")).rejects.toThrow(/500/);
  });

  it("returns a stable app-relative url when S3_PUBLIC_BASE_URL is unset — never a presigned link", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse()));
    const { putObject } = await import("@/lib/storage/s3-driver");

    const result = await putObject("k.jpg", Buffer.from("x"), "image/jpeg");

    expect(result).toEqual({ key: "k.jpg", url: "/api/media/local/k.jpg" });
  });

  it("returns the same app-relative url even when S3_PUBLIC_BASE_URL IS configured — putObject never persists a bucket/CDN-direct link", async () => {
    process.env.S3_PUBLIC_BASE_URL = "https://cdn.example.com/media";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse()));
    const { putObject } = await import("@/lib/storage/s3-driver");

    const result = await putObject("k.jpg", Buffer.from("x"), "image/jpeg");

    expect(result.url).toBe("/api/media/local/k.jpg");
  });

  it("NEVER returns a url containing X-Amz-Signature — a presigned link must not be persisted (Generation.outputUrl would die after its ttl)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse()));
    const { putObject } = await import("@/lib/storage/s3-driver");

    const result = await putObject("some-key.jpg", Buffer.from("x"), "image/jpeg");

    expect(result.url).not.toContain("X-Amz-Signature");
  });
});

describe("s3-driver — SigV4 known-answer test (deterministic for a fixed key/date/payload)", () => {
  // Expected values below were computed independently of src/lib/storage/s3-driver.js,
  // by a standalone oracle script implementing the AWS Signature Version 4
  // spec (canonical request -> string to sign -> HMAC signing-key chain ->
  // signature) from scratch for this exact fixed scenario:
  //   method=PUT, region=fake-region-1, bucket=helmies-test-bucket,
  //   key=abcd1234efgh5678-90ab1234.jpg, host=s3.fake-region-1.example.com,
  //   accessKeyId=AKIDEXAMPLE1234567890,
  //   secretAccessKey=secretKeyExample1234567890ABCDEFGHIJKLMN,
  //   date=2024-06-15T10:30:00.000Z (amzDate 20240615T103000Z),
  //   payload="known-answer-test-payload".
  // See .superpowers/sdd/2026-08-02-phase4b-object-storage/report.md for the
  // oracle script and its full canonical-request/string-to-sign trace.
  const EXPECTED_PAYLOAD_SHA256 = "04b5989890847228d4b445fac7364f7ff796f18cac9728c99a323ab3fdddccd8";
  const EXPECTED_AUTHORIZATION =
    "AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE1234567890/20240615/fake-region-1/s3/aws4_request, " +
    "SignedHeaders=host;x-amz-content-sha256;x-amz-date, " +
    "Signature=191c372c94a916299229353c1c01cfebc2e9f7adf2ad5bc57f7f7bf21654c230";

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-15T10:30:00.000Z"));
  });

  it("reproduces the independently-computed Authorization header and x-amz-content-sha256 exactly", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse());
    vi.stubGlobal("fetch", fetchMock);
    const { putObject } = await import("@/lib/storage/s3-driver");

    await putObject("abcd1234efgh5678-90ab1234.jpg", Buffer.from("known-answer-test-payload"), "image/jpeg");

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers["x-amz-content-sha256"]).toBe(EXPECTED_PAYLOAD_SHA256);
    expect(init.headers["x-amz-date"]).toBe("20240615T103000Z");
    expect(init.headers.Authorization).toBe(EXPECTED_AUTHORIZATION);
  });

  it("reproduces the independently-computed presigned GET URL exactly", async () => {
    const { getSignedUrl } = await import("@/lib/storage/s3-driver");

    const url = getSignedUrl("presign-test-key.png", 900);

    expect(url).toBe(
      "https://s3.fake-region-1.example.com/helmies-test-bucket/presign-test-key.png?" +
        "X-Amz-Algorithm=AWS4-HMAC-SHA256&" +
        "X-Amz-Credential=AKIDEXAMPLE1234567890%2F20240615%2Ffake-region-1%2Fs3%2Faws4_request&" +
        "X-Amz-Date=20240615T103000Z&" +
        "X-Amz-Expires=900&" +
        "X-Amz-SignedHeaders=host&" +
        "X-Amz-Signature=29cd313e041090049456d42f8aac89cffb76733bdaaeb37a4701c16cbac21ee2"
    );
  });
});

describe("s3-driver getSignedUrl — presigned URL shape", () => {
  it("produces a URL with X-Amz-Expires and X-Amz-Signature query params", async () => {
    const { getSignedUrl } = await import("@/lib/storage/s3-driver");

    const url = getSignedUrl("some-key.png", 3600);
    const parsed = new URL(url);

    expect(parsed.origin + parsed.pathname).toBe("https://s3.fake-region-1.example.com/helmies-test-bucket/some-key.png");
    expect(parsed.searchParams.get("X-Amz-Expires")).toBe("3600");
    expect(parsed.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
    expect(parsed.searchParams.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
  });

  it("defaults ttlSeconds to 3600 when omitted", async () => {
    const { getSignedUrl } = await import("@/lib/storage/s3-driver");

    const url = getSignedUrl("some-key.png");

    expect(new URL(url).searchParams.get("X-Amz-Expires")).toBe("3600");
  });
});

describe("s3-driver getObject — 404 returns null, never throws", () => {
  it("returns null on a 404 response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse({ ok: false, status: 404 })));
    const { getObject } = await import("@/lib/storage/s3-driver");

    const result = await getObject("missing-key.png");

    expect(result).toBeNull();
  });

  it("returns { buffer, contentType } on a 200 response", async () => {
    const body = Buffer.from("image bytes");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(fakeResponse({ body, headers: { "content-type": "image/png" } }))
    );
    const { getObject } = await import("@/lib/storage/s3-driver");

    const result = await getObject("found-key.png");

    expect(result.buffer).toEqual(body);
    expect(result.contentType).toBe("image/png");
  });

  it("throws on a non-404 error status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse({ ok: false, status: 500, statusText: "Internal Server Error" })));
    const { getObject } = await import("@/lib/storage/s3-driver");

    await expect(getObject("k.png")).rejects.toThrow(/500/);
  });

  it("issues a GET with the same SigV4 header shape as putObject", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse({ body: Buffer.from("x") }));
    vi.stubGlobal("fetch", fetchMock);
    const { getObject } = await import("@/lib/storage/s3-driver");

    await getObject("k.png");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://s3.fake-region-1.example.com/helmies-test-bucket/k.png");
    expect(init.method).toBe("GET");
    expect(init.headers.Authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=/);
    expect(init.body).toBeUndefined();
  });
});

describe("s3-driver deleteObject / exists", () => {
  it("deleteObject issues a DELETE and returns true on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse({ status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const { deleteObject } = await import("@/lib/storage/s3-driver");

    const result = await deleteObject("k.png");

    expect(result).toBe(true);
    expect(fetchMock.mock.calls[0][1].method).toBe("DELETE");
  });

  it("deleteObject treats a 404 as success (already gone)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse({ ok: false, status: 404 })));
    const { deleteObject } = await import("@/lib/storage/s3-driver");

    expect(await deleteObject("k.png")).toBe(true);
  });

  it("exists issues a HEAD and returns true/false from the response status", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse());
    vi.stubGlobal("fetch", fetchMock);
    const { exists } = await import("@/lib/storage/s3-driver");

    expect(await exists("k.png")).toBe(true);
    expect(fetchMock.mock.calls[0][1].method).toBe("HEAD");

    fetchMock.mockResolvedValue(fakeResponse({ ok: false, status: 404 }));
    expect(await exists("missing.png")).toBe(false);
  });
});

describe("s3-driver — config validation", () => {
  it("throws a clear error when a required S3_* var is missing at call time", async () => {
    delete process.env.S3_ACCESS_KEY_ID;
    const { putObject } = await import("@/lib/storage/s3-driver");

    await expect(putObject("k.png", Buffer.from("x"), "image/png")).rejects.toThrow(/S3_ACCESS_KEY_ID/);
  });
});
