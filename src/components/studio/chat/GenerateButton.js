"use client";

import { IconBolt, IconArrowUpRight } from "@/components/Icons";

export default function GenerateButton({ loading, disabled, cost, elapsed, onClick }) {
  if (loading) {
    return (
      <button className="generate-btn generate-btn--loading" disabled>
        <span className="generate-btn__spinner" />
        {elapsed > 0 && <span className="generate-btn__elapsed">{elapsed}s</span>}
      </button>
    );
  }

  return (
    <button
      className="generate-btn"
      disabled={disabled}
      onClick={onClick}
    >
      Generate
      <IconArrowUpRight />
      {cost > 0 && (
        <span className="generate-btn__cost">
          <IconBolt />{cost}
        </span>
      )}
    </button>
  );
}
