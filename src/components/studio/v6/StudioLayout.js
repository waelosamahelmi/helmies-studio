"use client";

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
