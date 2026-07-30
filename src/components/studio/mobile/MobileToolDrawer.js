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
          className="v6-mobile-tool-drawer-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="v6-mobile-tool-drawer"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="v6-mobile-tool-drawer__header">
              <h2>All Tools</h2>
              <button onClick={onClose} aria-label="Close drawer">
                <IconClose />
              </button>
            </div>
            <div className="v6-mobile-tool-drawer__grid">
              {tools.map((tool) => (
                <button
                  key={tool.id}
                  className={[
                    "v6-mobile-tool-drawer__item",
                    activeTool === tool.id && "v6-mobile-tool-drawer__item--active",
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
