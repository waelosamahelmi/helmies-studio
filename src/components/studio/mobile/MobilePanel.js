"use client";

import { motion, AnimatePresence } from "framer-motion";
import { IconClose } from "@/components/Icons";

export default function MobilePanel({ isOpen, onClose, title, children }) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="v6-mobile-panel"
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 30, stiffness: 300 }}
        >
          <div className="v6-mobile-panel__header">
            <h2 className="v6-mobile-panel__title">{title}</h2>
            <button
              className="v6-mobile-panel__close"
              onClick={onClose}
              aria-label={`Close ${title}`}
            >
              <IconClose />
            </button>
          </div>
          <div className="v6-mobile-panel__body">{children}</div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
