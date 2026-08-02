"use client";

import Link from "next/link";

/* ══════════════════════════════════════════════════════════════════════════
   EMPTY STATE
   ──────────────────────────────────────────────────────────────────────────
   Consolidates the `.hs-empty` block already used ad hoc across the app
   (src/app/gallery/GalleryClient.js's "Nothing finished yet"/SignedOut,
   src/components/studio/kit/Stage.js's <Idle>, src/app/settings/page.js's
   KeysPanel/AccountPanel, src/components/studio/AssetLibraryStudio.js's
   library-empty branches) into one component with the exact same markup
   and CSS classes (system.css's ".hs-empty" family) — this is consolidation,
   not a new visual language.

   `action` is one action ({label, onClick|href, icon, variant}) or an array
   of them for the multi-action cases (e.g. "Clear filters" + "Load more").
   Per the brief's naming, "an empty state says what to do next" — action(s)
   are how it says it.
   ══════════════════════════════════════════════════════════════════════════ */

function ActionButton({ action }) {
  const { label, onClick, href, icon, variant = "primary", disabled = false } = action;
  const className = `hs-btn hs-btn--${variant}`;
  if (href) {
    return (
      <Link className={className} href={href} aria-disabled={disabled || undefined}>
        {icon}
        {label}
      </Link>
    );
  }
  return (
    <button type="button" className={className} onClick={onClick} disabled={disabled}>
      {icon}
      {label}
    </button>
  );
}

export default function EmptyState({ icon, title, titleAs: Title = "h3", description, action, children }) {
  const actions = Array.isArray(action) ? action : action ? [action] : [];

  return (
    <div className="hs-empty">
      {icon && <span className="hs-empty__mark">{icon}</span>}
      {title && <Title>{title}</Title>}
      {description && <p>{description}</p>}
      {actions.length > 0 && (
        <div
          className="hs-row"
          style={{ marginTop: "var(--s-2)", flexWrap: "wrap", justifyContent: "center" }}
        >
          {actions.map((a, i) => (
            <ActionButton key={a.label ?? i} action={a} />
          ))}
        </div>
      )}
      {children}
    </div>
  );
}
