"use client";

import { IconSparkle, IconImage, IconVideo, IconMenu } from "@/components/Icons";

/* ── Inline SVG: Grid (4-rect) ── */
const IconGrid = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" />
    <rect x="14" y="3" width="7" height="7" />
    <rect x="3" y="14" width="7" height="7" />
    <rect x="14" y="14" width="7" height="7" />
  </svg>
);

const TABS = [
  { id: "orchestrator", label: "Agent", icon: IconSparkle },
  { id: "image",        label: "Image", icon: IconImage },
  { id: "video",        label: "Video", icon: IconVideo },
  { id: "canvas",       label: "Canvas", icon: IconGrid },
  { id: "more",         label: "More",  icon: IconMenu },
];

export default function MobileBottomNav({
  activeTool,
  onSelect,
  onOpenDrawer,
  isDrawerOpen = false,
}) {
  return (
    <nav className="v6-mobile-bottom-nav" role="tablist" aria-label="Main navigation">
      {TABS.map((tab) => {
        const isActive = tab.id === "more"
          ? isDrawerOpen
          : activeTool === tab.id;
        const isMore = tab.id === "more";

        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            aria-label={tab.label}
            className={[
              "v6-mobile-bottom-nav__tab",
              isActive && "v6-mobile-bottom-nav__tab--active",
              isMore && isDrawerOpen && "v6-mobile-bottom-nav__tab--more-open",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={() => (isMore ? onOpenDrawer?.() : onSelect?.(tab.id))}
          >
            <tab.icon />
            <span className="v6-mobile-bottom-nav__label">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
