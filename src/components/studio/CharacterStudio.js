"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/client-fetch";
import ErrorState from "@/components/states/ErrorState";
import { useModelCatalog } from "@/components/studio/useModelCatalog";
import {
  Confirm, Field, Segmented, Dropzone, ModelPicker,
  useGridRoving, LibrarySearch, LibrarySkeleton,
  IcPersona, IcPalette, IcImage, IcPlus, IcTrash, IcCheck, IcRefresh,
  IcAlert, IcClose, IcLock, IcSpark, IcMic, IcChevronLeft,
} from "@/components/studio/kit";
import {
  ATTRIBUTE_KEYS, REFERENCE_KINDS,
  IDENTITY_PACK, missingPackAngles, imageReferenceSlot,
} from "@/lib/entity-core.mjs";

/* ══════════════════════════════════════════════════════════════════════════
   CAST — .st-lib collection browser + .st-sheet identity editor
   ──────────────────────────────────────────────────────────────────────────
   A character defined here is referenced by id everywhere else: the agent,
   the director and every generation surface pull the same description and the
   same reference photographs, so a face survives thirty shots without anyone
   pasting a description around.

   The editor's spine is the IDENTITY SHEET — the angles a production needs a
   person to have been seen from. It is not decoration: selectEntityReferences
   picks references BY ANGLE (a dialogue close-up reaches for the front, a
   wide reaches for the full body), so a gap in the sheet is the exact place a
   face starts to drift. Showing coverage by angle shows what the engine does.
   ══════════════════════════════════════════════════════════════════════════ */

const KINDS = [
  {
    value: "character", label: "Characters", one: "character", icon: IcPersona,
    empty: "Add the people your production has to keep consistent — their face, their build, what they wear.",
  },
  {
    value: "product", label: "Products", one: "product", icon: IcImage,
    empty: "Add the things that have to survive a shoot unchanged — a bottle, a device, a package.",
  },
  {
    value: "environment", label: "Environments", one: "environment", icon: IcPalette,
    empty: "Add the places your scenes return to, so the room is the same room each time.",
  },
];

const kindOf = (v) => KINDS.find((k) => k.value === v) || KINDS[0];

/* Field labels, in the order they are asked. Identity-defining first — these
   become a dense descriptor at the head of every prompt. */
const FIELD_LABELS = {
  ageAppearance: ["Apparent age", "How old they read on camera"],
  genderPresentation: ["Gender presentation", ""],
  ethnicity: ["Ethnicity", ""],
  face: ["Face", "Shape, jaw, brow"],
  skin: ["Skin", "Tone, texture, marks"],
  hair: ["Hair", "Colour, length, how it sits"],
  eyes: ["Eyes", "Colour and shape"],
  build: ["Build", ""],
  heightImpression: ["Height", "How tall they read next to others"],
  distinctiveFeatures: ["Distinctive features", "What you would name first"],
  wardrobe: ["Wardrobe", "What they wear by default"],
  accessories: ["Accessories", "Glasses, a ring, a watch"],
  makeup: ["Makeup", ""],
  defaultExpression: ["Default expression", "What their face does at rest"],
  posture: ["Posture", ""],
  personality: ["Personality", "Shapes how they carry themselves"],
  speakingStyle: ["Speaking style", "Pace and register, for voice work"],
  language: ["Language", ""],
  materials: ["Materials", ""],
  colors: ["Colours", ""],
  finish: ["Finish", "Matte, gloss, brushed"],
  dimensionsNotes: ["Proportions", "How big it reads in frame"],
  branding: ["Branding", "Logos and where they sit"],
  condition: ["Condition", "New, worn, damaged"],
  lighting: ["Lighting", ""],
  timeOfDay: ["Time of day", ""],
  weather: ["Weather", ""],
  viewpoint: ["Viewpoint", "Where the camera usually sits"],
  mood: ["Mood", ""],
  architecture: ["Architecture", ""],
  scale: ["Scale", ""],
  notes: ["Notes", "Anything else that must stay true"],
};

