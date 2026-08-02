/* ══════════════════════════════════════════════════════════════════════════
   SIGN-IN RETRY HELPER
   ──────────────────────────────────────────────────────────────────────────
   NextAuth v5 throws `MissingCSRF: CSRF token was missing during an action
   callback` on the first credentials sign-in against a freshly started
   server — reproduced ~1 in 3 cold starts (right after a deploy/PM2
   restart). It's logged server-side only; on the client,
   signIn(..., { redirect: false }) just resolves with an `error` that is
   NOT "CredentialsSignin". Both login surfaces (src/app/login/page.js,
   src/components/AuthModal.js) used to treat any signIn error the same
   way and show "That email and password do not match an account." —
   which, for a user with the RIGHT password hitting the CSRF race, was a
   lie told reliably after every deploy.

   signInWithRetry distinguishes the two failure kinds:
     - "credentials": error === "CredentialsSignin" — a genuine bad
       password. Reported immediately, never retried — retrying a real
       bad-password attempt would only slow it down and muddy the signal
       (and could look like a bot hammering the endpoint).
     - "other": any other error (CSRF race, transport hiccup,
       misconfiguration). Retried exactly once — the CSRF race resolves on
       the second attempt because the token cookie is set by the first
       round trip. Only if the retry ALSO fails do we report "other" to
       the caller, which should show a distinct, honest message instead
       of the credentials copy.
   ══════════════════════════════════════════════════════════════════════════ */

import { signIn } from "next-auth/react";

/**
 * @param {{ email: string, password: string }} credentials
 * @returns {Promise<{ ok: true } | { ok: false, kind: "credentials" | "other", error: string }>}
 */
export async function signInWithRetry(credentials) {
  const attempt = () => signIn("credentials", { ...credentials, redirect: false });

  const first = await attempt();
  if (!first?.error) return { ok: true };
  if (first.error === "CredentialsSignin") {
    return { ok: false, kind: "credentials", error: first.error };
  }

  // Not a bad password — most likely the cold-start CSRF race. Retry once;
  // by now the CSRF cookie the first attempt set is in place.
  const retry = await attempt();
  if (!retry?.error) return { ok: true };
  return { ok: false, kind: "other", error: retry.error };
}

export default signInWithRetry;
