"use client";

import { useState, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import Navbar from "@/components/Navbar";
import { IconGoogle, IconArrowUpRight } from "@/components/Icons";

const EASE = [0.32, 0.72, 0, 1];

function LoginContent() {
  const router = useRouter();
  const [mode, setMode] = useState("signin"); // "signin" | "register"
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleGoogle = async () => {
    setGoogleLoading(true);
    await signIn("google", { callbackUrl: "/studio" });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "register") {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, password }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error || "Registration failed. Please try again.");
          return;
        }
      }
      const result = await signIn("credentials", { email, password, redirect: false });
      if (result?.error) {
        setError(mode === "register"
          ? "Account created, but sign-in failed. Please sign in."
          : "Invalid email or password.");
        return;
      }
      router.push("/studio");
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = () => {
    setMode(mode === "signin" ? "register" : "signin");
    setError("");
  };

  return (
    <>
      <Navbar />
      <div className="grain" aria-hidden="true" />

      <section className="auth">
        <div className="auth__bg">
          <video src="/assets/12709382_1920_1080_30fps-39.webm" poster="/assets/photo-1506905925346-21bda4d32df4-6.webp" muted loop playsInline autoPlay />
        </div>
        <div className="auth__scrim" />

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: EASE, delay: 0.15 }}
          className="auth__card bezel"
        >
          <div className="auth__core bezel__core">
            <div className="auth__brand">
              <img src="/ico.svg" alt="" className="auth__brand-mark" />
              <span className="auth__brand-text">Studio</span>
            </div>

            <h1 className="auth__title">
              {mode === "signin" ? "Welcome to Helmies Studio" : "Create your account"}
            </h1>
            <p className="auth__lead">
              {mode === "signin"
                ? "Sign in to create with 70+ AI models. Start free with 100 credits."
                : "Join Helmies Studio and start free with 100 credits."}
            </p>

            <form className="auth__form" onSubmit={handleSubmit}>
              {mode === "register" && (
                <input
                  className="auth__input"
                  type="text"
                  placeholder="Name (optional)"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                />
              )}
              <input
                className="auth__input"
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
              <input
                className="auth__input"
                type="password"
                placeholder={mode === "register" ? "Password (min 8 characters)" : "Password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={mode === "register" ? 8 : undefined}
                autoComplete={mode === "register" ? "new-password" : "current-password"}
              />

              {error && <p className="auth__error" role="alert">{error}</p>}

              <button className="btn btn-primary w-full justify-center" type="submit" disabled={loading}>
                {loading ? (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    {mode === "signin" ? "Sign in" : "Create account"}
                    <span className="btn__icon"><IconArrowUpRight /></span>
                  </>
                )}
              </button>
            </form>

            <div className="auth__divider"><span>or</span></div>

            <button className="btn btn-ghost w-full justify-center" onClick={handleGoogle} disabled={googleLoading || loading}>
              {googleLoading ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <IconGoogle className="auth__google" />
                  Continue with Google
                </>
              )}
            </button>

            <div className="auth__toggle">
              {mode === "signin" ? "New here?" : "Already have an account?"}
              <button type="button" onClick={toggleMode}>
                {mode === "signin" ? "Create an account" : "Sign in"}
              </button>
            </div>

            <p className="auth__legal">
              By continuing, you agree to our Terms of Service and Privacy Policy.<br />
              Payments are Stripe-secured.
            </p>
          </div>
        </motion.div>
      </section>
    </>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  );
}
