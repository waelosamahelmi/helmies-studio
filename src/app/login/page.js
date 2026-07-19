"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import Navbar from "@/components/Navbar";
import { FaGoogle, FaEye, FaEyeSlash, FaArrowRight } from "react-icons/fa";

export default function LoginPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  return (
    <div className="min-h-screen bg-surface">
      <Navbar />
      <div className="auth">
        <div className="auth__bg">
          <video src="/12709382_1920_1080_30fps-39.mp4" poster="/photo-1506905925346-21bda4d32df4-6.jpg" muted loop playsInline autoPlay />
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-surface/80 to-surface z-[1]" />

        <motion.div initial={{ opacity: 0, y: 24, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }} className="auth__card glass-heavy">
          <div className="text-center mb-6">
            <Link href="/"><img src="/helmies-logo-light.svg" alt="Helmies Studio" className="h-7 mx-auto mb-4" /></Link>
            <h1>{isLogin ? "Welcome back" : "Create your studio"}</h1>
            <p>{isLogin ? "Sign in to continue creating with 200+ AI models." : "Start free with 100 credits. No card required."}</p>
          </div>

          <button className="btn btn-secondary w-full justify-center mb-4" disabled={loading}>
            <FaGoogle style={{ color: "#EA4335" }} />
            Continue with Google
          </button>

          <div className="flex items-center gap-3 my-4">
            <span className="flex-1 h-px bg-white/[0.08]" />
            <span className="text-xs text-white/40">or</span>
            <span className="flex-1 h-px bg-white/[0.08]" />
          </div>

          <form className="flex flex-col gap-3" onSubmit={(e) => e.preventDefault()}>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="auth__input" required disabled={loading} />
            <div className="relative">
              <input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={isLogin ? "Enter your password" : "At least 8 characters"} className="auth__input pr-10" required minLength={8} disabled={loading} />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white text-sm">{showPassword ? <FaEyeSlash /> : <FaEye />}</button>
            </div>

            <button type="submit" className="btn btn-primary w-full justify-center mt-2" disabled={loading}>
              {loading ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <>{isLogin ? "Sign in" : "Create account"} <FaArrowRight className="text-xs" /></>}
            </button>
          </form>

          <div className="flex items-center justify-center gap-1 mt-4 text-sm text-white/50">
            <span>{isLogin ? "New to Helmies?" : "Already have an account?"}</span>
            <button onClick={() => setIsLogin(!isLogin)} className="text-brand font-semibold hover:underline">{isLogin ? "Create an account" : "Sign in"}</button>
          </div>

          <p className="text-[11px] text-white/30 text-center mt-4 leading-relaxed">
            By continuing, you agree to our Terms of Service and Privacy Policy. Payments are Stripe-secured.
          </p>
        </motion.div>
      </div>
    </div>
  );
}