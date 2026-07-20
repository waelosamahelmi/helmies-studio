"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

const EASE = [0.32, 0.72, 0, 1];

export default function RichSelect({ options, selected, onSelect, label }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selectedOption = options.find((o) => o.id === selected?.id) || options[0];

  return (
    <div className="model-picker" ref={ref}>
      {label && <label className="field-label">{label}</label>}
      <button className="model-picker__trigger" onClick={() => setOpen(!open)}>
        <span className="model-picker__trigger-name">{selectedOption?.name || "Select"}</span>
        <span className="model-picker__trigger-arrow">{open ? "▲" : "▼"}</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="model-picker__dropdown"
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.2, ease: EASE }}
          >
            <div className="model-picker__list">
              {options.map((o) => (
                <button
                  key={o.id}
                  className={`model-picker__card ${o.id === selectedOption?.id ? "model-picker__card--selected" : ""}`}
                  onClick={() => { onSelect(o); setOpen(false); }}
                >
                  <div className="model-picker__card-header">
                    <span className="model-picker__card-name">{o.name}</span>
                  </div>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
