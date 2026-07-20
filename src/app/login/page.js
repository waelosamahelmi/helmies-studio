"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import Navbar from "@/components/Navbar";
import { IconGoogle, IconEye, IconEyeOff, IconArrowUpRight, IconBolt, IconMail } from "@/components/Icons";

const EASE = [0.32, 0.72, 0, 1];

export default function LoginPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = (e) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => setLoading(false), 1200);
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

            <h1 className="auth__title">{isLogin ? "Welcome back" : "Create your studio"}</h1>
            <p className="auth__lead">
              {isLogin ? "Sign in to continue creating with 200+ AI models." : "Start free with 10 credits. No card required."}
            </p>

            <button className="btn btn-secondary w-full justify-center" disabled={loading}>
              <IconGoogle className="auth__google" />
              Continue with Google
            </button>

            <div className="auth__divider">or</div>

            <form className="auth__form" onSubmit={submit}>
              <div className="field">
                <IconMail className="field__icon" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  disabled={loading}
                />
              </div>
              <div className="field">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={isLogin ? "Enter your password" : "At least 8 characters"}
                  required
                  minLength={8}
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="auth__eye"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <IconEyeOff /> : <IconEye />}
                </button>
              </div>

              <button type="submit" className="btn btn-primary w-full justify-center mt-2" disabled={loading}>
                {loading ? (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    {isLogin ? "Sign in" : "Create account"}
                    <span className="btn__icon"><IconArrowUpRight /></span>
                  </>
                )}
              </button>
            </form>

            <div className="auth__toggle">
              <span>{isLogin ? "New to Helmies?" : "Already have an account?"}</span>
              <button onClick={() => setIsLogin(!isLogin)} type="button">
                {isLogin ? "Create an account" : "Sign in"}
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