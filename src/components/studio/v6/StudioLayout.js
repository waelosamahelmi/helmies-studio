"use client";

import { useState } from "react";
import { useIsMobile } from "@/lib/use-media-query";
import { MobilePanel, PanelToggles } from "@/components/studio/mobile";

/* ══════════════════════════════════════════════════════════════
   StudioLayout — Three-pane workspace shell
   Renders controls sidebar, center stage area, and
   optional inspector sidebar in a CSS Grid layout.
   ══════════════════════════════════════════════════════════════ */

export default function StudioLayout({
  controls,
  children,
  inspector,
  inspectorVisible = true,
}) {
  const isMobile = useIsMobile();
  const [activePanel, setActivePanel] = useState(null); // null | "controls" | "inspector"

  /* ── Mobile layout ── */
  if (isMobile) {
    return (
      <div className="v6-workspace">
        {/* Full-width stage (always visible) */}
        <main className="v6-workspace-center">
          {children}
        </main>

        {/* Panel toggles at bottom */}
        <PanelToggles
          activePanel={activePanel}
          onToggle={(panel) => setActivePanel(activePanel === panel ? null : panel)}
        />

        {/* Controls panel (bottom sheet) */}
        <MobilePanel
          isOpen={activePanel === "controls"}
          onClose={() => setActivePanel(null)}
          title="Controls"
        >
          {controls}
        </MobilePanel>

        {/* Inspector panel (bottom sheet) */}
        <MobilePanel
          isOpen={activePanel === "inspector"}
          onClose={() => setActivePanel(null)}
          title="Inspector"
        >
          {inspector}
        </MobilePanel>
      </div>
    );
  }

  /* ── Desktop layout ── */
  return (
    <div className="v6-workspace">
      {/* Left sidebar: Controls */}
      <aside className="v6-workspace-controls">
        {controls}
      </aside>

      {/* Center area: Main content / stage */}
      <main className="v6-workspace-center">
        {children}
      </main>

      {/* Right sidebar: Inspector (conditionally rendered) */}
      {inspectorVisible && (
        <aside className="v6-workspace-inspector">
          {inspector}
        </aside>
      )}
    </div>
  );
}
