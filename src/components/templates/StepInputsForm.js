"use client";

/* ══════════════════════════════════════════════════════════════════════════
   STEP INPUTS FORM — per-step template input controls (Phase 8 Task B1)
   ──────────────────────────────────────────────────────────────────────────
   Renders one control per editable field the template detail page's server
   component (src/app/templates/[slug]/page.js's buildStepInputs) found on
   each step's live model schema — text, number, select, a boolean toggle,
   and an image/file upload (reusing src/components/studio/kit/Controls.js's
   Dropzone, which already talks to POST /api/upload and its magic-byte
   validation; no second upload path here).

   This component is deliberately dumb: it owns no state of its own. The
   caller (TemplateRunPanel) holds `values` and passes `onChange(stepId,
   field, value)` down — that's what lets the panel re-quote on every change
   without this component needing to know anything about credits or the
   network at all.
   ══════════════════════════════════════════════════════════════════════════ */

import { Field, Toggle, Segmented, Dropzone } from "@/components/studio/kit";

function humanize(name) {
  return String(name)
    .replace(/[_-]+/g, " ")
    .replace(/([A-Z])/g, (m) => ` ${m.toLowerCase()}`)
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

function acceptFor(name) {
  if (/video/i.test(name)) return "video/*";
  if (/audio/i.test(name)) return "audio/*";
  return "image/*";
}

function FieldControl({ field, value, onChange }) {
  const label = humanize(field.name);
  const hint = field.required ? "Required" : undefined;

  // Reference images (an array field, e.g. `images_list`) — many files.
  if (field.type === "array") {
    const max = field.maxItems || 4;
    return (
      <Field label={label} hint={hint}>
        <Dropzone
          value={value}
          onChange={onChange}
          accept={acceptFor(field.name)}
          multiple
          max={max}
          label={`Add up to ${max} reference file${max === 1 ? "" : "s"}`}
        />
      </Field>
    );
  }

  // A single file (image_url/video_url/audio_url) — format:"uri" is how
  // src/lib/model-catalog-core.mjs's defaultSchemaForCapability and
  // src/lib/alibaba-catalog.js's videoSchema both declare these.
  if (field.format === "uri") {
    return (
      <Field label={label} hint={hint}>
        <Dropzone value={value} onChange={onChange} accept={acceptFor(field.name)} multiple={false} label="Upload a file" />
      </Field>
    );
  }

  if (field.type === "boolean") {
    return <Toggle checked={!!value} onChange={onChange} label={label} hint={hint} />;
  }

  if (field.enum?.length) {
    if (field.type === "number") {
      return (
        <Field label={label} hint={hint}>
          <Segmented
            label={label}
            options={field.enum.map((v) => ({ value: v, label: /duration/i.test(field.name) ? `${v}s` : String(v) }))}
            value={value}
            onChange={onChange}
          />
        </Field>
      );
    }
    return (
      <Field label={label} hint={hint}>
        {(id) => (
          <select id={id} className="hs-select" value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
            <option value="" disabled>
              Choose…
            </option>
            {field.enum.map((v) => (
              <option key={String(v)} value={v}>
                {String(v)}
              </option>
            ))}
          </select>
        )}
      </Field>
    );
  }

  if (field.type === "number") {
    return (
      <Field label={label} hint={hint}>
        {(id) => (
          <input
            id={id}
            type="number"
            className="hs-input"
            value={value ?? ""}
            min={field.minimum ?? undefined}
            max={field.maximum ?? undefined}
            onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
          />
        )}
      </Field>
    );
  }

  // Plain string — a multi-line textarea for anything prompt-shaped, a
  // single-line input otherwise.
  const multiline = /prompt/i.test(field.name);
  return (
    <Field label={label} hint={hint}>
      {(id) =>
        multiline ? (
          <textarea
            id={id}
            className="hs-input hs-textarea"
            value={value ?? ""}
            maxLength={field.maxLength ?? undefined}
            onChange={(e) => onChange(e.target.value)}
          />
        ) : (
          <input
            id={id}
            type="text"
            className="hs-input"
            value={value ?? ""}
            maxLength={field.maxLength ?? undefined}
            onChange={(e) => onChange(e.target.value)}
          />
        )
      }
    </Field>
  );
}

export default function StepInputsForm({ stepInputs = [], values, onChange }) {
  const withFields = stepInputs.filter((s) => s.fields?.length > 0);
  if (!withFields.length) return null;

  return (
    <div className="hs-stack" style={{ gap: "var(--s-5)" }}>
      {withFields.map((step, i) => (
        <section key={step.stepId} className="hs-panel-quiet" style={{ padding: "var(--s-4)" }} aria-label={`Step ${i + 1} inputs`}>
          <span className="hs-label">Step {i + 1} inputs</span>
          <div className="hs-stack" style={{ gap: "var(--s-3)", marginTop: "var(--s-3)" }}>
            {step.fields.map((field) => (
              <FieldControl
                key={field.name}
                field={field}
                value={values?.[step.stepId]?.[field.name]}
                onChange={(v) => onChange(step.stepId, field.name, v)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
