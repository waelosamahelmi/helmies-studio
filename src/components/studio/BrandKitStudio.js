"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/client-fetch";
import {
  Confirm, Modal, Field, Segmented, Chips,
  IcPalette, IcSearch, IcPlus, IcTrash, IcCopy, IcCheck, IcRefresh,
  IcChevronLeft, IcAlert, IcClose, IcSpark,
} from "@/components/studio/kit";

/* ══════════════════════════════════════════════════════════════════════════
   BRAND KITS
   ──────────────────────────────────────────────────────────────────────────
   The list is a .st-lib collection browser; one kit opens into a .st-sheet
   record editor. Edits are held locally and written in one PATCH, so a
   half-typed hex never reaches the server.
   ══════════════════════════════════════════════════════════════════════════ */

const ENFORCEMENT = [
  { value: "off", label: "Off", note: "Stored for reference. Nothing is added to prompts." },
  { value: "suggest", label: "Suggest", note: "Tools surface the palette, tone and avoid-list. Nothing is added automatically." },
  { value: "strong", label: "Strong", note: "Palette, photography style, tone and avoid-list are added to every prompt. Avoid-list hits are flagged as warnings." },
  { value: "locked", label: "Locked", note: "Everything Strong does, plus the prompt is told not to deviate and avoid-list hits become errors." },
];

const ENFORCEMENT_BADGE = { off: "", suggest: "hs-badge--caution", strong: "hs-badge--accent", locked: "hs-badge--fault" };

const TONE_SUGGESTIONS = [
  "professional", "playful", "minimal", "luxury", "warm",
  "bold", "technical", "understated", "authoritative",
];

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/* ── Value helpers ────────────────────────────────────────────────────── */
function asStrings(v) {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => (typeof x === "string" ? x : typeof x === "number" ? String(x) : x?.text || x?.value || ""))
    .filter((s) => s.trim() !== "");
}

function asColors(v) {
  if (!Array.isArray(v)) return [];
  return v
    .map((c) => (typeof c === "string" ? c : c?.hex || c?.value || c?.color || ""))
    .filter((s) => String(s).trim() !== "")
    .map(String);
}

function toColorInput(v) {
  const s = String(v || "").trim();
  if (!HEX.test(s)) return "#888888";
  if (s.length === 4) return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`.toUpperCase();
  return s.toUpperCase();
}

function normaliseHex(v) {
  let s = String(v || "").trim();
  if (!s) return "";
  if (!s.startsWith("#")) s = `#${s}`;
  return HEX.test(s) ? s.toUpperCase() : String(v || "").trim();
}

const dateLabel = (v) => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
};

function draftOf(kit) {
  return {
    name: kit?.name || "",
    description: kit?.description || "",
    primaryColors: asColors(kit?.primaryColors),
    secondaryColors: asColors(kit?.secondaryColors),
    photographyStyle: kit?.photographyStyle || "",
    toneOfVoice: kit?.toneOfVoice || "",
    avoid: asStrings(kit?.avoid),
    slogans: asStrings(kit?.slogans),
    enforcement: kit?.enforcement || "off",
  };
}

/* ── Small building blocks ────────────────────────────────────────────── */
function Fieldset({ title, hint, right, children }) {
  return (
    <section className="st-fieldset">
      <div className="st-fieldset__head">
        <div className="hs-row hs-row--between" style={{ alignItems: "flex-start" }}>
          <div>
            <h3 style={{ fontSize: "var(--t-sm)", fontWeight: 600 }}>{title}</h3>
            {hint && <p className="hs-hint" style={{ marginTop: 2 }}>{hint}</p>}
          </div>
          {right}
        </div>
      </div>
      <div className="st-fieldset__body">{children}</div>
    </section>
  );
}

