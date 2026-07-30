"use client";

/* ══════════════════════════════════════════════════════════════════════════
   LOGIN — /login  (?new=1 opens in sign-up mode, the navbar links to it)
   ──────────────────────────────────────────────────────────────────────────
   Two real providers, and only two: Google OAuth and email + password
   (next-auth Credentials, see lib/auth.js). Sign-up posts to
   /api/auth/register and then signs in with the same credentials, so the
   user never has to type them twice.
   ══════════════════════════════════════════════════════════════════════════ */

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { apiFetch } from "@/lib/client-fetch";
import { IcEye, IcEyeOff, IcChevronRight } from "@/components/studio/kit/Icons";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* Google's mark is a brand asset, not part of the machined icon set. */
function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: "none" }}>
      <path fill="#4285F4" d="M22.5 12.2c0-.8-.07-1.5-.2-2.2H12v4.2h5.9a5 5 0 01-2.2 3.3v2.7h3.6c2.1-1.9 3.2-4.8 3.2-8z" />
      <path fill="#34A853" d="M12 23c2.9 0 5.4-1 7.2-2.7l-3.6-2.7c-1 .7-2.2 1.1-3.6 1.1-2.8 0-5.2-1.9-6-4.4H2.3v2.8A11 11 0 0012 23z" />
      <path fill="#FBBC05" d="M6 14.3a6.6 6.6 0 010-4.2V7.3H2.3a11 11 0 000 9.8L6 14.3z" />
      <path fill="#EA4335" d="M12 5.4c1.6 0 3 .5 4.1 1.6l3.1-3.1A11 11 0 002.3 7.3L6 10.1c.8-2.5 3.2-4.7 6-4.7z" />
    </svg>
  );
}

/* NextAuth bounces OAuth failures back here as ?error=… — say what happened. */
const OAUTH_ERRORS = {
  OAuthAccountNotLinked:
    "That email already has a password account. Sign in with your password, then link Google from your account.",
  OAuthSignin: "Google could not be reached. Try again, or use email and password.",
  OAuthCallback: "Google sent back a response we could not read. Try again.",
  AccessDenied: "Google declined the sign-in. Try again and accept the permission prompt.",
  Configuration: "Sign-in is misconfigured on our side. Email hello@helmies.fi and we will fix it.",
  CredentialsSignin: "That email and password do not match an account.",
  Verification: "That sign-in link has expired. Request a new one.",
};

