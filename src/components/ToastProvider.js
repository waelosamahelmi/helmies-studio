"use client";

import { useState, useEffect, useCallback, createContext, useContext } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { IconClose } from "@/components/Icons";

const ToastContext = createContext(null);
const EASE = [0.32, 0.72, 0, 1];

let toastId = 0;

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = "info", duration = 5000) => {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, message, type }]);
    if (duration > 0) {
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), duration);
    }
    return id;
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const notifyGeneration = useCallback((tool, url) => {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, message: `Your ${tool} is ready!`, type: "success", url, isGeneration: true }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 15000);
    return id;
  }, []);

  return (
    <ToastContext.Provider value={{ addToast, removeToast, notifyGeneration }}>
      {children}
      <div className="toast-container">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              className={`toast toast--${t.type} ${t.isGeneration ? "toast--generation" : ""}`}
              initial={{ opacity: 0, y: 50, x: 50, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, x: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.9 }}
              transition={{ duration: 0.4, ease: EASE }}
            >
              {t.isGeneration && t.url && (
                <img src={t.url} alt="" className="toast__thumb" />
              )}
              <span className="toast__message">{t.message}</span>
              <button className="toast__close" onClick={() => removeToast(t.id)}>
                <IconClose />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