function Swatches({ label, colors, onChange, max = 8 }) {
  const set = (i, v) => onChange(colors.map((c, n) => (n === i ? v : c)));
  const invalid = colors.filter((c) => !HEX.test(String(c).trim()));

  return (
    <div className="hs-field">
      <span className="hs-label">{label}</span>
      <div className="st-swatches">
        {colors.map((c, i) => (
          <div className="st-swatch" key={`${label}-${i}`}>
            <input
              type="color"
              className="st-swatch__chip"
              value={toColorInput(c)}
              onChange={(e) => set(i, e.target.value.toUpperCase())}
              aria-label={`${label} ${i + 1} — colour picker`}
              style={{ width: "100%", padding: 2, background: "var(--ink-200)", cursor: "pointer" }}
            />
            <input
              type="text"
              className="hs-input hs-mono"
              value={c}
              onChange={(e) => set(i, e.target.value)}
              onBlur={(e) => set(i, normaliseHex(e.target.value))}
              aria-label={`${label} ${i + 1} — hex value`}
              spellCheck="false"
              style={{
                height: 28, padding: "0 4px", textAlign: "center",
                fontSize: 10, textTransform: "uppercase",
                borderColor: HEX.test(String(c).trim()) ? undefined : "var(--fault)",
              }}
            />
            <button
              type="button"
              className="hs-btn hs-btn--ghost hs-btn--sm hs-btn--icon"
              onClick={() => onChange(colors.filter((_, n) => n !== i))}
              aria-label={`Remove ${label} ${i + 1}`}
              style={{ marginInline: "auto" }}
            >
              <IcTrash className="hs-icon-sm" />
            </button>
          </div>
        ))}

        {colors.length < max && (
          <div className="st-swatch">
            <button
              type="button"
              className="st-swatch__chip"
              onClick={() => onChange([...colors, "#FF1B6B"])}
              aria-label={`Add a ${label.toLowerCase()} colour`}
              style={{
                width: "100%", display: "grid", placeItems: "center",
                background: "transparent", borderStyle: "dashed",
                color: "var(--tx-mute)", cursor: "pointer",
              }}
            >
              <IcPlus className="hs-icon-sm" />
            </button>
            <span className="st-swatch__hex">Add</span>
          </div>
        )}
      </div>
      {invalid.length > 0 && (
        <span className="hs-error">
          {invalid.length === 1
            ? "One value is not a hex colour"
            : <><span className="hs-mono">{invalid.length}</span>{" values are not hex colours"}</>}
          {" — use #RGB or #RRGGBB before saving."}
        </span>
      )}
    </div>
  );
}

