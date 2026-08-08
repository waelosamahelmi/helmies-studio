"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/client-fetch";
import ErrorState from "@/components/states/ErrorState";
import { useModelCatalog } from "@/components/studio/useModelCatalog";
import {
  Confirm, Field, Segmented, Dropzone,
  useGridRoving, LibrarySearch, LibrarySkeleton,
  IcPersona, IcPalette, IcImage, IcPlus, IcTrash, IcCheck, IcRefresh,
  IcAlert, IcClose, IcLock, IcSpark, IcMic, IcChevronLeft,
} from "@/components/studio/kit";
import {
  ATTRIBUTE_KEYS, REFERENCE_KINDS,
  IDENTITY_PACK, packFor, missingPackAngles, imageReferenceSlot, canRenderIdentityAngle,
  isStillImageModel,
  isObservable, voiceReferences, VOICE_REFERENCE_KIND,
  stepsFor, stepState,
} from "@/lib/entity-core.mjs";
import { GEMINI_TTS_VOICES } from "@/lib/model-catalog-core.mjs";
import { pickTextToImageModel } from "@/lib/project-models.mjs";

/* One model does the identity work, and it is not switchable. A picker here
   was a decision nobody wanted to make in the middle of building a character,
   and every choice in it renders the same five angles. Ordered by preference;
   the first that is actually live wins, so a row going inactive degrades
   instead of breaking (which is exactly what happened to nano-banana-pro). */
/* For the first view of a place or a product, where there is nothing to
   reference yet. Ordered by how well they render a described space. */
const TEXT_TO_IMAGE_PREFERENCE = [
  "seedream/5-pro-text-to-image",
  "seedream-5-pro-text-to-image",
  "nano-banana-2",
  "seedream/4-text-to-image",
  "flux-dev",
];

const IDENTITY_MODEL_PREFERENCE = [
  "seedream/5-pro-image-to-image",
  "nano-banana-2",
  "qwen3/pro-image-to-image",
  "google/nano-banana-edit",
  "seedream/4.5-edit",
];

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

/* The coverage sheet says the same thing three ways, because a face, a room
   and an object drift for the same reason but a user is not thinking about
   "entities" — they are thinking about a person, a place, or a thing. */
const SHEET_COPY = {
  character: {
    title: "Identity sheet",
    unit: "angles", one: "angle",
    hint: "Shots pick their reference by angle — a close-up reads the front, a wide reads the full body. A gap here is where a face starts to drift.",
  },
  environment: {
    title: "Coverage",
    unit: "views", one: "view",
    hint: "A room known from one photograph is a room the renderer re-invents the moment the camera turns around. These are the views coverage actually asks for.",
  },
  product: {
    title: "Turnaround",
    unit: "sides", one: "side",
    hint: "Every side a shot can be built from, so the object survives the cut unchanged.",
  },
};

