"use client";

import { useEffect, useState } from "react";
import { Sheet, Field, Chips, Stepper } from "@/components/studio/kit";

/* ══════════════════════════════════════════════════════════════════════════
   SHOT EDITOR — E4.2
   ──────────────────────────────────────────────────────────────────────────
   Every field of one planned shot, editable in a sheet. The editor works on
   a local draft and hands the whole patched shot back through onSave — the
   parent owns the PATCH (and therefore the recomputed cost that comes back
   from the server; nothing here ever computes a price).
   ══════════════════════════════════════════════════════════════════════════ */

const SECTIONS = ["intro", "verse", "chorus", "bridge", "outro", "instrumental", "dialogue", "action"]
  .map((v) => ({ value: v, label: v }));

const TRANSITIONS = [
  { value: "cut", label: "Cut" },
  { value: "fade", label: "Fade" },
  { value: "dissolve", label: "Dissolve" },
];

function TextRow({ label, value, onChange, placeholder, multiline = false, hint }) {
  return (
    <Field label={label} hint={hint}>
      {(id) =>
        multiline ? (
          <textarea
            id={id}
            className="hs-input hs-textarea"
            style={{ minHeight: 64 }}
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
          />
        ) : (
          <input
            id={id}
            className="hs-input"
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
          />
        )
      }
    </Field>
  );
}

export default function ShotEditor({ open, shot, shotNumber, onClose, onSave, saving = false }) {
  const [draft, setDraft] = useState(shot || {});

  /* Re-seed the draft whenever a different shot is opened. */
  useEffect(() => {
    if (open && shot) setDraft(shot);
  }, [open, shot]);

  if (!shot) return null;

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const setCamera = (patch) => setDraft((d) => ({ ...d, camera: { ...(d.camera || {}), ...patch } }));
  const setImage = (patch) => setDraft((d) => ({ ...d, imageStrategy: { ...(d.imageStrategy || {}), ...patch } }));
  const setVideo = (patch) => setDraft((d) => ({ ...d, videoStrategy: { ...(d.videoStrategy || {}), ...patch } }));

  return (
    <Sheet open={open} onClose={onClose} title={`Shot ${shotNumber != null ? String(shotNumber).padStart(2, "0") : ""}`}>
      <div className="hs-stack st-shotedit" data-testid="shot-editor">
        <TextRow label="Title" value={draft.title} onChange={(v) => set({ title: v })} placeholder="Opening frame" />

        <Field label="Section">
          <Chips options={SECTIONS} value={draft.section || "verse"} onChange={(v) => set({ section: v })} scroll />
        </Field>

        <Field label="Duration" hint="Seconds this shot runs — the cost re-quotes when you save.">
          <Stepper
            value={Number(draft.durationSec) || 5}
            onChange={(v) => set({ durationSec: Number(v) })}
            min={2}
            max={15}
            step={1}
            suffix="s"
            label="Shot duration in seconds"
          />
        </Field>

        <TextRow label="Scene goal" value={draft.sceneGoal} onChange={(v) => set({ sceneGoal: v })} placeholder="What this shot must land visually" multiline />
        <TextRow label="Location" value={draft.environment} onChange={(v) => set({ environment: v })} placeholder="Rain-slicked alley behind the venue" multiline />
        <TextRow label="Lighting" value={draft.lighting} onChange={(v) => set({ lighting: v })} placeholder="Hard sodium key from the left, cool rim" />
        <TextRow label="Mood" value={draft.mood} onChange={(v) => set({ mood: v })} placeholder="Restless, electric" />

        <Field label="Camera">
          <div className="hs-stack" style={{ gap: "var(--s-2)" }}>
            <input className="hs-input" value={draft.camera?.framing || ""} onChange={(e) => setCamera({ framing: e.target.value })} placeholder="Framing — medium close-up" aria-label="Camera framing" />
            <input className="hs-input" value={draft.camera?.angle || ""} onChange={(e) => setCamera({ angle: e.target.value })} placeholder="Angle — low angle" aria-label="Camera angle" />
            <input className="hs-input" value={draft.camera?.lens || ""} onChange={(e) => setCamera({ lens: e.target.value })} placeholder="Lens — 35mm" aria-label="Camera lens" />
            <input className="hs-input" value={draft.camera?.movement || ""} onChange={(e) => setCamera({ movement: e.target.value })} placeholder="Movement — slow push-in" aria-label="Camera movement" />
          </div>
        </Field>

        <Field label="Transition" hint="How this shot cuts into the next — applied when the film is assembled.">
          <Chips options={TRANSITIONS} value={draft.transition || "cut"} onChange={(v) => set({ transition: v })} />
        </Field>

        <TextRow
          label="Dialogue"
          value={draft.dialogue}
          onChange={(v) => set({ dialogue: v || null })}
          placeholder='"We leave at dawn." — spoken as an audio cue'
          multiline
        />
        <TextRow
          label="Audio cues"
          value={draft.audioCues}
          onChange={(v) => set({ audioCues: v || null })}
          placeholder="Rain on glass, distant sirens"
        />

        <TextRow
          label="Still prompt"
          value={draft.imageStrategy?.prompt}
          onChange={(v) => setImage({ prompt: v })}
          placeholder="Static description — no action verbs"
          multiline
          hint="Drives the shot's keyframe image."
        />
        <TextRow
          label="Motion prompt"
          value={draft.videoStrategy?.prompt}
          onChange={(v) => setVideo({ prompt: v })}
          placeholder="15–40 words — present tense, explicit camera language"
          multiline
          hint="Drives the shot's video clip."
        />

        <div style={{ display: "flex", gap: "var(--s-2)", justifyContent: "flex-end" }}>
          <button type="button" className="hs-btn" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            type="button"
            className="hs-btn hs-btn--primary"
            onClick={() => onSave(draft)}
            disabled={saving}
          >
            {saving ? <span className="hs-spin" /> : null}
            Save shot
          </button>
        </div>
      </div>
    </Sheet>
  );
}