function TagList({ label, hint, items, onChange, placeholder, tone = "default" }) {
  const [text, setText] = useState("");
  const add = () => {
    const v = text.trim();
    if (!v || items.includes(v)) { setText(""); return; }
    onChange([...items, v]);
    setText("");
  };
  return (
    <Field label={label} hint={hint}>
      {(id) => (
        <div className="hs-stack" style={{ gap: "var(--s-2)" }}>
          {items.length > 0 && (
            <div className="hs-chips">
              {items.map((item, i) => (
                <span
                  key={`${item}-${i}`}
                  className="hs-chip"
                  style={tone === "fault" ? { borderColor: "rgba(255,90,90,0.32)", color: "var(--fault)" } : undefined}
                >
                  {item}
                  <button
                    type="button"
                    onClick={() => onChange(items.filter((_, n) => n !== i))}
                    aria-label={`Remove ${item}`}
                    style={{ display: "flex", border: 0, background: "transparent", padding: 0, color: "inherit", cursor: "pointer" }}
                  >
                    <IcClose style={{ width: 11, height: 11 }} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="hs-row" style={{ gap: "var(--s-2)" }}>
            <input
              id={id}
              className="hs-input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
              placeholder={placeholder}
            />
            <button type="button" className="hs-btn hs-btn--sm" onClick={add} disabled={!text.trim()}>
              <IcPlus className="hs-icon-sm" /> Add
            </button>
          </div>
        </div>
      )}
    </Field>
  );
}

/* ══════════════════════════════════════════════════════════════════════ */
export default function BrandKitStudio() {
  const [kits, setKits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reloads, setReloads] = useState(0);

  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [fingerprinting, setFingerprinting] = useState(false);

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [pending, setPending] = useState(null);
  const [copied, setCopied] = useState("");

  const gridRef = useRef(null);
  const copyTimer = useRef(null);
  useEffect(() => () => clearTimeout(copyTimer.current), []);

  /* ── Load ───────────────────────────────────────────────────────────── */
  useEffect(() => {
    let dead = false;
    setLoading(true);
    setError("");
    (async () => {
      try {
        const res = await apiFetch("/api/brand-kits");
        const data = await res.json();
        if (dead) return;
        setKits(Array.isArray(data) ? data : []);
      } catch (err) {
        if (!dead) setError(err?.message || "The brand kits could not be loaded.");
      } finally {
        if (!dead) setLoading(false);
      }
    })();
    return () => { dead = true; };
  }, [reloads]);

  const editing = useMemo(() => kits.find((k) => k.id === editingId) || null, [kits, editingId]);

  /* Seed the draft when a kit is opened, or when the server hands back a new copy */
  useEffect(() => {
    setDraft(editing ? draftOf(editing) : null);
  }, [editing]);

  const dirty = useMemo(() => {
    if (!editing || !draft) return false;
    return JSON.stringify(draft) !== JSON.stringify(draftOf(editing));
  }, [editing, draft]);

  const badColours = useMemo(() => {
    if (!draft) return 0;
    return [...draft.primaryColors, ...draft.secondaryColors].filter((c) => !HEX.test(String(c).trim())).length;
  }, [draft]);

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  /* ── Mutations ──────────────────────────────────────────────────────── */
  const create = useCallback(async () => {
    const name = newName.trim();
    if (!name) return;
    setError("");
    try {
      const res = await apiFetch("/api/brand-kits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const kit = await res.json();
      setKits((prev) => [kit, ...prev]);
      setCreating(false);
      setNewName("");
      setEditingId(kit.id);
    } catch (err) {
      setError(err?.message || "The brand kit could not be created.");
    }
  }, [newName]);

  const save = useCallback(async () => {
    if (!editing || !draft || badColours > 0) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const res = await apiFetch("/api/brand-kits", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editing.id,
          name: draft.name.trim() || editing.name,
          description: draft.description,
          primaryColors: draft.primaryColors.map(normaliseHex),
          secondaryColors: draft.secondaryColors.map(normaliseHex),
          photographyStyle: draft.photographyStyle,
          toneOfVoice: draft.toneOfVoice,
          avoid: draft.avoid,
          slogans: draft.slogans,
          enforcement: draft.enforcement,
        }),
      });
      const updated = await res.json();
      setKits((prev) => prev.map((k) => (k.id === updated.id ? updated : k)));
      setNotice("Changes saved.");
    } catch (err) {
      setError(err?.message || "The changes could not be saved.");
    } finally {
      setSaving(false);
    }
  }, [editing, draft, badColours]);

  const remove = useCallback(async (kit) => {
    setError("");
    try {
      await apiFetch(`/api/brand-kits?id=${encodeURIComponent(kit.id)}`, { method: "DELETE" });
      setKits((prev) => prev.filter((k) => k.id !== kit.id));
      setEditingId((id) => (id === kit.id ? null : id));
    } catch (err) {
      setError(err?.message || "The brand kit could not be deleted.");
    }
  }, []);

  const runFingerprint = useCallback(async () => {
    if (!editing) return;
    setFingerprinting(true);
    setError("");
    setNotice("");
    try {
      await apiFetch(`/api/brand-kits/fingerprint?id=${encodeURIComponent(editing.id)}`, {
        method: "POST",
        timeout: 120000,
        retries: 0,
      });
      const res = await apiFetch("/api/brand-kits");
      const data = await res.json();
      setKits(Array.isArray(data) ? data : []);
      setNotice("Fingerprint finished. The palette and style notes below come from the analysed assets.");
    } catch (err) {
      setError(err?.message || "The fingerprint analysis did not complete.");
    } finally {
      setFingerprinting(false);
    }
  }, [editing]);

  const copyPalette = useCallback(async (kit) => {
    const list = [...asColors(kit.primaryColors), ...asColors(kit.secondaryColors)];
    if (!list.length) return;
    try {
      await navigator.clipboard.writeText(list.join(", "));
      setCopied(kit.id);
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(""), 1600);
    } catch {
      setError("The browser blocked the clipboard. Open the kit and copy the hex values by hand.");
    }
  }, []);

  /* ── Grid keyboard movement ─────────────────────────────────────────── */
  const onGridKey = (e) => {
    if (!["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) return;
    const nodes = Array.from(gridRef.current?.querySelectorAll("[data-card]") || []);
    const i = nodes.indexOf(document.activeElement);
    if (i < 0) return;
    const cols = Math.max(1, String(window.getComputedStyle(gridRef.current).gridTemplateColumns).split(" ").filter(Boolean).length);
    let next = i;
    if (e.key === "ArrowRight") next = i + 1;
    else if (e.key === "ArrowLeft") next = i - 1;
    else if (e.key === "ArrowDown") next = i + cols;
    else if (e.key === "ArrowUp") next = i - cols;
    else if (e.key === "Home") next = 0;
    else next = nodes.length - 1;
    if (next < 0 || next >= nodes.length) return;
    e.preventDefault();
    nodes[next].focus();
  };

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return kits;
    return kits.filter((k) =>
      [k.name, k.description, k.toneOfVoice, k.photographyStyle].some((v) => String(v || "").toLowerCase().includes(q)),
    );
  }, [kits, query]);

  /* Keep the name on screen while the confirm plays its exit */
  const lastPending = useRef(null);
  if (pending) lastPending.current = pending;
  const doomed = pending || lastPending.current;

  const faultNotice = error && (
    <div className="hs-notice hs-notice--fault" role="alert">
      <IcAlert className="hs-icon-sm" style={{ marginTop: 2 }} />
      <span style={{ flex: 1 }}>{error}</span>
      <button type="button" className="hs-btn hs-btn--ghost hs-btn--sm" onClick={() => setReloads((n) => n + 1)}>
        <IcRefresh className="hs-icon-sm" /> Reload
      </button>
    </div>
  );

  /* ══ Record editor ═══════════════════════════════════════════════════ */
  if (editing && draft) {
    const mode = ENFORCEMENT.find((m) => m.value === draft.enforcement) || ENFORCEMENT[0];
    return (
      <div className="st-sheet">
        <div className="st-lib__bar">
          <button
            type="button"
            className="hs-btn hs-btn--ghost hs-btn--sm"
            onClick={() => setEditingId(null)}
          >
            <IcChevronLeft className="hs-icon-sm" /> All kits
          </button>
          <span style={{ fontSize: "var(--t-sm)", fontWeight: 600 }}>{editing.name}</span>
          <span className={`hs-badge ${ENFORCEMENT_BADGE[draft.enforcement] || ""}`}>{mode.label}</span>

          <div className="hs-row" style={{ marginLeft: "auto", gap: "var(--s-2)" }}>
            {dirty && <span className="hs-mono hs-mute" style={{ fontSize: 10 }}>Unsaved</span>}
            <button
              type="button"
              className="hs-btn hs-btn--sm"
              onClick={() => setDraft(draftOf(editing))}
              disabled={!dirty || saving}
            >
              Discard
            </button>
            <button
              type="button"
              className="hs-btn hs-btn--primary hs-btn--sm"
              onClick={save}
              disabled={!dirty || saving || badColours > 0}
            >
              {saving ? <><span className="hs-spin" /> Saving</> : <><IcCheck className="hs-icon-sm" /> Save changes</>}
            </button>
          </div>
        </div>

        <div className="st-sheet__body">
          <div className="st-sheet__inner">
            {faultNotice}
            {notice && !error && (
              <div className="hs-notice hs-notice--signal" role="status">
                <IcCheck className="hs-icon-sm" style={{ marginTop: 2 }} />
                <span style={{ flex: 1 }}>{notice}</span>
              </div>
            )}

            <Fieldset title="Identity" hint="What this kit is, and where it applies.">
              <Field label="Name">
                {(id) => (
                  <input
                    id={id}
                    className="hs-input"
                    value={draft.name}
                    onChange={(e) => set({ name: e.target.value })}
                    placeholder="Acme Corp"
                  />
                )}
              </Field>
              <Field label="Description" hint="A sentence the team would recognise. It is never sent to a model.">
                {(id) => (
                  <textarea
                    id={id}
                    className="hs-input hs-textarea"
                    style={{ minHeight: 64 }}
                    value={draft.description}
                    onChange={(e) => set({ description: e.target.value })}
                    placeholder="Direct-to-consumer skincare. Quiet, clinical, no lifestyle clichés."
                  />
                )}
              </Field>
            </Fieldset>

            <Fieldset
              title="Palette"
              hint="Primary colours lead. Secondary colours support them."
              right={
                <button
                  type="button"
                  className="hs-btn hs-btn--sm"
                  onClick={runFingerprint}
                  disabled={fingerprinting || dirty}
                  title={dirty ? "Save your changes first — the analysis rewrites this record." : "Analyse the kit's assets"}
                >
                  {fingerprinting ? <><span className="hs-spin" /> Analysing</> : <><IcSpark className="hs-icon-sm" /> Fingerprint assets</>}
                </button>
              }
            >
              <Swatches label="Primary colours" colors={draft.primaryColors} onChange={(v) => set({ primaryColors: v })} />
              <Swatches label="Secondary colours" colors={draft.secondaryColors} onChange={(v) => set({ secondaryColors: v })} />
              {dirty && (
                <p className="hs-hint">
                  Fingerprinting rewrites this record from the kit&rsquo;s uploaded assets. Save or discard first.
                </p>
              )}
            </Fieldset>

            <Fieldset title="Voice and look" hint="These lines are pasted into prompts when enforcement is Strong or Locked.">
              <Field label="Photography style" hint="Lens, light, grade, staging.">
                {(id) => (
                  <textarea
                    id={id}
                    className="hs-input hs-textarea"
                    style={{ minHeight: 72 }}
                    value={draft.photographyStyle}
                    onChange={(e) => set({ photographyStyle: e.target.value })}
                    placeholder="Daylight only, 50mm, shallow depth of field, matte grade, product centred on stone"
                  />
                )}
              </Field>

              <Field label="Tone of voice">
                {(id) => (
                  <textarea
                    id={id}
                    className="hs-input hs-textarea"
                    style={{ minHeight: 64 }}
                    value={draft.toneOfVoice}
                    onChange={(e) => set({ toneOfVoice: e.target.value })}
                    placeholder="Calm, precise, never salesy"
                  />
                )}
              </Field>
              <Chips
                label="Add a tone"
                options={TONE_SUGGESTIONS.map((t) => ({ value: t, label: t }))}
                value=""
                onChange={(t) =>
                  set({ toneOfVoice: draft.toneOfVoice.trim() ? `${draft.toneOfVoice.trim()}, ${t}` : t })
                }
                scroll
              />

              <TagList
                label="Avoid"
                hint="Anything on this list is flagged when it appears in a prompt."
                tone="fault"
                items={draft.avoid}
                onChange={(v) => set({ avoid: v })}
                placeholder="neon, stock-photo smiles, drop shadows"
              />

              <TagList
                label="Slogans"
                hint="Lines that may be used verbatim in copy."
                items={draft.slogans}
                onChange={(v) => set({ slogans: v })}
                placeholder="Skin, solved."
              />
            </Fieldset>

            <Fieldset title="Enforcement" hint="How hard the kit pushes on every generation.">
              <Segmented
                label="Enforcement level"
                value={draft.enforcement}
                onChange={(v) => set({ enforcement: v })}
                options={ENFORCEMENT.map((m) => ({ value: m.value, label: m.label }))}
              />
              <p className="hs-hint">{mode.note}</p>
            </Fieldset>

            <div className="hs-row hs-row--between" style={{ paddingBottom: "var(--s-6)" }}>
              <span className="hs-mono hs-mute" style={{ fontSize: 10 }}>
                Updated {dateLabel(editing.updatedAt) || "—"}
              </span>
              <button type="button" className="hs-btn hs-btn--danger hs-btn--sm" onClick={() => setPending(editing)}>
                <IcTrash className="hs-icon-sm" /> Delete kit
              </button>
            </div>
          </div>
        </div>

        <Confirm
          open={!!pending}
          onClose={() => setPending(null)}
          onConfirm={() => pending && remove(pending)}
          title="Delete this brand kit?"
          body={doomed ? `“${doomed.name}” stops being applied to generations and disappears from the list.` : ""}
          confirmLabel="Delete"
        />
      </div>
    );
  }

  /* ══ Collection browser ══════════════════════════════════════════════ */
  return (
    <div className="st-lib">
      <div className="st-lib__bar">
        <div style={{ position: "relative", flex: "1 1 180px", minWidth: 160, maxWidth: 320 }}>
          <IcSearch
            className="hs-icon-sm"
            style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--tx-mute)", pointerEvents: "none" }}
          />
          <input
            type="search"
            className="hs-input"
            style={{ paddingLeft: 32 }}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search kits"
            aria-label="Search brand kits"
          />
        </div>

        <span className="hs-mono hs-mute" style={{ fontSize: 10, letterSpacing: "0.06em" }}>
          {loading ? "—" : `${shown.length} kit${shown.length === 1 ? "" : "s"}`}
        </span>

        <button
          type="button"
          className="hs-btn hs-btn--primary hs-btn--sm"
          style={{ marginLeft: "auto" }}
          onClick={() => { setNewName(""); setCreating(true); }}
        >
          <IcPlus className="hs-icon-sm" /> New kit
        </button>
      </div>

      <div className="st-lib__body">
        {error && <div style={{ marginBottom: "var(--s-4)" }}>{faultNotice}</div>}

        {loading ? (
          <div className="st-lib__grid" aria-busy="true" aria-label="Loading brand kits">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="st-item">
                <div className="hs-skel" style={{ aspectRatio: "1", borderRadius: 0 }} />
                <div className="st-item__body">
                  <div className="hs-skel" style={{ height: 10, width: "64%" }} />
                  <div className="hs-skel" style={{ height: 8, width: "42%" }} />
                </div>
              </div>
            ))}
          </div>
        ) : shown.length === 0 ? (
          <div className="hs-empty">
            <span className="hs-empty__mark"><IcPalette /></span>
            {query.trim() ? (
              <>
                <h3>No kit matches that search</h3>
                <p>Search covers the name, description, tone and photography style.</p>
                <button type="button" className="hs-btn hs-btn--outline" onClick={() => setQuery("")}>
                  <IcClose className="hs-icon-sm" /> Clear search
                </button>
              </>
            ) : (
              <>
                <h3>No brand kits yet</h3>
                <p>
                  A kit holds the colours, tone and avoid-list a brand generates against. Set enforcement to
                  Strong and every prompt in the studio carries it.
                </p>
                <button type="button" className="hs-btn hs-btn--primary" onClick={() => { setNewName(""); setCreating(true); }}>
                  <IcPlus className="hs-icon-sm" /> Create the first kit
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="st-lib__grid" ref={gridRef} role="list" aria-label="Brand kits" onKeyDown={onGridKey}>
            {shown.map((k) => {
              const primary = asColors(k.primaryColors);
              const secondary = asColors(k.secondaryColors);
              const bands = [...primary, ...secondary].slice(0, 6);
              const level = ENFORCEMENT.find((m) => m.value === (k.enforcement || "off")) || ENFORCEMENT[0];
              return (
                <div key={k.id} className="st-item" role="listitem">
                  <button
                    type="button"
                    data-card
                    onClick={() => setEditingId(k.id)}
                    aria-label={`${k.name} — ${primary.length} primary colours, enforcement ${level.label}. Open the editor.`}
                    style={{
                      display: "block", width: "100%", padding: 0, border: 0,
                      background: "transparent", color: "inherit", font: "inherit",
                      textAlign: "left", cursor: "pointer",
                    }}
                  >
                    <div className="st-item__frame">
                      {bands.length > 0 ? (
                        <div style={{ display: "flex", height: "100%" }}>
                          {bands.map((c, i) => (
                            <span key={`${c}-${i}`} style={{ flex: 1, background: HEX.test(String(c).trim()) ? c : "var(--ink-300)" }} />
                          ))}
                        </div>
                      ) : (
                        <span style={{ display: "grid", placeItems: "center", height: "100%", color: "var(--tx-ghost)" }}>
                          <IcPalette style={{ width: 30, height: 30 }} />
                        </span>
                      )}
                      <span className="st-item__kind">{level.label}</span>
                    </div>
                    <div className="st-item__body">
                      <span className="st-item__name">{k.name}</span>
                      <span className="st-item__meta">
                        {`${primary.length + secondary.length} colours · ${dateLabel(k.updatedAt) || "—"}`}
                      </span>
                    </div>
                  </button>

                  <div className="st-item__acts">
                    <button
                      type="button"
                      className="hs-btn hs-btn--sm hs-btn--icon"
                      onClick={() => copyPalette(k)}
                      disabled={primary.length + secondary.length === 0}
                      aria-label={`Copy the palette of ${k.name}`}
                      title={copied === k.id ? "Copied" : "Copy palette"}
                    >
                      {copied === k.id ? <IcCheck className="hs-icon-sm" /> : <IcCopy className="hs-icon-sm" />}
                    </button>
                    <button
                      type="button"
                      className="hs-btn hs-btn--sm hs-btn--icon hs-btn--danger"
                      onClick={() => setPending(k)}
                      aria-label={`Delete ${k.name}`}
                      title="Delete"
                    >
                      <IcTrash className="hs-icon-sm" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── New kit ──────────────────────────────────────────────────── */}
      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="New brand kit"
        footer={
          <>
            <button type="button" className="hs-btn hs-btn--ghost" onClick={() => setCreating(false)}>Cancel</button>
            <button type="button" className="hs-btn hs-btn--primary" onClick={create} disabled={!newName.trim()}>
              <IcPlus className="hs-icon-sm" /> Create kit
            </button>
          </>
        }
      >
        <Field label="Name" hint="Colours, tone and rules come next, in the editor.">
          {(id) => (
            <input
              id={id}
              className="hs-input"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); create(); } }}
              placeholder="Acme Corp"
              autoFocus
            />
          )}
        </Field>
      </Modal>

      <Confirm
        open={!!pending}
        onClose={() => setPending(null)}
        onConfirm={() => pending && remove(pending)}
        title="Delete this brand kit?"
        body={doomed ? `“${doomed.name}” stops being applied to generations and disappears from the list.` : ""}
        confirmLabel="Delete"
      />
    </div>
  );
}
