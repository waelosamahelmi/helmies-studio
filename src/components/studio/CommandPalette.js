"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/studio/kit/Sheet";
import { TOOLS } from "@/components/studio/kit/tools";
import { IcSearch, IcArchive, IcSettings, IcBolt, IcGrid } from "@/components/studio/kit/Icons";

/* ══════════════════════════════════════════════════════════════════════════
   COMMAND PALETTE
   Every instrument, plus the places you go between sessions.
   Type to filter, arrows to move, Enter to go.
   ══════════════════════════════════════════════════════════════════════════ */

const PLACES = [
  { id: "go:templates", label: "Templates",    hint: "Pre-built briefs and workflows", icon: IcGrid, href: "/templates" },
  { id: "go:gallery",  label: "Generations",   hint: "History and running jobs", icon: IcArchive,  href: "/gallery" },
  { id: "go:models",   label: "Model catalog", hint: "Every available model",    icon: IcGrid,     href: "/models" },
  { id: "go:settings", label: "Settings",      hint: "Account and defaults",     icon: IcSettings, href: "/settings" },
  { id: "go:billing",  label: "Billing",       hint: "Credits and plan",         icon: IcBolt,     href: "/settings?tab=billing" },
];

export default function CommandPalette({ open, onClose, onSelect, active }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const items = useMemo(() => {
    const all = [
      ...TOOLS.map((t) => ({ id: t.id, label: t.title, hint: t.blurb, icon: t.icon, kind: "tool" })),
      ...PLACES.map((p) => ({ ...p, kind: "place" })),
    ];
    const needle = q.trim().toLowerCase();
    if (!needle) return all;
    return all.filter((x) => `${x.label} ${x.hint}`.toLowerCase().includes(needle));
  }, [q]);

  useEffect(() => { setI(0); }, [q]);

  useEffect(() => {
    if (!open) return;
    setQ("");
    setI(0);
    const t = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    listRef.current?.querySelector('[data-on="true"]')?.scrollIntoView({ block: "nearest" });
  }, [i]);

  const run = (item) => {
    if (!item) return;
    onClose?.();
    if (item.kind === "place") router.push(item.href);
    else onSelect?.(item.id);
  };

  const onKeyDown = (e) => {
    const n = items.length;
    if (!n) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setI((x) => (x + 1) % n); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setI((x) => (x - 1 + n) % n); }
    else if (e.key === "Enter") { e.preventDefault(); run(items[i]); }
  };

  return (
    <Modal open={open} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-3)", margin: "calc(var(--s-5) * -1)" }}>
        <div style={{ position: "relative", padding: "var(--s-4) var(--s-4) 0" }}>
          <IcSearch
            className="hs-icon"
            style={{ position: "absolute", left: "calc(var(--s-4) + 12px)", top: "calc(var(--s-4) + 13px)", color: "var(--tx-mute)", pointerEvents: "none" }}
          />
          <input
            ref={inputRef}
            className="hs-input"
            style={{ paddingLeft: 40, height: 46, fontSize: "var(--t-md)" }}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Go to an instrument or a page"
            aria-label="Search instruments and pages"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={items[i] ? `palette-${items[i].id}` : undefined}
            type="text"
          />
        </div>

        <div
          id="palette-list"
          ref={listRef}
          role="listbox"
          aria-label="Results"
          style={{ maxHeight: "50dvh", overflowY: "auto", padding: "0 var(--s-3) var(--s-3)", display: "flex", flexDirection: "column", gap: 2 }}
        >
          {items.length === 0 && (
            <p className="hs-hint" style={{ padding: "var(--s-5)", textAlign: "center" }}>
              Nothing matches “{q}”.
            </p>
          )}

          {items.map((item, n) => {
            const Icon = item.icon;
            const on = n === i;
            return (
              <button
                key={item.id}
                id={`palette-${item.id}`}
                type="button"
                role="option"
                aria-selected={on}
                data-on={on}
                onMouseEnter={() => setI(n)}
                onClick={() => run(item)}
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto 1fr auto",
                  alignItems: "center",
                  gap: "var(--s-3)",
                  padding: "var(--s-3)",
                  borderRadius: "var(--r-md)",
                  textAlign: "left",
                  background: on ? "var(--fill-02)" : "transparent",
                  color: "inherit",
                }}
              >
                <Icon className="hs-icon" style={{ color: on ? "var(--filament-lit)" : "var(--tx-mute)" }} />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: "var(--t-sm)", fontWeight: 600 }}>{item.label}</span>
                  <span style={{ display: "block", fontSize: "var(--t-micro)", color: "var(--tx-mute)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {item.hint}
                  </span>
                </span>
                {item.id === active && <span className="hs-badge">Open</span>}
              </button>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
