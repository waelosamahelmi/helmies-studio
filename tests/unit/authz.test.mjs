import { describe, it, expect, vi, beforeEach } from "vitest";

// Central authz module: correct 401 (unauthenticated) vs 403 (authenticated
// non-admin), and no internal error messages leaking to the client on
// unrelated failures — only a generic "Internal error" 500, with the real
// error console.error'd server-side for operators to see.

vi.mock("@/lib/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  default: { user: { findUnique: vi.fn() } },
}));

import { getCurrentUser } from "@/lib/session";
import prisma from "@/lib/prisma";
import { AuthzError, requireUser, requireAdminUser, authzResponse } from "@/lib/authz";

beforeEach(() => vi.clearAllMocks());

describe("AuthzError", () => {
  it("carries status and publicMessage, and is a real Error", () => {
    const e = new AuthzError(403, "Forbidden");
    expect(e).toBeInstanceOf(Error);
    expect(e.status).toBe(403);
    expect(e.publicMessage).toBe("Forbidden");
    expect(e.message).toBe("Forbidden");
  });
});

describe("requireUser", () => {
  it("returns the user when authenticated", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1" });
    const user = await requireUser();
    expect(user).toEqual({ id: "u1" });
  });

  it("throws AuthzError(401) when unauthenticated", async () => {
    getCurrentUser.mockResolvedValue(null);
    await expect(requireUser()).rejects.toMatchObject({ status: 401 });
    await expect(requireUser()).rejects.toBeInstanceOf(AuthzError);
  });
});

describe("requireAdminUser", () => {
  it("throws AuthzError(401) when unauthenticated (never touches the role check)", async () => {
    getCurrentUser.mockResolvedValue(null);

    await expect(requireAdminUser()).rejects.toMatchObject({ status: 401 });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("throws AuthzError(403) 'Forbidden' when authenticated but not an admin", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1" });
    prisma.user.findUnique.mockResolvedValue({ role: "user" });

    let caught;
    try {
      await requireAdminUser();
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(AuthzError);
    expect(caught.status).toBe(403);
    // Response body must say exactly "Forbidden" — never the user's role, id,
    // or any other detail that could help an attacker enumerate accounts.
    expect(caught.publicMessage).toBe("Forbidden");
    expect(caught.publicMessage).not.toMatch(/user/i);
    // Public message must be the flat literal — not a stack trace or
    // anything containing newlines/frame markers.
    expect(caught.publicMessage).not.toMatch(/\n|\bat\b/);
  });

  it("returns the user when the DB role is admin", async () => {
    getCurrentUser.mockResolvedValue({ id: "admin1" });
    prisma.user.findUnique.mockResolvedValue({ role: "admin" });

    const user = await requireAdminUser();
    expect(user).toEqual({ id: "admin1" });
  });
});

describe("authzResponse", () => {
  it("maps AuthzError(401) to a 401 response with the public message", async () => {
    const res = authzResponse(new AuthzError(401, "Unauthorized"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: "Unauthorized" });
  });

  it("maps AuthzError(403) to a 403 response with the public message", async () => {
    const res = authzResponse(new AuthzError(403, "Forbidden"));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({ error: "Forbidden" });
  });

  it("maps any other error to a generic 500 'Internal error' and never leaks e.message", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const dbError = new Error("db exploded: connection string contains password=hunter2");

    const res = authzResponse(dbError);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: "Internal error" });
    expect(JSON.stringify(body)).not.toContain("hunter2");
    expect(JSON.stringify(body)).not.toContain("db exploded");

    // The real error is still surfaced server-side for operators.
    expect(errSpy).toHaveBeenCalledWith(dbError);
  });
});
