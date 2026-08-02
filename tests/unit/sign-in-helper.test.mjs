import { describe, it, expect, vi, beforeEach } from "vitest";

// signInWithRetry (src/lib/sign-in.js) is the shared helper behind both
// login surfaces (src/app/login/page.js, src/components/AuthModal.js). It
// exists because NextAuth v5 throws `MissingCSRF: CSRF token was missing
// during an action callback` on the first credentials sign-in against a
// freshly started server (~1 in 3 cold starts) — a race that resolves
// {error: <something other than "CredentialsSignin">}, not a bad
// password. Both surfaces used to show the "email and password do not
// match" copy for ANY signIn error, so a correct password looked wrong
// right after every deploy/PM2 restart.

vi.mock("next-auth/react", () => ({
  signIn: vi.fn(),
}));

import { signIn } from "next-auth/react";
import { signInWithRetry } from "@/lib/sign-in";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("signInWithRetry", () => {
  it("resolves ok:true and calls signIn exactly once when the first attempt succeeds", async () => {
    signIn.mockResolvedValueOnce({ error: undefined, ok: true, status: 200, url: "/studio" });

    const result = await signInWithRetry({ email: "a@b.com", password: "correct" });

    expect(result).toEqual({ ok: true });
    expect(signIn).toHaveBeenCalledTimes(1);
    expect(signIn).toHaveBeenCalledWith("credentials", {
      email: "a@b.com",
      password: "correct",
      redirect: false,
    });
  });

  it("a genuine bad password (CredentialsSignin) is reported as kind 'credentials' and is NEVER retried", async () => {
    signIn.mockResolvedValueOnce({ error: "CredentialsSignin", ok: false, status: 401, url: null });

    const result = await signInWithRetry({ email: "a@b.com", password: "wrong" });

    expect(result).toEqual({ ok: false, kind: "credentials", error: "CredentialsSignin" });
    expect(signIn).toHaveBeenCalledTimes(1);
  });

  it("a non-credentials failure (e.g. the CSRF race surfacing as Configuration) is retried exactly once and can succeed", async () => {
    signIn
      .mockResolvedValueOnce({ error: "Configuration", ok: false, status: 401, url: null })
      .mockResolvedValueOnce({ error: undefined, ok: true, status: 200, url: "/studio" });

    const result = await signInWithRetry({ email: "a@b.com", password: "correct" });

    expect(result).toEqual({ ok: true });
    expect(signIn).toHaveBeenCalledTimes(2);
    expect(signIn).toHaveBeenNthCalledWith(1, "credentials", {
      email: "a@b.com",
      password: "correct",
      redirect: false,
    });
    expect(signIn).toHaveBeenNthCalledWith(2, "credentials", {
      email: "a@b.com",
      password: "correct",
      redirect: false,
    });
  });

  it("a non-credentials failure that fails again on the single retry is reported as kind 'other' — never the credentials kind", async () => {
    signIn
      .mockResolvedValueOnce({ error: "Configuration", ok: false, status: 401, url: null })
      .mockResolvedValueOnce({ error: "Configuration", ok: false, status: 401, url: null });

    const result = await signInWithRetry({ email: "a@b.com", password: "correct" });

    expect(result).toEqual({ ok: false, kind: "other", error: "Configuration" });
    // Exactly one retry — not a loop: two calls total, not three or more.
    expect(signIn).toHaveBeenCalledTimes(2);
  });
});
