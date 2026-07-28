"use client";

import { useState, createContext, useContext, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { signIn } from "next-auth/react";
import { IconGoogle, IconArrowUpRight, IconClose } from "@/components/Icons";

const EASE = [0.32, 0.72, 0, 1];
const AuthContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthModalProvider({ children }) {
  const [showLogin, setShowLogin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [formLoading, setFormLoading] = useState(false);

  useEffect(() => {
    const handler = () => setShowLogin(true);
    window.addEventListener("auth:required", handler);
    return () => window.removeEventListener("auth:required", handler);
  }, []);

  const handleGoogle = async () => {
    setLoading(true);
    await signIn("google", { callbackUrl: window.location.pathname });
  };

  const handleCredentials = async (e) => {
    e.preventDefault();
    setError("");
    setFormLoading(true);
    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });
      if (result?.error) {
        setError("Invalid email or password.");
        return;
      }
      setShowLogin(false);
      window.location.reload();
    } finally {
      setFormLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{ requireAuth: () => setShowLogin(true) }}>
      {children}
      <AnimatePresence>
        {showLogin && (
          <motion.div
            className="auth-modal__overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: EASE }}
            onClick={() => setShowLogin(false)}
          >
            <motion.div
              className="auth-modal__card bezel"
              initial={{ opacity: 0, scale: 0.92, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 30 }}
              transition={{ duration: 0.5, ease: EASE }}
              onClick={(e) => e.stopPropagation()}
            >
              <button className="auth-modal__close" onClick={() => setShowLogin(false)}>
                <IconClose />
              </button>
              <div className="auth__core bezel__core">
                <div className="auth__brand">
                  <img src="/ico.svg" alt="" className="auth__brand-mark" />
                  <span className="auth__brand-text">Studio</span>
                </div>

                <h2 className="auth__title" style={{ fontSize: "1.5rem" }}>Sign in to continue</h2>
                <p className="auth__lead">
                  Create with 70+ AI models. Your generations are waiting.
                </p>

                <form className="auth__form" onSubmit={handleCredentials}>
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
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                  />

                  {error && <p className="auth__error" role="alert">{error}</p>}

                  <button className="btn btn-primary w-full justify-center" type="submit" disabled={formLoading || loading}>
                    {formLoading ? (
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        Sign in
                        <span className="btn__icon"><IconArrowUpRight /></span>
                      </>
                    )}
                  </button>
                </form>

                <div className="auth__divider"><span>or</span></div>

                <button className="btn btn-ghost w-full justify-center" onClick={handleGoogle} disabled={loading || formLoading}>
                  {loading ? (
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <IconGoogle className="auth__google" />
                      Continue with Google
                    </>
                  )}
                </button>

                <p className="auth__legal">
                  By continuing, you agree to our Terms of Service and Privacy Policy.
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </AuthContext.Provider>
  );
}
