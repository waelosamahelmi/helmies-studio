"use client";

import { useState } from "react";

/* ══════════════════════════════════════════════════════════════════════════
   STORYBOARD CARD — the storyboard step's surface (2026-08-06)
   ──────────────────────────────────────────────────────────────────────────
   Every video/film production's plan starts with a storyboard step: the
   scenario, every character (with full-body + face-angle shots so a
   character sheet can be generated), and every scene of the whole video.
   This card renders that JSON and, in the plan card, lets the user ACCEPT
   or EDIT it before anything generates — the edited JSON travels with the
   approved plan, the ${storyboard} token in later steps resolves to it at
   run time, and the character sheets / scene stills / clips all match what
   the user approved.
   ══════════════════════════════════════════════════════════════════════════ */

export function parseStoryboard(value) {
  if (!value) return null;
  if (value && typeof value === "object") return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && Array.isArray(parsed.scenes) ? parsed : null;
  } catch {
    return null;
  }
}

const SHOT_PRESETS = ["full body", "face front", "face side", "face 3/4"];

export default function StoryboardCard({ value, editable = false, onChange }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const sb = draft || parseStoryboard(value);
  if (!sb) return null;

  const startEdit = () => {
    setDraft(JSON.parse(JSON.stringify(sb)));
    setEditing(true);
  };
  const save = () => {
    setEditing(false);
    onChange?.(JSON.stringify(draft));
    setDraft(null);
  };
  const cancel = () => { setEditing(false); setDraft(null); };

  /* ── Edit-mode helpers ────────────────────────────────────────────────── */
  const patchScenario = (scenario) => setDraft((d) => ({ ...d, scenario }));
  const patchCharacter = (i, patch) => setDraft((d) => ({
    ...d,
    characters: (d.characters || []).map((c, j) => (j === i ? { ...c, ...patch } : c)),
  }));
  const patchScene = (i, patch) => setDraft((d) => ({
    ...d,
    scenes: (d.scenes || []).map((s, j) => (j === i ? { ...s, ...patch } : s)),
  }));
  const parseShots = (text) => text.split(",").map((s) => s.trim()).filter(Boolean);

  const input = (style) => ({
    className: "hs-input",
    style: { fontFamily: "var(--ff-ui)", fontSize: "var(--t-sm)", width: "100%", ...style },
  });

  const label = (text) => (
    <span className="hs-label" style={{ display: "block", marginTop: "var(--s-2)" }}>{text}</span>
  );

  return (
    <section className="st-story" data-testid="storyboard">
      <header className="st-story__head">
        <span className="hs-label" style={{ margin: 0 }}>Storyboard</span>
        {editable && !editing && (
          <button type="button" className="hs-btn hs-btn--ghost hs-btn--sm" onClick={startEdit}>
            Edit
          </button>
        )}
        {editable && editing && (
          <span className="st-story__acts">
            <button type="button" className="hs-btn hs-btn--ghost hs-btn--sm" onClick={cancel}>Cancel</button>
            <button type="button" className="hs-btn hs-btn--primary hs-btn--sm" onClick={save}>Save storyboard</button>
          </span>
        )}
      </header>

      {/* ── Scenario ────────────────────────────────────────────────────── */}
      {editing ? (
        <>
          {label("Scenario")}
          <textarea
            {...input({ minHeight: 72 })}
            rows={3}
            value={draft.scenario || ""}
            onChange={(e) => patchScenario(e.target.value)}
            aria-label="Storyboard scenario"
          />
        </>
      ) : (
        sb.scenario && <p className="st-story__scenario">{sb.scenario}</p>
      )}

      {/* ── Characters ──────────────────────────────────────────────────── */}
      {Array.isArray(sb.characters) && sb.characters.length > 0 && (
        <div className="st-story__chars">
          {sb.characters.map((c, i) => (
            <article key={i} className="st-story__char">
              {editing ? (
                <>
                  {label("Name")}
                  <input {...input()} value={c.name || ""} onChange={(e) => patchCharacter(i, { name: e.target.value })} aria-label="Character name" />
                  {label("Role")}
                  <input {...input()} value={c.role || ""} onChange={(e) => patchCharacter(i, { role: e.target.value })} aria-label="Character role" />
                  {label("Appearance")}
                  <textarea {...input({ minHeight: 56 })} rows={2} value={c.appearance || ""} onChange={(e) => patchCharacter(i, { appearance: e.target.value })} aria-label="Character appearance" />
                  {label("Shots (comma-separated)")}
                  <input {...input()} value={(c.shots || []).join(", ")} onChange={(e) => patchCharacter(i, { shots: parseShots(e.target.value) })} aria-label="Character shots" />
                </>
              ) : (
                <>
                  <strong>{c.name}</strong>
                  {c.role && <span className="hs-hint">{c.role}</span>}
                  {c.appearance && <p className="st-story__appearance">{c.appearance}</p>}
                  {Array.isArray(c.shots) && c.shots.length > 0 && (
                    <div className="hs-chips" style={{ marginTop: "var(--s-1)" }}>
                      {c.shots.map((s, j) => <span key={j} className="hs-chip">{s}</span>)}
                    </div>
                  )}
                </>
              )}
            </article>
          ))}
        </div>
      )}

      {/* ── Scenes ──────────────────────────────────────────────────────── */}
      <ol className="st-story__scenes">
        {sb.scenes.map((s, i) => (
          <li key={s.id ?? i} className="st-story__scene">
            <span className="st-story__n">{String(s.id ?? i + 1).padStart(2, "0")}</span>
            {editing ? (
              <div style={{ flex: 1, minWidth: 0 }}>
                {label("Title")}
                <input {...input()} value={s.title || ""} onChange={(e) => patchScene(i, { title: e.target.value })} aria-label="Scene title" />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--s-2)" }}>
                  <div>
                    {label("Location")}
                    <input {...input()} value={s.location || ""} onChange={(e) => patchScene(i, { location: e.target.value })} aria-label="Scene location" />
                  </div>
                  <div>
                    {label("Time")}
                    <input {...input()} value={s.time || ""} onChange={(e) => patchScene(i, { time: e.target.value })} aria-label="Scene time" />
                  </div>
                </div>
                {label("Camera")}
                <input {...input()} value={s.camera || ""} onChange={(e) => patchScene(i, { camera: e.target.value })} aria-label="Scene camera" />
                {label("Description")}
                <textarea {...input({ minHeight: 56 })} rows={2} value={s.description || ""} onChange={(e) => patchScene(i, { description: e.target.value })} aria-label="Scene description" />
                {label("Characters (comma-separated)")}
                <input {...input()} value={Array.isArray(s.characters) ? s.characters.join(", ") : ""} onChange={(e) => patchScene(i, { characters: parseShots(e.target.value) })} aria-label="Scene characters" />
              </div>
            ) : (
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong>{s.title}</strong>
                <span className="hs-hint" style={{ marginLeft: "var(--s-2)" }}>
                  {[s.location, s.time, s.camera].filter(Boolean).join(" · ")}
                </span>
                {s.description && <p className="st-story__appearance">{s.description}</p>}
                {Array.isArray(s.characters) && s.characters.length > 0 && (
                  <div className="hs-chips" style={{ marginTop: "var(--s-1)" }}>
                    {s.characters.map((name, j) => <span key={j} className="hs-chip">{name}</span>)}
                  </div>
                )}
              </div>
            )}
          </li>
        ))}
      </ol>

      {editing && (
        <div className="st-story__hint" style={{ padding: "var(--s-3) var(--s-4)" }}>
          <span className="hs-hint" style={{ margin: 0 }}>
            Saving locks the storyboard in — every character sheet, scene still and clip in this plan is generated from it.
          </span>
        </div>
      )}
    </section>
  );
}

/* Re-exported for surfaces that only need the parser (review items). */
export { SHOT_PRESETS };
