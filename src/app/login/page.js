"use client";

import { useState, Suspense } from "react";
import { signIn } from "next-auth/react";
import { motion } from "framer-motion";
import Navbar from "@/components/Navbar";
import { IconGoogle, IconArrowUpRight } from "@/components/Icons";

const EASE = [0.32, 0.72, 0, 1];

function LoginContent() {
  const [loading, setLoading] = useState(false);

  const handleGoogle = async () => {
    setLoading(true);
    await signIn("google", { callbackUrl: "/studio" });
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

            <h1 className="auth__title">Welcome to Helmies Studio</h1>
            <p className="auth__lead">
              Sign in to create with 70+ AI models. Start free with 100 credits.
            </p>

            <button className="btn btn-primary w-full justify-center" onClick={handleGoogle} disabled={loading}>
              {loading ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <IconGoogle className="auth__google" />
                  Continue with Google
                  <span className="btn__icon"><IconArrowUpRight /></span>
                </>
              )}
            </button>

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