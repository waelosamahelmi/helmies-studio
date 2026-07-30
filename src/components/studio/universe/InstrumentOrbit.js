"use client";

import { IconMenu } from "@/components/Icons";
import Link from "next/link";

export default function InstrumentOrbit({ tools, active, onSelect, onOpenIndex }) {
  return (
    <>
      {tools.map((tool) => {
        const Icon = tool.Icon;
        const isActive = active === tool.id;
        return (
          <Link
            key={tool.id}
            href={`/studio/${tool.id}`}
            onClick={() => onSelect(tool.id)}
            className={isActive ? "v6-active" : ""}
            aria-current={isActive ? "page" : undefined}
            aria-label={tool.label}
          >
            <Icon />
            <span className="v6-orbit-tooltip">{tool.label}</span>
          </Link>
        );
      })}
      <button onClick={onOpenIndex} aria-label="All tools">
        <IconMenu />
        <span className="v6-orbit-tooltip">All tools</span>
      </button>
    </>
  );
}
