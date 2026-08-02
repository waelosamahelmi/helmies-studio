"use client";

/* ══════════════════════════════════════════════════════════════════════════
   AUTH MODAL
   ──────────────────────────────────────────────────────────────────────────
   Opens on the `auth:required` window event that lib/client-fetch.js
   dispatches on any 401, so a session that expired mid-session interrupts
   the work instead of failing silently. Also exposed as useAuth().requireAuth()
   for the places that know up front that a sign-in is needed.

   Mounted once by components/Providers.js.
   ══════════════════════════════════════════════════════════════════════════ */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { signInWithRetry } from "@/lib/sign-in";
import { Modal } from "@/components/studio/kit/Sheet";
import { IcEye, IcEyeOff } from "@/components/studio/kit/Icons";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const AuthContext = createContext({ requireAuth: () => {} });

export function useAuth() {
  return useContext(AuthContext);
}

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

export function AuthModalProvider({ children }) {
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [reveal, setReveal] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [google, setGoogle] = useState(false);

  /* Any 401 anywhere in the app lands here. */
  useEffect(() => {
    const onRequired = () => {
      setFormError("Your session ended. Sign in and we will put you back where you were.");
      setOpen(true);
    };
    window.addEventListener("auth:required", onRequired);
    return () => window.removeEventListener("auth:required", onRequired);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setFormError("");
    setFieldErrors({});
    setPassword("");
  }, []);

  const requireAuth = useCallback(() => {
    setFormError("");
    setOpen(true);
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!email.trim()) errs.email = "Enter your email address.";
    else if (!EMAIL_RE.test(email.trim())) errs.email = "That does not look like an email address.";
    if (!password) errs.password = "Enter your password.";
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;

    setFormError("");
    setSubmitting(true);
    try {
      const result = await signInWithRetry({ email: email.trim(), password });
      if (!result.ok) {
        setFormError(
          result.kind === "credentials"
            // A genuine bad password.
            ? "That email and password do not match an account."
            // Not a bad password (signInWithRetry already retried once) —
            // most likely the cold-start CSRF race. Say so honestly
            // instead of accusing the user of a wrong password.
            : "Something went wrong signing you in. Please try again.",
        );
        return;
      }
      setOpen(false);
      setPassword("");
      // Refresh rather than reload: server data re-fetches, client state stays.
      router.refresh();
    } catch {
      setFormError("Sign-in could not complete. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const withGoogle = async () => {
    setFormError("");
    setGoogle(true);
    try {
      await signIn("google", {
        callbackUrl: typeof window !== "undefined" ? window.location.href : "/studio",
      });
    } catch {
      setGoogle(false);
      setFormError("Google sign-in could not start. Use email and password instead.");
    }
  };

  const value = useMemo(() => ({ requireAuth }), [requireAuth]);

  return (
    <AuthContext.Provider value={value}>
      {children}

      <Modal open={open} onClose={close} title="Sign in to continue">
        <div className="hs-stack" style={{ gap: "var(--s-5)" }}>
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
            <div className="hs-field">
              <label className="hs-label" htmlFor="modal-email">Email</label>
              <input
                id="modal-email"
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
                aria-describedby={fieldErrors.email ? "modal-email-error" : undefined}
              />
              {fieldErrors.email && <p className="hs-error" id="modal-email-error">{fieldErrors.email}</p>}
            </div>

            <div className="hs-field">
              <label className="hs-label" htmlFor="modal-password">Password</label>
              <div style={{ position: "relative" }}>
                <input
                  id="modal-password"
                  className="hs-input"
                  type={reveal ? "text" : "password"}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setFieldErrors((p) => ({ ...p, password: "" })); }}
                  autoComplete="current-password"
                  required
                  aria-invalid={fieldErrors.password ? "true" : undefined}
                  aria-describedby={fieldErrors.password ? "modal-password-error" : undefined}
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
              {fieldErrors.password && <p className="hs-error" id="modal-password-error">{fieldErrors.password}</p>}
            </div>

            <div aria-live="assertive" style={{ marginTop: formError ? "var(--s-4)" : 0 }}>
              {formError && <p className="hs-notice hs-notice--fault">{formError}</p>}
            </div>

            <button
              type="submit"
              className="hs-btn hs-btn--primary hs-btn--block"
              style={{ marginTop: "var(--s-5)" }}
              disabled={submitting || google}
            >
              {submitting && <span className="hs-spin" aria-hidden="true" />}
              {submitting ? "Signing in" : "Sign in"}
            </button>
          </form>

          <p className="pg-auth__legal">
            No account yet? <Link href="/login?new=1">Create one</Link> — it comes with 100 credits.
          </p>
        </div>
      </Modal>
    </AuthContext.Provider>
  );
}

export default AuthModalProvider;
