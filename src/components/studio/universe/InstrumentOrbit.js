"use client";

import { IconMenu } from "@/components/Icons";
import Link from "next/link";

export default function InstrumentOrbit({ tools, active, onSelect, onOpenIndex }) {
  return <nav className="universe-orbit" aria-label="Creative instruments">{tools.map((tool) => { const Icon = tool.Icon; return <Link key={tool.id} href={`/studio/${tool.id}`} onClick={() => onSelect(tool.id)} className={active === tool.id ? "is-active" : ""} aria-current={active === tool.id ? "page" : undefined}><Icon /><span>{tool.label}</span></Link>; })}<button onClick={onOpenIndex}><IconMenu /><span>All tools</span></button></nav>;
}
