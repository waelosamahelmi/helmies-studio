"use client";

import { motion, AnimatePresence } from "framer-motion";
import { IconClose } from "@/components/Icons";

export default function MobileToolDrawer({
  isOpen,
  onClose,
  activeTool,
  onSelect,
  tools = [],
}) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="v6-mobile-drawer-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="v6-mobile-drawer"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="v6-mobile-drawer__eyebrow">
              <button onClick={onClose} aria-label="Close drawer" style={{ position: "absolute", right: 16, top: 12, width: 44, height: 44, display: "grid", placeItems: "center", border: 0, background: "transparent", color: "var(--v6-muted)", cursor: "pointer", borderRadius: "50%" }}>
                <IconClose />
              </button>
              <span style={{ fontSize: 14, fontWeight: 600, color: "var(--v6-text)" }}>All Tools</span>
            </div>
            <div className="v6-mobile-drawer__grid">
              {tools.map((tool) => (
                <button
                  key={tool.id}
                  className={[
                    "v6-mobile-drawer__item",
                    activeTool === tool.id && "v6-active",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => {
                    onSelect?.(tool.id);
                    onClose();
                  }}
                >
                  <tool.Icon />
                  <span>{tool.label}</span>
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