function Auth() {
  const router = useRouter();
  const params = useSearchParams();

  const wantsNew = params.get("new") === "1";
  const callbackUrl = params.get("callbackUrl") || "/studio";
  const oauthError = params.get("error");

  const [mode, setMode] = useState(wantsNew ? "register" : "signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [reveal, setReveal] = useState(false);

  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState(oauthError ? (OAUTH_ERRORS[oauthError] || "Sign-in failed. Try again.") : "");
  const [submitting, setSubmitting] = useState(false);
  const [google, setGoogle] = useState(false);

  useEffect(() => { setMode(wantsNew ? "register" : "signin"); }, [wantsNew]);

  const register = mode === "register";

  const validate = () => {
    const errs = {};
    if (!email.trim()) errs.email = "Enter your email address.";
    else if (!EMAIL_RE.test(email.trim())) errs.email = "That does not look like an email address.";
    if (!password) errs.password = "Enter your password.";
    else if (register && password.length < 8) errs.password = "Use at least 8 characters.";
    return errs;
  };

  const submit = async (e) => {
    e.preventDefault();
    setFormError("");
    const errs = validate();
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;

    setSubmitting(true);
    try {
      if (register) {
        // retries: 0 — a retried POST would race the unique-email check.
        await apiFetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim(), email: email.trim(), password }),
          retries: 0,
        });
      }

      const result = await signIn("credentials", {
        email: email.trim(),
        password,
        redirect: false,
      });

      if (result?.error) {
        setFormError(
          register
            ? "Your account was created but the sign-in did not go through. Try signing in now."
            : "That email and password do not match an account.",
        );
        if (register) setMode("signin");
        return;
      }

      router.push(callbackUrl);
      router.refresh();
    } catch (err) {
      // The register route returns real messages: duplicate email, weak
      // password, rate limit. Show them exactly as they came back.
      setFormError(err.message || "Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const withGoogle = async () => {
    setFormError("");
    setGoogle(true);
    try {
      await signIn("google", { callbackUrl });
    } catch {
      setGoogle(false);
      setFormError("Google sign-in could not start. Try email and password instead.");
    }
  };

  const swap = () => {
    setMode(register ? "signin" : "register");
    setFieldErrors({});
    setFormError("");
  };

  return (
    <main className="pg-auth">
      <div className="pg-auth__card">
        <div className="pg-auth__head">
          <Link href="/" className="pg-logo" style={{ justifyContent: "center", marginBottom: "var(--s-2)" }}>
            <img src="/ico.svg" alt="" width={24} height={24} />
            <strong>Helmies</strong>
            <span>Studio</span>
          </Link>
          <h1>{register ? "Create your account" : "Sign in"}</h1>
          <p>
            {register
              ? "100 credits land in your balance the moment you finish."
              : "Pick up where you left off."}
          </p>
        </div>

        <button
          type="button"
          className="hs-btn hs-btn--block"
          onClick={withGoogle}
          disabled={google || submitting}
        >
          {google ? <span className="hs-spin" aria-hidden="true" /> : <GoogleMark />}
          Continue with Google
        </button>

        <div className="pg-auth__or" aria-hidden="true">or</div>

        <form onSubmit={submit} noValidate>
          {register && (
            <div className="hs-field">
              <label className="hs-label" htmlFor="auth-name">Name <span className="hs-mute">(optional)</span></label>
              <input
                id="auth-name"
                className="hs-input"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                placeholder="How should we address you?"
              />
            </div>
          )}

          <div className="hs-field">
            <label className="hs-label" htmlFor="auth-email">Email</label>
            <input
              id="auth-email"
              className="hs-input"
              type="email"
              inputMode="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setFieldErrors((p) => ({ ...p, email: "" })); }}
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              required
              aria-invalid={fieldErrors.email ? "true" : undefined}
              aria-describedby={fieldErrors.email ? "auth-email-error" : undefined}
              placeholder="you@studio.com"
            />
            {fieldErrors.email && (
              <p className="hs-error" id="auth-email-error">{fieldErrors.email}</p>
            )}
          </div>

          <div className="hs-field">
            <label className="hs-label" htmlFor="auth-password">Password</label>
            <div style={{ position: "relative" }}>
              <input
                id="auth-password"
                className="hs-input"
                type={reveal ? "text" : "password"}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setFieldErrors((p) => ({ ...p, password: "" })); }}
                autoComplete={register ? "new-password" : "current-password"}
                minLength={register ? 8 : undefined}
                required
                aria-invalid={fieldErrors.password ? "true" : undefined}
                aria-describedby={fieldErrors.password ? "auth-password-error" : (register ? "auth-password-hint" : undefined)}
                style={{ paddingRight: "var(--s-10)" }}
              />
              <button
                type="button"
                onClick={() => setReveal((v) => !v)}
                className="hs-btn hs-btn--ghost hs-btn--sm hs-btn--icon"
                style={{ position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)" }}
                aria-label={reveal ? "Hide password" : "Show password"}
                aria-pressed={reveal}
              >
                {reveal ? <IcEyeOff className="hs-icon-sm" /> : <IcEye className="hs-icon-sm" />}
              </button>
            </div>
            {fieldErrors.password ? (
              <p className="hs-error" id="auth-password-error">{fieldErrors.password}</p>
            ) : register ? (
              <p className="hs-hint" id="auth-password-hint">At least 8 characters.</p>
            ) : null}
          </div>

          <div aria-live="assertive" style={{ marginTop: formError ? "var(--s-4)" : 0 }}>
            {formError && <p className="hs-notice hs-notice--fault">{formError}</p>}
          </div>

          <button
            type="submit"
            className="hs-btn hs-btn--primary hs-btn--lg hs-btn--block"
            style={{ marginTop: "var(--s-5)" }}
            disabled={submitting || google}
          >
            {submitting ? (
              <>
                <span className="hs-spin" aria-hidden="true" />
                <span className="hs-sr">Working</span>
                {register ? "Creating account" : "Signing in"}
              </>
            ) : (
              <>
                {register ? "Create account" : "Sign in"}
                <IcChevronRight className="hs-icon-sm" />
              </>
            )}
          </button>
        </form>

        <p style={{ fontSize: "var(--t-sm)", color: "var(--tx-dim)", textAlign: "center" }}>
          {register ? "Already have an account?" : "First time here?"}{" "}
          <button
            type="button"
            onClick={swap}
            style={{ color: "var(--filament-lit)", fontWeight: 500, textDecoration: "underline", textUnderlineOffset: 2 }}
          >
            {register ? "Sign in" : "Create one"}
          </button>
        </p>

        <p className="pg-auth__legal">
          By continuing you agree to the <Link href="/terms">Terms</Link> and{" "}
          <Link href="/privacy">Privacy policy</Link>. Payments run on Stripe; we never see your card.
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="pg-auth" aria-busy="true">
          <div className="pg-auth__card">
            <div className="hs-skel" style={{ height: 28, width: "60%", margin: "0 auto" }} />
            <div className="hs-skel" style={{ height: 44 }} />
            <div className="hs-skel" style={{ height: 44 }} />
            <div className="hs-skel" style={{ height: 48 }} />
          </div>
        </main>
      }
    >
      <Auth />
    </Suspense>
  );
}