/* A room reads wide, a body reads tall, a face reads square. */
function angleAspect(entityKind, angleKind) {
  if (entityKind === "environment") return angleKind === "texture" ? "1:1" : "16:9";
  if (entityKind === "product") return "1:1";
  return angleKind === "full_body" || angleKind === "half_body" ? "3:4" : "1:1";
}

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
  const [step, setStep] = useState("start");
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
      setStep("start");
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

        <StepRail entity={editing} step={step} onStep={setStep} />

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

            {/* Every kind has a coverage pack. A place known from one
                photograph is a place the renderer re-invents the moment the
                camera turns around — which is how the same bedroom comes
                back with a different window three shots later. The shelf
                below it still takes uploads for anything the pack misses. */}
            {step === "identity" && (
              <>
                <IdentitySheet
                  entity={editing}
                  locked={locked}
                  onAddReference={addReference}
                  onDropReference={dropReference}
                  onError={setError}
                  onNotice={setNotice}
                />
                <ReferenceShelf
                  entity={editing} locked={locked} hideAngles={false}
                  onAddReference={addReference} onDropReference={dropReference} onError={setError}
                />
              </>
            )}

            {step === "look" && (
              <LookStep
                entity={editing} locked={locked}
                onAddReference={addReference} onDropReference={dropReference}
                onError={setError} onNotice={setNotice}
              />
            )}

            {step === "start" && (
              <IdentityFields entity={editing} locked={locked} onPatch={patch} onError={setError} onNotice={setNotice} />
            )}

            {step === "voice" && editing.kind === "character" && (
              <VoiceSection
                entity={editing}
                locked={locked}
                voices={voices}
                onPatch={patch}
                onAddReference={addReference}
                onDropReference={dropReference}
                onError={setError}
                onNotice={setNotice}
              />
            )}

            {step === "ready" && (
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
            )}

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
              const gaps = missingPackAngles(item).length;
              return (
                <div key={item.id} className="st-item" role="listitem">
                  <button
                    type="button" data-card onClick={() => { setEditingId(item.id); setStep("start"); }}
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
function IdentityFields({ entity, locked, onPatch, onError, onNotice }) {
  const [name, setName] = useState(entity.name);
  const [description, setDescription] = useState(entity.description || "");
  const [attributes, setAttributes] = useState(entity.attributes || {});
  const [reading, setReading] = useState(false);
  const [suggested, setSuggested] = useState(null);   // keys the photo just filled

  const hasPhotos = (entity.references || []).some((r) => r.kind !== VOICE_REFERENCE_KIND);

  /* The photograph answers for itself. Nothing is saved until the user
     accepts — we never silently rewrite somebody's character — and a field
     they have already written is left alone. */
  const readFromPhotos = useCallback(async () => {
    setReading(true);
    try {
      const res = await apiFetch(`/api/entities/${entity.id}/describe`, { method: "POST", timeout: 120000, retries: 0 });
      const data = await res.json();
      const filled = {};
      for (const [key, value] of Object.entries(data.attributes || {})) {
        if ((attributes[key] || "").trim()) continue; // never overwrite their words
        filled[key] = value;
      }
      if (!Object.keys(filled).length) {
        onNotice?.("Nothing new to add — the photograph agrees with what is already written.");
        return;
      }
      setAttributes((a) => ({ ...a, ...filled }));
      setSuggested(new Set(Object.keys(filled)));
      await onPatch(entity.id, { attributes: { ...attributes, ...filled } });
      onNotice?.(`Read ${Object.keys(filled).length} details from the photograph. Correct anything that is wrong.`);
    } catch (e) {
      onError?.(e?.message || "The photograph could not be read.");
    } finally {
      setReading(false);
    }
  }, [entity.id, attributes, onPatch, onError, onNotice]);

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
      {(() => {
        const keys = ATTRIBUTE_KEYS[entity.kind] || [];
        const groups = entity.kind === "character"
          ? [
              { keys: keys.filter(isObservable), title: "What the camera sees", hint: hasPhotos ? "Read from your photographs. Correct anything that is wrong — these words go into every shot." : "Describe them. With no photograph, this is the only thing telling the model who they are." },
              { keys: keys.filter((k) => !isObservable(k)), title: "Direction", hint: "No photograph can tell us these. They shape how the character is written and performed." },
            ]
          : [{ keys, title: null, hint: null }];

        return groups.filter((g) => g.keys.length).map((group) => (
          <div key={group.title || "all"}>
            {group.title && (
              <div className="hs-row hs-row--between" style={{ marginBottom: "var(--s-2)" }}>
                <div>
                  <span className="hs-label" style={{ margin: 0 }}>{group.title}</span>
                  {group.hint && <p className="hs-hint" style={{ marginTop: 2 }}>{group.hint}</p>}
                </div>
                {group.title === "What the camera sees" && hasPhotos && !locked && (
                  <button
                    type="button" className="hs-btn hs-btn--outline hs-btn--sm"
                    onClick={readFromPhotos} disabled={reading}
                    title="Fill these in from the photographs, without touching anything you have written"
                  >
                    {reading ? <span className="hs-spin" /> : <IcSpark className="hs-icon-sm" />}
                    {reading ? "Reading…" : "Read from photograph"}
                  </button>
                )}
              </div>
            )}
            <div className="st-fields">
              {group.keys.map((key) => {
                const [label, hint] = FIELD_LABELS[key] || [key, ""];
                return (
                  <Field key={key} label={label} hint={suggested?.has(key) ? "Read from your photograph" : hint}>
                    {(id) => (
                      <input
                        id={id} className="hs-input" value={attributes[key] || ""} disabled={locked} maxLength={400}
                        onChange={(e) => {
                          setAttributes((a) => ({ ...a, [key]: e.target.value }));
                          if (suggested?.has(key)) setSuggested((prev) => { const n = new Set(prev); n.delete(key); return n; });
                        }}
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
          </div>
        ));
      })()}
    </Fieldset>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   IDENTITY SHEET — coverage by angle, and how the gaps get filled
   ══════════════════════════════════════════════════════════════════════ */
function IdentitySheet({ entity, locked, onAddReference, onDropReference, onError, onNotice }) {
  /* NO modelType filter. The strongest reference models — seedream/5-pro,
     qwen3/pro, nano-banana-edit — are filed under modelType "i2i", not
     "image", so asking for type=image hid every one of them. The kit's own
     guidance is to take the whole catalog and filter by capability, because
     the DB's modelType values are fragmented. */
  const { models } = useModelCatalog();
  const [modelId, setModelId] = useState(null);
  const [running, setRunning] = useState({});
  const [spent, setSpent] = useState(0);

  const byKind = useMemo(() => {
    const map = new Map();
    for (const ref of entity.references || []) if (!map.has(ref.kind)) map.set(ref.kind, ref);
    return map;
  }, [entity.references]);

  const pack = packFor(entity.kind);
  const missing = missingPackAngles(entity);
  /* What the user handed us. Every pack view is derived from it, so one
     casual snapshot is enough to start — we never ask them to go and shoot
     a profile, or walk round the room, themselves.

     A character's upload is filed under the "source" kind precisely so it
     is not mistaken for an angle. A place or a product has no such slot:
     the first photograph of a room IS a view of that room, so anything the
     user uploaded counts as the thing to shoot the rest from. */
  const sources = entity.kind === "character"
    ? (entity.references || []).filter((r) => r.kind === "source")
    : (entity.references || []).filter((r) => r.source !== "generated");
  const hasSource = sources.length > 0;

  /* Two tests, both read from the model's own parameters rather than its
     metadata. imageReferenceSlot is the SAME function the server uses to
     decide where references go, so this list can never offer a model whose
     references the server would have nowhere to put. isStillImageModel then
     drops anything that makes time instead of a frame — the catalog has live
     video rows stored as capability "text-to-image", so without it this
     picker offered Veo 3 for generating somebody's face. */
  const referenceModels = useMemo(
    () => (models || []).filter(canRenderIdentityAngle),
    [models]
  );

  /* Selection is an id, resolved against the live list — so a pinned model
     that goes inactive resolves to null and the effect above picks the next
     one, rather than leaving a stale object nothing can render. */
  const model = useMemo(
    () => referenceModels.find((m) => m.id === modelId) || null,
    [referenceModels, modelId]
  );

  /* Pick by what the model can DO, never by name. Naming a favourite is how
     a studio ends up pointing at a row somebody deactivated — which is
     exactly what happened to nano-banana-pro mid-session. Preference order:
     it must take references at all, more reference slots beat fewer (several
     angles of the same face hold identity better than one), then cheapest. */
  useEffect(() => {
    if (modelId || !referenceModels.length) return;
    const preferred = IDENTITY_MODEL_PREFERENCE.find((id) => referenceModels.some((m) => m.id === id));
    if (preferred) return setModelId(preferred);
    // Nothing on the list is live — fall back to whatever can hold the most
    // references, then to whatever is cheapest.
    const ranked = [...referenceModels].sort((a, b) => {
      const slotA = imageReferenceSlot(a.schema);
      const slotB = imageReferenceSlot(b.schema);
      if (!!slotA?.multiple !== !!slotB?.multiple) return slotA?.multiple ? -1 : 1;
      return (a.credits ?? Infinity) - (b.credits ?? Infinity);
    });
    setModelId(ranked[0]?.id ?? null);
  }, [referenceModels, modelId]);

  const busy = Object.values(running).some((s) => s === "queued" || s === "running");

  /* THE ANCHOR. A character must start from a real photograph — inventing
     somebody's face and then calling it their identity would be a lie. A
     PLACE or a PRODUCT is different: it is invented anyway, and a room
     described but never seen had no way forward at all. So the first view
     of a place can be generated from its description, and every other view
     is then derived from that one.

     It needs a model that takes no reference, because there is nothing to
     reference yet — the identity models all require an image input. */
  const anchorKind = pack[0]?.kind;
  const fromScratchModel = useMemo(() => {
    if (entity.kind === "character") return null;
    /* One shared rule, so this and the Projects panel can never disagree
       about what may draw a room. It requires POSITIVE evidence that a
       model makes a still — an absent schema is excluded, not waved
       through, which is what let a text-to-video model be picked. */
    const preferred = TEXT_TO_IMAGE_PREFERENCE.find((id) => (models || []).some((m) => m.id === id));
    return pickTextToImageModel(models, { preferred });
  }, [models, entity.kind]);

  const canStartFromScratch = !hasSource && !!fromScratchModel && Boolean((entity.description || "").trim());

  const generateAngle = useCallback(async (angle) => {
    setRunning((r) => ({ ...r, [angle.kind]: "queued" }));
    try {
      /* With no reference on file, the anchor view is generated from the
         written description alone, by a model that needs no image. Every
         later view then references this one. */
      const scratch = !hasSource && angle.kind === anchorKind && fromScratchModel;
      const useModel = scratch ? fromScratchModel : model;
      const res = await apiFetch("/api/generate/async", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tool: "image",
          model: useModel.id,
          prompt: scratch
            ? [entity.description, angle.prompt].filter(Boolean).join(". ")
            : angle.prompt,
          // The angle prompts are deliberately clinical; expanding them adds
          // invented look ("editorial", "pale skin tones") to what is meant
          // to be a plain record of this person.
          expand: false,
          // Nothing to reference yet on the anchor — sending the entity
          // would inject a reference list that is empty and, worse, make
          // the server pick a model that requires one.
          ...(scratch ? {} : { entityIds: [entity.id], entityPurpose: "identity" }),
          // A room reads wide, a body reads tall, a face reads square.
          // Everything else the model requires is filled from its own schema
          // server-side.
          aspect_ratio: angleAspect(entity.kind, angle.kind),
          // The worker attaches it when the render settles, so closing the
          // tab no longer means a paid-for angle goes nowhere. The poll
          // below is only so the sheet fills in while you are watching.
          attachTo: { entityId: entity.id, kind: angle.kind, label: angle.label },
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
  }, [entity.id, entity.description, model, hasSource, anchorKind, fromScratchModel, onAddReference, onError]);

  const fillGaps = useCallback(async () => {
    if (!missing.length) return;
    /* Order matters when there is nothing on file: the anchor has to exist
       BEFORE the other views, because they are generated as references to
       it. Firing them all at once would produce five unrelated rooms. */
    let queue = missing;
    if (!hasSource) {
      const anchor = missing.find((a) => a.kind === anchorKind);
      if (!anchor || !fromScratchModel) return;
      if (!(await generateAngle(anchor))) return;
      queue = missing.filter((a) => a.kind !== anchorKind);
      if (!queue.length) { onNotice?.("The first view is in. Generate the rest from it."); return; }
      // The remaining views reference the anchor, which the parent has now
      // attached — but this component's `entity` prop is a render behind.
      onNotice?.("First view made. Generating the rest from it…");
    }
    if (!model) return;
    const made = (await Promise.all(queue.map(generateAngle))).filter(Boolean).length;
    if (made) onNotice?.(`${made} ${(SHEET_COPY[entity.kind]?.one || "angle")}${made === 1 ? "" : "s"} added.`);
  }, [model, missing, hasSource, anchorKind, fromScratchModel, entity.kind, generateAngle, onNotice]);

  const covered = pack.length - missing.length;

  return (
    <Fieldset
      title={SHEET_COPY[entity.kind]?.title || SHEET_COPY.character.title}
      hint={SHEET_COPY[entity.kind]?.hint || SHEET_COPY.character.hint}
      right={
        <span className="hs-mono hs-mute" style={{ fontSize: 10, whiteSpace: "nowrap" }}>
          {covered}/{pack.length} {SHEET_COPY[entity.kind]?.unit || "angles"}
        </span>
      }
    >
      <div className="st-angles" role="list" aria-label="Reference angles">
        {pack.map((angle) => {
          const ref = byKind.get(angle.kind);
          const state = running[angle.kind];
            const pending = state === "queued" || state === "running";
            /* An empty slot is a control, not a placeholder: one angle can be
               made (or remade) on its own, so a single bad result never means
               paying for the whole pack again. */
            const canMakeOne = !locked && !ref && !pending && !!(
              hasSource ? model : (angle.kind === anchorKind && fromScratchModel)
            );
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
                    ? `${missing.length} ${SHEET_COPY[entity.kind]?.one || "angle"}${missing.length === 1 ? "" : "s"} to make. Every one is generated from what is already on file, so it stays the same ${entity.kind === "character" ? "person" : entity.kind === "environment" ? "place" : "object"}.`
                    : canStartFromScratch
                      /* A place is invented anyway. Refusing to draw the
                         first view of a room we have only described left
                         every environment the breakdown created with
                         nothing at all and no way forward. */
                      ? `Nothing on file yet. The first view is drawn from the description, and every other view is then generated from that one — so they are all the same ${entity.kind === "environment" ? "place" : "object"}.`
                      : "Add one photograph of them first. Every angle is generated from what you give us — nothing here is invented from a description."}
                </span>

                {(hasSource || canStartFromScratch) && (
                  <>
                    <div style={{ display: "flex", gap: "var(--s-2)", alignItems: "center", flexWrap: "wrap" }}>
                      <button type="button" className="hs-btn hs-btn--primary hs-btn--sm"
                        onClick={fillGaps} disabled={busy || (hasSource ? !model : !fromScratchModel)}
                        title={hasSource && !model ? "No image model here accepts a reference photograph" : ""}>
                        {busy ? <span className="hs-spin" /> : <IcSpark className="hs-icon-sm" />}
                        {busy
                          ? "Generating…"
                          : hasSource
                            ? `Generate ${missing.length === pack.length ? "all " : ""}${missing.length} ${(SHEET_COPY[entity.kind]?.one || "angle")}${missing.length === 1 ? "" : "s"}`
                            : `Draw the first ${SHEET_COPY[entity.kind]?.one || "view"} from the description`}
                      </button>
                      {model?.credits != null && (
                        <span className="hs-mono hs-mute" style={{ fontSize: 10 }}>
                          {model.credits} each · {model.credits * missing.length} total
                        </span>
                      )}
                      {spent > 0 && <span className="hs-mono hs-mute" style={{ fontSize: 10 }}>{spent} spent</span>}
                    </div>

                    <span className="hs-mono hs-mute" style={{ fontSize: 10 }}>
                      {hasSource
                        ? (model ? `Rendered by ${model.displayName || model.id}` : "No reference model available")
                        : (fromScratchModel ? `Rendered by ${fromScratchModel.displayName || fromScratchModel.id}` : "No model available")}
                    </span>
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
  const packKinds = useMemo(() => new Set(packFor(entity.kind).map((a) => a.kind)), [entity.kind]);
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

/* ══════════════════════════════════════════════════════════════════════
   VOICE — a recording, or a sample generated and kept
   ──────────────────────────────────────────────────────────────────────
   Two different things, deliberately side by side. A voice PROFILE is a
   clone: it can say anything, and making one needs the wizard in Audio. A
   voice REFERENCE is just audio of how somebody sounds, which several video
   models take directly (wan-2.7-r2v's reference_voice, seedance's
   reference_audio_urls) with no cloning involved. For a film where one
   person plays two versions of themselves, the reference is usually the
   shorter route, so it belongs here rather than behind another studio.
   ══════════════════════════════════════════════════════════════════════ */
function VoiceSection({ entity, locked, voices, onPatch, onAddReference, onDropReference, onError, onNotice }) {
  const { models } = useModelCatalog();
  const [line, setLine] = useState("");
  const [voiceName, setVoiceName] = useState("Charon");
  const [busy, setBusy] = useState(false);

  const refs = voiceReferences(entity);

  /* Pinned, like the identity model. Gemini's TTS takes a NAMED voice rather
     than a description of one, which is the difference between auditioning a
     voice and hoping a sentence conjures it. Cheapest-wins used to pick an
     elevenlabs row at 1 credit — the cheapest models in the catalog and the
     ones that do not work. */
  const speechModel = useMemo(
    () => (models || []).find((m) => m.id === "google/gemini-3-1-flash-tts") || null,
    [models]
  );
  const voiceNames = speechModel?.schema?.fields?.voice_name?.enum || GEMINI_TTS_VOICES;

  const generateSample = useCallback(async () => {
    if (!speechModel || !line.trim()) return;
    setBusy(true);
    try {
      const res = await apiFetch("/api/generate/async", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tool: "audio", model: speechModel.id, prompt: line.trim(), voice_name: voiceName, expand: false }),
      });
      const submitted = await res.json();
      const started = Date.now();
      for (;;) {
        if (Date.now() - started > 4 * 60 * 1000) {
          throw new Error("The sample is taking unusually long. It is still running — reopen this record shortly.");
        }
        await new Promise((r) => setTimeout(r, 2500));
        const gen = await (await apiFetch(`/api/generations/status?id=${submitted.generationId}`)).json();
        if (gen.status === "completed" && gen.outputUrl) {
          await onAddReference(entity.id, {
            url: gen.outputUrl, kind: VOICE_REFERENCE_KIND, label: `${voiceName} — ${line.trim().slice(0, 50)}`, source: "generated",
          });
          setLine("");
          onNotice?.("Sample kept as this character's voice.");
          return;
        }
        if (gen.status === "failed") throw new Error(gen.error || "The sample failed.");
      }
    } catch (e) {
      onError?.(e?.message || "The sample could not be made.");
    } finally {
      setBusy(false);
    }
  }, [speechModel, line, voiceName, entity.id, onAddReference, onError, onNotice]);

  return (
    <Fieldset
      title="Voice"
      hint="How they sound. A model that accepts a voice reference is given this automatically, the same way it is given the face."
    >
      {refs.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-2)" }}>
          {refs.map((ref) => (
            <div key={ref.id} className="hs-row" style={{ gap: "var(--s-3)" }}>
              <audio src={ref.url} controls style={{ flex: 1, height: 32 }} />
              <span className="hs-mono hs-mute" style={{ fontSize: 10, whiteSpace: "nowrap" }}>
                {ref.source === "generated" ? "Generated" : "Yours"}
              </span>
              {!locked && (
                <button
                  type="button" className="hs-btn hs-btn--sm hs-btn--icon hs-btn--danger"
                  onClick={() => onDropReference(entity.id, ref.id)}
                  aria-label={`Remove ${ref.label || "this voice reference"}`}
                >
                  <IcTrash className="hs-icon-sm" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {!locked && (
        <>
          <Field label="Upload a recording" hint="Twenty seconds of clear speech is plenty, and it is the strongest option — it is actually them.">
            <Dropzone
              value={null}
              accept="audio/*"
              label="Drop an audio file or click to browse"
              onChange={async (file) => {
                if (!file?.url) return;
                try {
                  await onAddReference(entity.id, {
                    url: file.url, kind: VOICE_REFERENCE_KIND, label: file.name, source: "user", locked: true,
                  });
                } catch (e) {
                  onError?.(e?.message || "That recording could not be attached.");
                }
              }}
            />
          </Field>

          {speechModel && (
            <>
              <Field label="Or pick a voice and hear it" hint={`${voiceNames.length} voices. Generate a line, listen, and keep the one that sounds like them.`}>
                {(id) => (
                  <select id={id} className="hs-select" value={voiceName} onChange={(e) => setVoiceName(e.target.value)}>
                    {voiceNames.map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                )}
              </Field>
              <Field
                label="The line they say"
                hint={`Made with ${speechModel.displayName || speechModel.id}${speechModel.credits != null ? ` · ${speechModel.credits} credits a take` : ""}. Every take you keep is listed above and playable.`}
              >
                <div style={{ display: "flex", gap: "var(--s-2)", flexWrap: "wrap" }}>
                  <input
                    className="hs-input"
                    style={{ flex: 1, minWidth: 220 }}
                    value={line}
                    maxLength={300}
                    placeholder="You're late."
                    onChange={(e) => setLine(e.target.value)}
                  />
                  <button type="button" className="hs-btn hs-btn--sm" onClick={generateSample} disabled={busy || !line.trim()}>
                    {busy ? <span className="hs-spin" /> : <IcMic className="hs-icon-sm" />}
                    {busy ? "Making…" : `Hear ${voiceName}`}
                  </button>
                </div>
              </Field>
            </>
          )}
        </>
      )}

      <Field
        label="Cloned voice profile"
        hint={voices.length
          ? "A clone can say anything, not just this sample. Made in Audio."
          : "None yet — the clone wizard lives in Audio. A reference above works without one."}
      >
        {(id) => (
          <select
            id={id} className="hs-select" value={entity.voiceId || ""} disabled={locked || !voices.length}
            onChange={(e) => {
              const v = voices.find((p) => p.id === e.target.value);
              onPatch(entity.id, { voiceId: v?.id || null, voiceName: v?.name || null },
                v ? `${v.name} attached.` : "Voice profile removed.");
            }}
          >
            <option value="">No cloned profile</option>
            {voices.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        )}
      </Field>
    </Fieldset>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   STEP RAIL
   ──────────────────────────────────────────────────────────────────────
   The ticks report what is actually done, read from the record rather than
   from where somebody has clicked. Every step stays reachable: building a
   character out of order is not a mistake, so this guides without gating.
   ══════════════════════════════════════════════════════════════════════ */
function StepRail({ entity, step, onStep }) {
  const steps = stepsFor(entity.kind);
  const done = stepState(entity);
  const current = steps.find((s) => s.id === step) || steps[0];

  return (
    <div className="st-steps">
      <ol className="st-steps__list">
        {steps.map((s, i) => {
          const isDone = done[s.id];
          const isCurrent = s.id === step;
          return (
            <li key={s.id} className="st-steps__item">
              <button
                type="button"
                className={`st-step${isCurrent ? " is-current" : ""}${isDone ? " is-done" : ""}`}
                onClick={() => onStep(s.id)}
                aria-current={isCurrent ? "step" : undefined}
                aria-label={`Step ${i + 1}, ${s.label}${isDone ? ", done" : ""}. ${s.blurb}`}
              >
                <span className="st-step__mark" aria-hidden="true">
                  {isDone ? <IcCheck style={{ width: 12, height: 12 }} /> : i + 1}
                </span>
                <span className="st-step__label">{s.label}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <p className="st-steps__blurb">{current.blurb}</p>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   LOOK — wardrobe and props for a character, times and weather for a place
   ──────────────────────────────────────────────────────────────────────
   Each entry is a NAMED thing with its own reference, because "a black wool
   coat" and "the room at dawn" are items a shot asks for by name, not
   adjectives buried in one description field.
   ══════════════════════════════════════════════════════════════════════ */
const LOOK_KINDS = {
  character: [
    { kind: "outfit", label: "Outfit", hint: "A full look — a coat, a suit, what they wear in a scene." },
    { kind: "accessory", label: "Accessory", hint: "Glasses, a watch, a ring." },
    { kind: "prop", label: "Prop", hint: "Something they carry or handle — a phone, a cup." },
  ],
  environment: [
    { kind: "time_of_day", label: "Time of day", hint: "The same place at another hour." },
    { kind: "weather", label: "Weather", hint: "Rain, snow, haze." },
    { kind: "lighting", label: "Lighting", hint: "A specific lighting state the scene returns to." },
  ],
  product: [
    { kind: "packaging", label: "Packaging", hint: "How it is boxed or presented." },
    { kind: "in_use", label: "In use", hint: "Being held, worn, operated." },
  ],
};

function LookStep({ entity, locked, onAddReference, onDropReference, onError }) {
  const options = LOOK_KINDS[entity.kind] || LOOK_KINDS.character;
  const [kind, setKind] = useState(options[0].kind);
  const [label, setLabel] = useState("");

  const items = (entity.references || []).filter((r) => options.some((o) => o.kind === r.kind));
  const active = options.find((o) => o.kind === kind) || options[0];

  return (
    <Fieldset
      title={entity.kind === "environment" ? "Times and weather" : "Wardrobe and props"}
      hint={
        entity.kind === "environment"
          ? "A place is not one look. Give the space its other hours so a scene can return to it and still be the same room."
          : "Name each thing and give it a reference. A shot that calls for the coat gets the coat, not a guess."
      }
    >
      {items.length > 0 && (
        <div className="hs-thumbs">
          {items.map((ref) => (
            <div key={ref.id} className="hs-thumb">
              {/* eslint-disable-next-line @next/next/no-img-element -- consistent with every other studio thumbnail */}
              <img src={ref.url} alt={ref.label || ref.kind} />
              {!locked && (
                <button
                  type="button" className="hs-thumb__x"
                  onClick={() => onDropReference(entity.id, ref.id)}
                  aria-label={`Remove ${ref.label || ref.kind}`}
                >
                  <IcClose style={{ width: 11, height: 11 }} />
                </button>
              )}
              <span className="st-angle__label" style={{ position: "absolute", inset: "auto 0 0", textAlign: "center", padding: "2px 4px", background: "rgba(0,0,0,.6)" }}>
                {ref.label || ref.kind.replace(/_/g, " ")}
              </span>
            </div>
          ))}
        </div>
      )}

      {!locked && (
        <>
          <Field label="What is it?" hint={active.hint}>
            {(id) => (
              <select id={id} className="hs-select" value={kind} onChange={(e) => setKind(e.target.value)}>
                {options.map((o) => <option key={o.kind} value={o.kind}>{o.label}</option>)}
              </select>
            )}
          </Field>
          <Field label="Name it" hint="What a shot would call it — “black wool coat”, “the room at dawn”.">
            {(id) => (
              <input
                id={id} className="hs-input" value={label} maxLength={80}
                placeholder={entity.kind === "environment" ? "The room at dawn" : "Black wool coat"}
                onChange={(e) => setLabel(e.target.value)}
              />
            )}
          </Field>
          <Dropzone
            value={null}
            accept="image/*"
            label={label.trim() ? `Add a reference for “${label.trim()}”` : "Name it first, then add a reference"}
            onChange={async (file) => {
              if (!file?.url) return;
              if (!label.trim()) { onError?.("Give it a name first — a shot has to be able to ask for it."); return; }
              try {
                await onAddReference(entity.id, { url: file.url, kind, label: label.trim(), source: "user" });
                setLabel("");
              } catch (e) {
                onError?.(e?.message || "That could not be attached.");
              }
            }}
          />
        </>
      )}

      {locked && !items.length && <p className="hs-hint" style={{ margin: 0 }}>Nothing added.</p>}
    </Fieldset>
  );
}
