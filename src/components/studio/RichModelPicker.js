"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { IconBolt, IconSearch, IconClose } from "@/components/Icons";
import { useCreditCost } from "@/components/studio/useCreditCost";

const EASE = [0.32, 0.72, 0, 1];

function ModelCard({ model, isSelected, onSelect, tool }) {
  const { cost } = useCreditCost(tool, model.id, {});

  return (
    <button
      className={`model-picker__card ${isSelected ? "model-picker__card--selected" : ""}`}
      onClick={() => onSelect(model)}
    >
      <div className="model-picker__card-header">
        <span className="model-picker__card-name">{model.name}</span>
        {cost && (
          <span className="model-picker__card-cost">
            <IconBolt /> {cost}
          </span>
        )}
      </div>
      {model.speed && <span className="model-picker__card-badge">{model.speed}</span>}
      {model.aspectRatios && (
        <span className="model-picker__card-meta">{model.aspectRatios.slice(0, 3).join(" / ")}</span>
      )}
    </button>
  );
}

export default function RichModelPicker({ models, selected, onSelect, tool, label = "Model" }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = models.filter((m) =>
    !search || m.name.toLowerCase().includes(search.toLowerCase()) || m.id.toLowerCase().includes(search.toLowerCase())
  );

  const selectedModel = models.find((m) => m.id === selected?.id) || models[0];

  return (
    <div className="model-picker" ref={ref}>
      <label className="field-label">{label}</label>
      <button className="model-picker__trigger" onClick={() => setOpen(!open)}>
        <span className="model-picker__trigger-name">{selectedModel?.name || "Select model"}</span>
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
            <div className="model-picker__search">
              <IconSearch />
              <input
                placeholder="Search models..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
              {search && (
                <button className="model-picker__search-clear" onClick={() => setSearch("")}>
                  <IconClose />
                </button>
              )}
            </div>
            <div className="model-picker__list">
              {filtered.map((m) => (
                <ModelCard
                  key={m.id}
                  model={m}
                  isSelected={m.id === selectedModel?.id}
                  onSelect={(model) => { onSelect(model); setOpen(false); setSearch(""); }}
                  tool={tool}
                />
              ))}
              {filtered.length === 0 && (
                <div className="model-picker__empty">No models found</div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