const STATUS = {
  draft: { label: "Draft", badge: "", note: "Still being defined." },
  ready: { label: "Ready", badge: "hs-badge--signal", note: "Usable in a production." },
  locked: { label: "Locked", badge: "hs-badge--accent", note: "Frozen — edits are refused until you unlock it." },
};

function dateLabel(v) {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

const primaryThumb = (entity) => {
  const refs = entity?.references || [];
  return (
    refs.find((r) => r.locked)?.url ||
    refs.find((r) => r.kind === "face_front")?.url ||
    refs.find((r) => r.kind === "front")?.url ||
    refs[0]?.url || null
  );
};

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

/* ══════════════════════════════════════════════════════════════════════ */
export default function CharacterStudio() {
  const [kind, setKind] = useState("character");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [reloads, setReloads] = useState(0);

  const [editingId, setEditingId] = useState(null);
  const [pending, setPending] = useState(null);
  const [saving, setSaving] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [voices, setVoices] = useState([]);

  const { gridRef, onGridKey } = useGridRoving();
  const meta = kindOf(kind);
  const reload = useCallback(() => setReloads((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    (async () => {
      try {
        const res = await apiFetch(`/api/entities?kind=${kind}`);
        const data = await res.json();
        if (!cancelled) setItems(Array.isArray(data.entities) ? data.entities : []);
      } catch (e) {
        if (!cancelled) { setError(e?.message || "The cast could not be loaded."); setItems([]); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [kind, reloads]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch("/api/voice-profiles?status=ready");
        const data = await res.json();
        if (!cancelled) setVoices(Array.isArray(data.profiles) ? data.profiles : []);
      } catch { /* a missing voice list must never block the cast */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) =>
      `${it.name} ${it.description || ""} ${JSON.stringify(it.attributes || {})}`.toLowerCase().includes(q)
    );
  }, [items, query]);

  const editing = useMemo(() => items.find((it) => it.id === editingId) || null, [items, editingId]);

  /* ── Mutations ─────────────────────────────────────────────────────── */
  const create = useCallback(async () => {
    setSaving(true);
    setError("");
    try {
      const res = await apiFetch("/api/entities", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, name: `New ${meta.one}` }),
      });
      const data = await res.json();
      setItems((prev) => [data.entity, ...prev]);
      setEditingId(data.entity.id);
    } catch (e) {
      setError(e?.message || `The ${meta.one} could not be created.`);
    } finally {
      setSaving(false);
    }
  }, [kind, meta.one]);

  const patch = useCallback(async (id, body, successNote) => {
    setSaving(true);
    setError("");
    try {
      const res = await apiFetch(`/api/entities/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setItems((prev) => prev.map((it) => (it.id === id ? data.entity : it)));
      if (successNote) setNotice(successNote);
      return data.entity;
    } catch (e) {
      setError(e?.message || "That change could not be saved.");
      return null;
    } finally {
      setSaving(false);
    }
  }, []);

  const remove = useCallback(async (item) => {
    setError("");
    try {
      await apiFetch(`/api/entities/${item.id}`, { method: "DELETE" });
      setItems((prev) => prev.filter((it) => it.id !== item.id));
      setEditingId((cur) => (cur === item.id ? null : cur));
      setNotice(`${item.name} was deleted.`);
    } catch (e) {
      setError(e?.message || "That could not be deleted.");
    }
  }, []);

  const addReference = useCallback(async (id, ref) => {
    const res = await apiFetch(`/api/entities/${id}/references`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(ref),
    });
    const data = await res.json();
    setItems((prev) => prev.map((it) => (it.id === id ? data.entity : it)));
    return data.entity;
  }, []);

  const dropReference = useCallback(async (id, refId) => {
    setError("");
    try {
      const res = await apiFetch(`/api/entities/${id}/references?refId=${encodeURIComponent(refId)}`, { method: "DELETE" });
      const data = await res.json();
      setItems((prev) => prev.map((it) => (it.id === id ? data.entity : it)));
    } catch (e) {
      setError(e?.message || "That reference could not be removed.");
    }
  }, []);

  const lastPending = useRef(null);
  if (pending) lastPending.current = pending;
  const doomed = pending || lastPending.current;

  const faultNotice = error ? (
    <div className="hs-notice hs-notice--fault" role="alert">
      <IcAlert className="hs-icon-sm" style={{ marginTop: 2 }} />
      <span style={{ flex: 1 }}>{error}</span>
      <button type="button" className="hs-btn hs-btn--ghost hs-btn--sm" onClick={reload}>
        <IcRefresh className="hs-icon-sm" /> Retry
      </button>
    </div>
  ) : null;

  /* ══ Identity editor ═══════════════════════════════════════════════ */
  if (editing) {
    const status = STATUS[editing.status] || STATUS.draft;
    const locked = editing.status === "locked";
    return (
      <div className="st-sheet">
        <div className="st-lib__bar">
          <button type="button" className="hs-btn hs-btn--ghost hs-btn--sm" onClick={() => setEditingId(null)}>
            <IcChevronLeft className="hs-icon-sm" /> All {kindOf(editing.kind).label.toLowerCase()}
          </button>
          <span style={{ fontSize: "var(--t-sm)", fontWeight: 600 }}>{editing.name}</span>
          <span className={`hs-badge ${status.badge}`}>{status.label}</span>
          <div className="hs-row" style={{ marginLeft: "auto", gap: "var(--s-2)" }}>
            <span className="hs-mono hs-mute" style={{ fontSize: 10 }}>
              {saving ? "Saving…" : "Saved as you type"}
            </span>
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

            {locked && (
              <div className="hs-notice" role="status">
                <IcLock className="hs-icon-sm" style={{ marginTop: 2 }} />
                <span style={{ flex: 1 }}>
                  This identity is locked, which is what keeps it the same shot after shot.
                </span>
                <button type="button" className="hs-btn hs-btn--outline hs-btn--sm" onClick={() => setUnlocking(true)}>
                  Unlock
                </button>
              </div>
            )}

            {editing.kind === "character" && (
              <IdentitySheet
                entity={editing}
                locked={locked}
                onAddReference={addReference}
                onDropReference={dropReference}
                onError={setError}
                onNotice={setNotice}
              />
            )}

            <ReferenceShelf
              entity={editing}
              locked={locked}
              hideAngles={editing.kind === "character"}
              onAddReference={addReference}
              onDropReference={dropReference}
              onError={setError}
            />

            <IdentityFields entity={editing} locked={locked} onPatch={patch} />

            {editing.kind === "character" && (
              <Fieldset title="Voice" hint="Used whenever this character speaks.">
                {voices.length ? (
                  <Field label="Voice profile" hint="Only profiles that finished cloning are listed.">
                    <select
                      className="hs-select"
                      value={editing.voiceId || ""}
                      disabled={locked}
                      onChange={(e) => {
                        const v = voices.find((p) => p.id === e.target.value);
                        patch(editing.id, { voiceId: v?.id || null, voiceName: v?.name || null },
                          v ? `${v.name} attached.` : "Voice removed.");
                      }}
                    >
                      <option value="">No voice</option>
                      {voices.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                  </Field>
                ) : (
                  <p className="hs-hint" style={{ display: "flex", gap: "var(--s-2)", alignItems: "center", margin: 0 }}>
                    <IcMic className="hs-icon-sm" />
                    No cloned voices yet. Make one in Audio, then attach it here.
                  </p>
                )}
              </Fieldset>
            )}

            <Fieldset title="Status" hint={status.note}>
              <div style={{ display: "flex", gap: "var(--s-2)", flexWrap: "wrap" }}>
                {editing.status === "draft" && (
                  <button type="button" className="hs-btn hs-btn--outline hs-btn--sm" disabled={saving}
                    onClick={() => patch(editing.id, { status: "ready" }, "Marked ready.")}>
                    <IcCheck className="hs-icon-sm" /> Mark ready
                  </button>
                )}
                {!locked ? (
                  <button type="button" className="hs-btn hs-btn--sm" disabled={saving}
                    onClick={() => patch(editing.id, { status: "locked" }, "Identity locked. It renders the same from here on.")}
                    title="Freeze this identity so nothing changes mid-production">
                    <IcLock className="hs-icon-sm" /> Lock identity
                  </button>
                ) : (
                  <button type="button" className="hs-btn hs-btn--outline hs-btn--sm" onClick={() => setUnlocking(true)}>
                    Unlock
                  </button>
                )}
              </div>
            </Fieldset>

            <div className="hs-row hs-row--between" style={{ paddingBottom: "var(--s-6)" }}>
              <span className="hs-mono hs-mute" style={{ fontSize: 10 }}>
                Updated {dateLabel(editing.updatedAt) || "—"}
              </span>
              <button type="button" className="hs-btn hs-btn--danger hs-btn--sm" onClick={() => setPending(editing)}>
                <IcTrash className="hs-icon-sm" /> Delete {kindOf(editing.kind).one}
              </button>
            </div>
          </div>
        </div>

        <Confirm
          open={!!pending}
          onClose={() => setPending(null)}
          onConfirm={() => doomed && remove(doomed)}
          title={`Delete ${doomed?.name || "this record"}?`}
          body="The reference images stay in your assets — only this identity is removed. Shots already made from it keep the look they rendered with."
          confirmLabel="Delete"
        />
        <Confirm
          open={unlocking}
          onClose={() => setUnlocking(false)}
          onConfirm={() => patch(editing.id, { status: "ready" }, "Unlocked. Edits are allowed again.")}
          title="Unlock this identity?"
          body="Locking is what keeps a face the same across a production. Once unlocked, changing the description or the references means later shots will not match the ones already made."
          confirmLabel="Unlock"
          danger={false}
        />
      </div>
    );
  }

  /* ══ Collection browser ════════════════════════════════════════════ */
  return (
    <div className="st-lib">
      <div className="st-lib__bar">
        <Segmented
          label="Cast type"
          value={kind}
          onChange={(v) => { setKind(v); setQuery(""); setNotice(""); }}
          options={KINDS.map((k) => ({ value: k.value, label: k.label }))}
        />
        <LibrarySearch
          value={query}
          onChange={setQuery}
          placeholder="Search names and descriptions"
          label={`Search ${meta.label.toLowerCase()}`}
        />
        <span className="hs-mono hs-mute" style={{ fontSize: 10, letterSpacing: "0.06em" }}>
          {loading ? "—" : `${shown.length} saved`}
        </span>
        <button type="button" className="hs-btn hs-btn--primary hs-btn--sm" style={{ marginLeft: "auto" }}
          onClick={create} disabled={saving}>
          <IcPlus className="hs-icon-sm" /> New {meta.one}
        </button>
      </div>

      <div className="st-lib__body">
        {error && !(shown.length === 0 && !query.trim()) && (
          <div style={{ marginBottom: "var(--s-4)" }}>{faultNotice}</div>
        )}
        {notice && !error && (
          <div className="hs-notice hs-notice--signal" style={{ marginBottom: "var(--s-4)" }} role="status">
            <IcCheck className="hs-icon-sm" style={{ marginTop: 2 }} />
            <span style={{ flex: 1 }}>{notice}</span>
          </div>
        )}

        {loading ? (
          <LibrarySkeleton count={8} label={`Loading ${meta.label.toLowerCase()}`} />
        ) : error && shown.length === 0 && !query.trim() ? (
          <ErrorState message={error} onRetry={reload} />
        ) : shown.length === 0 ? (
          <div className="hs-empty">
            <span className="hs-empty__mark"><meta.icon /></span>
            {query.trim() ? (
              <>
                <h3>Nothing matches that search</h3>
                <p>Search covers the name, the description and every saved detail.</p>
                <button type="button" className="hs-btn hs-btn--outline" onClick={() => setQuery("")}>
                  <IcClose className="hs-icon-sm" /> Clear search
                </button>
              </>
            ) : (
              <>
                <h3>No {meta.label.toLowerCase()} yet</h3>
                <p>{meta.empty}</p>
                <button type="button" className="hs-btn hs-btn--primary" onClick={create} disabled={saving}>
                  <IcPlus className="hs-icon-sm" /> Add the first {meta.one}
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="st-lib__grid" ref={gridRef} role="list" aria-label={meta.label} onKeyDown={onGridKey}>
            {shown.map((item) => {
              const thumb = primaryThumb(item);
              const refCount = (item.references || []).length;
              const status = STATUS[item.status] || STATUS.draft;
              const gaps = item.kind === "character" ? missingPackAngles(item).length : 0;
              return (
                <div key={item.id} className="st-item" role="listitem">
                  <button
                    type="button" data-card onClick={() => setEditingId(item.id)}
                    aria-label={`${item.name} — ${status.label.toLowerCase()}, ${refCount} reference${refCount === 1 ? "" : "s"}. Open the editor.`}
                    style={{
                      display: "block", width: "100%", padding: 0, border: 0,
                      background: "transparent", color: "inherit", font: "inherit",
                      textAlign: "left", cursor: "pointer",
                    }}
                  >
                    <div className="st-item__frame">
                      {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element -- next/image would change loading/layout behavior; consistent with every other studio thumbnail
                        <img src={thumb} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        <span style={{ display: "grid", placeItems: "center", height: "100%" }}>
                          <meta.icon style={{ width: 28, height: 28, color: "var(--tx-ghost)" }} />
                        </span>
                      )}
                      <span className="st-item__kind">{status.label}</span>
                    </div>
                    <div className="st-item__body">
                      <span className="st-item__name">{item.name}</span>
                      <span className="st-item__meta">
                        {[
                          `${refCount} reference${refCount === 1 ? "" : "s"}`,
                          gaps ? `${gaps} angle${gaps === 1 ? "" : "s"} missing` : null,
                          item.voiceName || null,
                        ].filter(Boolean).join(" · ")}
                      </span>
                    </div>
                  </button>
                  <div className="st-item__acts">
                    <button type="button" className="hs-btn hs-btn--sm hs-btn--icon hs-btn--danger"
                      onClick={() => setPending(item)} aria-label={`Delete ${item.name}`} title="Delete">
                      <IcTrash className="hs-icon-sm" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Confirm
        open={!!pending}
        onClose={() => setPending(null)}
        onConfirm={() => doomed && remove(doomed)}
        title={`Delete ${doomed?.name || "this record"}?`}
        body="The reference images stay in your assets — only this identity is removed."
        confirmLabel="Delete"
      />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   IDENTITY FIELDS
   ══════════════════════════════════════════════════════════════════════ */
function IdentityFields({ entity, locked, onPatch }) {
  const [name, setName] = useState(entity.name);
  const [description, setDescription] = useState(entity.description || "");
  const [attributes, setAttributes] = useState(entity.attributes || {});

  useEffect(() => {
    setName(entity.name);
    setDescription(entity.description || "");
    setAttributes(entity.attributes || {});
    // Deliberately keyed on the record id alone: re-syncing whenever the
    // entity object changes would overwrite what the user is mid-way through
    // typing every time a save comes back.
  }, [entity.id]);

  const kindLabel = kindOf(entity.kind).one;

  return (
    <Fieldset
      title={entity.kind === "character" ? "Who they are" : "What it is"}
      hint={`Written into every prompt this ${kindLabel} appears in.`}
    >
      <Field label="Name" hint="What you will call them everywhere else.">
        {(id) => (
          <input
            id={id} className="hs-input" value={name} disabled={locked} maxLength={80}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              const next = name.trim();
              if (!next || next === entity.name) return setName(entity.name);
              onPatch(entity.id, { name: next });
            }}
          />
        )}
      </Field>

      <Field label="Description" hint="One paragraph a model can render.">
        {(id) => (
          <textarea
            id={id} className="hs-input hs-textarea" rows={3} value={description} disabled={locked} maxLength={2000}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => {
              if (description === (entity.description || "")) return;
              onPatch(entity.id, { description });
            }}
          />
        )}
      </Field>

      {/* Two columns from 720px up: a character carries nineteen of these,
          and a single stacked column turns the editor into a scroll marathon
          where nothing is comparable to anything next to it. */}
      <div className="st-fields">
      {(ATTRIBUTE_KEYS[entity.kind] || []).map((key) => {
        const [label, hint] = FIELD_LABELS[key] || [key, ""];
        return (
          <Field key={key} label={label} hint={hint}>
            {(id) => (
              <input
                id={id} className="hs-input" value={attributes[key] || ""} disabled={locked} maxLength={400}
                onChange={(e) => setAttributes((a) => ({ ...a, [key]: e.target.value }))}
                onBlur={(e) => {
                  if ((entity.attributes || {})[key] === e.target.value) return;
                  onPatch(entity.id, { attributes: { ...attributes, [key]: e.target.value } });
                }}
              />
            )}
          </Field>
        );
      })}
      </div>
    </Fieldset>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   IDENTITY SHEET — coverage by angle, and how the gaps get filled
   ══════════════════════════════════════════════════════════════════════ */
function IdentitySheet({ entity, locked, onAddReference, onDropReference, onError, onNotice }) {
  const { models } = useModelCatalog({ modelType: "image" });
  const [model, setModel] = useState(null);
  const [picking, setPicking] = useState(false);
  const [running, setRunning] = useState({});
  const [spent, setSpent] = useState(0);

  const byKind = useMemo(() => {
    const map = new Map();
    for (const ref of entity.references || []) if (!map.has(ref.kind)) map.set(ref.kind, ref);
    return map;
  }, [entity.references]);

  const missing = missingPackAngles(entity);
  /* The photographs the user handed us. Every pack angle is derived from
     these, so one casual snapshot is enough to start — we never ask them to
     go and shoot a profile themselves. */
  const sources = (entity.references || []).filter((r) => r.kind === "source");
  const hasSource = sources.length > 0;

  /* A model that cannot take a reference image would invent a new face on
     every angle, which is the opposite of what this sheet is for. The test is
     imageReferenceSlot — the SAME function the server uses to decide where
     references go — so the list offered here can never include a model whose
     references the server would then have nowhere to put. */
  const referenceModels = useMemo(
    () => (models || []).filter((m) => imageReferenceSlot(m.schema)),
    [models]
  );

  useEffect(() => {
    if (model || !referenceModels.length) return;
    setModel(
      referenceModels.find((m) => /nano-banana-pro/i.test(m.id)) ||
      referenceModels.find((m) => /nano-banana/i.test(m.id)) ||
      referenceModels[0]
    );
  }, [referenceModels, model]);

  const busy = Object.values(running).some((s) => s === "queued" || s === "running");

  const generateAngle = useCallback(async (angle) => {
    setRunning((r) => ({ ...r, [angle.kind]: "queued" }));
    try {
      const res = await apiFetch("/api/generate/async", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tool: "image",
          model: model.id,
          prompt: angle.prompt,
          entityIds: [entity.id],
          entityPurpose: "identity",
        }),
      });
      const submitted = await res.json();
      setRunning((r) => ({ ...r, [angle.kind]: "running" }));

      /* The generation is durable — closing this tab does not lose it. The
         reference simply gets attached the next time the record is opened. */
      const started = Date.now();
      for (;;) {
        if (Date.now() - started > 5 * 60 * 1000) {
          throw new Error(`The ${angle.label.toLowerCase()} angle is taking unusually long. It is still running — reopen this record shortly.`);
        }
        await new Promise((r) => setTimeout(r, 2500));
        const s = await apiFetch(`/api/generations/status?id=${submitted.generationId}`);
        const gen = await s.json();
        if (gen.status === "completed" && gen.outputUrl) {
          await onAddReference(entity.id, { url: gen.outputUrl, kind: angle.kind, label: angle.label, source: "generated" });
          setSpent((c) => c + (gen.creditsUsed || 0));
          setRunning((r) => ({ ...r, [angle.kind]: "done" }));
          return true;
        }
        if (gen.status === "failed") throw new Error(gen.error || `The ${angle.label.toLowerCase()} angle failed.`);
      }
    } catch (e) {
      setRunning((r) => ({ ...r, [angle.kind]: "failed" }));
      onError?.(e?.message || `The ${angle.label.toLowerCase()} angle failed.`);
      return false;
    }
  }, [entity.id, model, onAddReference, onError]);

  const fillGaps = useCallback(async () => {
    if (!model || !missing.length) return;
    const made = (await Promise.all(missing.map(generateAngle))).filter(Boolean).length;
    if (made) onNotice?.(`${made} angle${made === 1 ? "" : "s"} added.`);
  }, [model, missing, generateAngle, onNotice]);

  const covered = IDENTITY_PACK.length - missing.length;

  return (
    <Fieldset
      title="Identity sheet"
      hint="Shots pick their reference by angle — a close-up reads the front, a wide reads the full body. A gap here is where a face starts to drift."
      right={
        <span className="hs-mono hs-mute" style={{ fontSize: 10, whiteSpace: "nowrap" }}>
          {covered}/{IDENTITY_PACK.length} angles
        </span>
      }
    >
      <div className="st-angles" role="list" aria-label="Reference angles">
        {IDENTITY_PACK.map((angle) => {
          const ref = byKind.get(angle.kind);
          const state = running[angle.kind];
            const pending = state === "queued" || state === "running";
            /* An empty slot is a control, not a placeholder: one angle can be
               made (or remade) on its own, so a single bad result never means
               paying for the whole pack again. */
            const canMakeOne = !locked && !ref && !pending && hasSource && !!model;
            return (
            <div key={angle.kind} className="st-angle" role="listitem">
              <div className={`st-angle__frame${ref ? " is-filled" : ""}`}>
                {ref ? (
                  // eslint-disable-next-line @next/next/no-img-element -- consistent with every other studio thumbnail
                  <img src={ref.url} alt={`${angle.label} reference`} />
                ) : pending ? (
                  <span className="hs-spin" aria-label={`Generating the ${angle.label.toLowerCase()} angle`} />
                ) : canMakeOne ? (
                  <button
                    type="button"
                    className="st-angle__make"
                    onClick={() => generateAngle(angle)}
                    aria-label={`Generate the ${angle.label.toLowerCase()} angle${model?.credits != null ? ` for ${model.credits} credits` : ""}`}
                    title={`Generate just this angle${model?.credits != null ? ` — ${model.credits} credits` : ""}`}
                  >
                    <IcSpark className="hs-icon-sm" />
                  </button>
                ) : (
                  <span className="st-angle__gap" aria-hidden="true">+</span>
                )}
                {ref && !locked && (
                  <button type="button" className="hs-thumb__x"
                    onClick={() => onDropReference(entity.id, ref.id)}
                    aria-label={`Remove the ${angle.label.toLowerCase()} reference`}>
                    <IcClose style={{ width: 11, height: 11 }} />
                  </button>
                )}
              </div>
              <span className="st-angle__label">{angle.label}</span>
              <span className="st-angle__state">
                {ref ? (ref.source === "generated" ? "Generated" : "Yours") : state === "failed" ? "Failed" : "Missing"}
              </span>
            </div>
            );
        })}
      </div>

      {!locked && (
        <>
          <Field
            label="Your photographs"
            hint="Any picture of them will do. Every angle above is generated from these, and the photographs themselves are never altered or regenerated."
          >
            {sources.length > 0 && (
              <div className="hs-thumbs" style={{ marginBottom: "var(--s-2)" }}>
                {sources.map((ref) => (
                  <div key={ref.id} className="hs-thumb">
                    {/* eslint-disable-next-line @next/next/no-img-element -- consistent with every other studio thumbnail */}
                    <img src={ref.url} alt={ref.label || "Your photograph"} />
                    <button
                      type="button" className="hs-thumb__x"
                      onClick={() => onDropReference(entity.id, ref.id)}
                      aria-label={`Remove ${ref.label || "this photograph"}`}
                    >
                      <IcClose style={{ width: 11, height: 11 }} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <Dropzone
              value={null}
              accept="image/*"
              label={sources.length ? "Add another photograph" : "Drop a photograph or click to browse"}
              hint={sources.length ? "More angles of them make every generated angle more accurate" : "One clear picture of their face is enough to start"}
              onChange={async (file) => {
                if (!file?.url) return;
                try {
                  await onAddReference(entity.id, {
                    url: file.url, kind: "source", label: file.name, source: "user", locked: true,
                  });
                } catch (e) {
                  onError?.(e?.message || "That photograph could not be attached.");
                }
              }}
            />
          </Field>

          {missing.length > 0 && (
            <div className="hs-notice" style={{ alignItems: "flex-start" }}>
              <IcSpark className="hs-icon-sm" style={{ marginTop: 2 }} />
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "var(--s-2)" }}>
                <span>
                  {hasSource
                    ? `${missing.length} angle${missing.length === 1 ? "" : "s"} to make. Every one is generated from your photographs, so it stays the same person.`
                    : "Add one photograph of them first. Every angle is generated from what you give us — nothing here is invented from a description."}
                </span>

                {hasSource && (
                  <>
                    <div style={{ display: "flex", gap: "var(--s-2)", alignItems: "center", flexWrap: "wrap" }}>
                      <button type="button" className="hs-btn hs-btn--primary hs-btn--sm"
                        onClick={fillGaps} disabled={busy || !model}
                        title={!model ? "No image model here accepts a reference photograph" : ""}>
                        {busy ? <span className="hs-spin" /> : <IcSpark className="hs-icon-sm" />}
                        {busy ? "Generating…" : `Generate ${missing.length === IDENTITY_PACK.length ? "all " : ""}${missing.length} angle${missing.length === 1 ? "" : "s"}`}
                      </button>
                      {model?.credits != null && (
                        <span className="hs-mono hs-mute" style={{ fontSize: 10 }}>
                          {model.credits} each · {model.credits * missing.length} total
                        </span>
                      )}
                      {spent > 0 && <span className="hs-mono hs-mute" style={{ fontSize: 10 }}>{spent} spent</span>}
                    </div>

                    <button type="button" className="hs-btn hs-btn--ghost hs-btn--sm"
                      style={{ alignSelf: "flex-start" }} onClick={() => setPicking((p) => !p)}>
                      {model ? `Using ${model.displayName || model.id}` : "Choose a model"} · {picking ? "hide" : "change"}
                    </button>
                    {picking && (
                      <ModelPicker
                        models={referenceModels}
                        value={model?.id}
                        onSelect={(m) => { setModel(m); setPicking(false); }}
                        label="Model for the missing angles"
                        emptyHint="No image model here accepts a reference photograph."
                      />
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </Fieldset>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   REFERENCE SHELF — everything that is not a pack angle
   ══════════════════════════════════════════════════════════════════════ */
function ReferenceShelf({ entity, locked, hideAngles, onAddReference, onDropReference, onError }) {
  const packKinds = useMemo(() => new Set(IDENTITY_PACK.map((a) => a.kind)), []);
  const refs = (entity.references || []).filter((r) => !hideAngles || !packKinds.has(r.kind));
  const kinds = REFERENCE_KINDS[entity.kind] || [];
  const [kind, setKind] = useState(kinds[0] || "other");

  if (locked && !refs.length) return null;

  return (
    <Fieldset
      title={hideAngles ? "Other references" : "References"}
      hint={hideAngles ? "Wardrobe, expressions, anything beyond the angles above." : "What the models should match."}
    >
      {refs.length > 0 && (
        <div className="hs-thumbs">
          {refs.map((ref) => (
            <div key={ref.id} className="hs-thumb">
              {/* eslint-disable-next-line @next/next/no-img-element -- consistent with every other studio thumbnail */}
              <img src={ref.url} alt={ref.label || ref.kind} />
              {!locked && (
                <button type="button" className="hs-thumb__x"
                  onClick={() => onDropReference(entity.id, ref.id)}
                  aria-label={`Remove ${ref.label || ref.kind}`}>
                  <IcClose style={{ width: 11, height: 11 }} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {!locked && (
        <>
          <Field label="What is this reference?" hint="It decides which shots reach for it.">
            {(id) => (
              <select id={id} className="hs-select" value={kind} onChange={(e) => setKind(e.target.value)}>
                {kinds.map((k) => <option key={k} value={k}>{k.replace(/_/g, " ")}</option>)}
              </select>
            )}
          </Field>
          <Dropzone
            value={null}
            accept="image/*"
            label="Add a reference"
            onChange={async (file) => {
              if (!file?.url) return;
              try {
                await onAddReference(entity.id, { url: file.url, kind, label: file.name, source: "user" });
              } catch (e) {
                onError?.(e?.message || "That reference could not be attached.");
              }
            }}
          />
        </>
      )}
    </Fieldset>
  );
}
