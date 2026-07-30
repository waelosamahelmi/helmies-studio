"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { IconClose } from "@/components/Icons";

export default function InstrumentIndex({ open, tools, destinations, onSelect, onClose }) {
  return <AnimatePresence>{open && <><motion.button className="universe-index-backdrop" aria-label="Close instrument index" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} /><motion.aside className="universe-index" initial={{ opacity: 0, x: -30, scale: .98 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: -20 }}><header><div><span>Instrument index</span><h2>Every creative system</h2></div><button onClick={onClose} aria-label="Close"><IconClose /></button></header><div className="universe-index__grid"><section><h3>Create</h3>{tools.filter((tool) => tool.group === "create").map((tool) => { const Icon = tool.Icon; return <button key={tool.id} onClick={() => onSelect(tool.id)}><Icon /><span><strong>{tool.label}</strong><small>{tool.desc}</small></span></button>; })}</section><section><h3>Build and organize</h3>{tools.filter((tool) => tool.group === "build").map((tool) => { const Icon = tool.Icon; return <button key={tool.id} onClick={() => onSelect(tool.id)}><Icon /><span><strong>{tool.label}</strong><small>{tool.desc}</small></span></button>; })}{destinations.map((item) => { const Icon = item.Icon; return <Link key={item.href} href={item.href}><Icon /><span><strong>{item.label}</strong><small>{item.desc}</small></span></Link>; })}</section></div></motion.aside></>}</AnimatePresence>;
}
