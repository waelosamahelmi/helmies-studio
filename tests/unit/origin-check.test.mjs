import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// @/lib/authz transitively imports @/lib/session and @/lib/prisma (for
// requireUser/requireAdminUser) — neither is exercised by verifyOrigin, but
// both must be mocked so importing authz.js doesn't drag in the real
// next-auth/Prisma module graph, same as tests/unit/authz.test.mjs.
vi.mock("@/lib/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ default: { user: { findUnique: vi.fn() } } }));

import { verifyOrigin } from "@/lib/origin-check";
import { AuthzError, authzResponse } from "@/lib/authz";

// Origin verification for cookie-session state-changing routes. These tests
// must not depend on the ambient environment's NEXTAUTH_URL (dev runs on
// localhost:3003, prod on https://studio.helmies.fi) — every test sets it
// explicitly and restores it afterward.

function makeReq(headers) {
  return { headers: new Headers(headers) };
}

const ORIGINAL_NEXTAUTH_URL = process.env.NEXTAUTH_URL;

describe("verifyOrigin", () => {
  beforeEach(() => {
    process.env.NEXTAUTH_URL = "https://studio.helmies.fi";
  });

  afterEach(() => {
    if (ORIGINAL_NEXTAUTH_URL === undefined) delete process.env.NEXTAUTH_URL;
    else process.env.NEXTAUTH_URL = ORIGINAL_NEXTAUTH_URL;
  });

  it("passes when Origin matches NEXTAUTH_URL's origin", () => {
    const req = makeReq({ origin: "https://studio.helmies.fi" });
    expect(verifyOrigin(req)).toBe(true);
  });

  it("throws AuthzError(403, generic message) when Origin is a different site", () => {
    const req = makeReq({ origin: "https://evil.example.com" });
    let caught;
    try {
      verifyOrigin(req);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(AuthzError);
    expect(caught.status).toBe(403);
    expect(caught.publicMessage).toBe("Cross-origin request rejected");
  });

  it("rejects a same-site-looking but wrong-port Origin", () => {
    const req = makeReq({ origin: "https://studio.helmies.fi:8080" });
    expect(() => verifyOrigin(req)).toThrow(AuthzError);
  });

  it("falls back to Referer's origin when Origin is absent", () => {
    const req = makeReq({ referer: "https://studio.helmies.fi/studio/canvas?doc=1" });
    expect(verifyOrigin(req)).toBe(true);
  });

  it("rejects when Referer is cross-site and Origin is absent", () => {
    const req = makeReq({ referer: "https://evil.example.com/phish" });
    expect(() => verifyOrigin(req)).toThrow(AuthzError);
  });

  it("prefers Origin over Referer when both are present", () => {
    const req = makeReq({ origin: "https://studio.helmies.fi", referer: "https://evil.example.com/x" });
    expect(verifyOrigin(req)).toBe(true);
  });

  it("rejects when both Origin and Referer are missing and allowMissing is false (the default)", () => {
    const req = makeReq({});
    expect(() => verifyOrigin(req)).toThrow(AuthzError);
  });

  it("passes when both Origin and Referer are missing and allowMissing is explicitly true", () => {
    const req = makeReq({});
    expect(verifyOrigin(req, { allowMissing: true })).toBe(true);
  });

  it("still rejects a present-but-wrong Origin even when allowMissing is true", () => {
    const req = makeReq({ origin: "https://evil.example.com" });
    expect(() => verifyOrigin(req, { allowMissing: true })).toThrow(AuthzError);
  });

  it("rejects an opaque 'null' Origin header with no usable Referer", () => {
    const req = makeReq({ origin: "null" });
    expect(() => verifyOrigin(req)).toThrow(AuthzError);
  });

  it("fails closed (403) when NEXTAUTH_URL is unset, even for a plausible same-origin header", () => {
    delete process.env.NEXTAUTH_URL;
    const req = makeReq({ origin: "https://studio.helmies.fi" });
    expect(() => verifyOrigin(req)).toThrow(AuthzError);
  });

  it("authzResponse renders the thrown error as a 403 with only the generic public message", async () => {
    const req = makeReq({ origin: "https://evil.example.com" });
    let caught;
    try {
      verifyOrigin(req);
    } catch (e) {
      caught = e;
    }
    const res = authzResponse(caught);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toMatchObject({ error: "Cross-origin request rejected", code: "forbidden" });
    expect(body.errorId).toMatch(/^[0-9a-f-]{8}$/);
  });
});
