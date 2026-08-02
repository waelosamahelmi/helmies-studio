"use client";

/* ══════════════════════════════════════════════════════════════════════════
   LOADING SKELETON
   ──────────────────────────────────────────────────────────────────────────
   Consolidates the shimmering `.hs-skel` block already used ad hoc for
   loading placeholders (system.css's ".hs-skel" — the shimmer animation
   itself is untouched, this only centralizes how many blocks render and
   their shape). Three variants match the three shapes already in use:
     grid  — masonry tiles (src/app/gallery/GalleryClient.js's finished-work
             grid, src/components/studio/AssetLibraryStudio.js's library grid)
     list  — stacked bars of varying width (src/app/settings/page.js's
             AccountPanel/ledger loading)
     panel — one large block (src/app/settings/page.js's Suspense fallback)

   `className`/`itemClassName` let a caller keep ITS OWN grid/item CSS
   classes (gallery's ".pg-gal"/".pg-gal__item", the library's
   ".st-lib__grid"/".st-item") — the shimmer shape is shared, the surface's
   own layout grid is not touched, per "consolidation, not a redesign."
   ══════════════════════════════════════════════════════════════════════════ */

const GRID_HEIGHTS = [220, 300, 180, 260, 200, 320, 240, 190, 300, 230, 270, 210];
const LIST_WIDTHS = [64, 48, 72, 40, 56, 60];

export default function LoadingSkeleton({ variant = "grid", count, className, itemClassName, itemHeight = 18, label = "Loading" }) {
  if (variant === "panel") {
    return (
      <div aria-busy="true">
        <p className="hs-sr" role="status">{label}</p>
        <div className="hs-skel" style={{ height: 220 }} />
      </div>
    );
  }

  if (variant === "list") {
    const n = count ?? 4;
    return (
      <div className={className || "hs-stack"} aria-busy="true">
        <p className="hs-sr" role="status">{label}</p>
        {Array.from({ length: n }, (_, i) => (
          <div
            key={i}
            className="hs-skel"
            aria-hidden="true"
            style={{ height: itemHeight, width: `${LIST_WIDTHS[i % LIST_WIDTHS.length]}%` }}
          />
        ))}
      </div>
    );
  }

  // grid
  const n = count ?? 8;
  return (
    <div className={className || "hs-stack"} aria-busy="true">
      <p className="hs-sr" role="status">{label}</p>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className={itemClassName} aria-hidden="true">
          <div className="hs-skel" style={{ height: GRID_HEIGHTS[i % GRID_HEIGHTS.length], borderRadius: itemClassName ? 0 : undefined }} />
        </div>
      ))}
    </div>
  );
}
