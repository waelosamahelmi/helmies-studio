"use client";

import {
  IcRefresh, IcTrash, IcCopy, IcSettings, IcMenu,
} from "@/components/studio/kit";

/* ══════════════════════════════════════════════════════════════════════════
   STEP NODE — .st-node
   ──────────────────────────────────────────────────────────────────────────
   One card, one step. It carries everything you need to judge it without
   opening anything: what kind of work it is, what it is called, what it will
   cost, how it went last time, and — once it has run — what it made. The
   name is edited in place because renaming a step is not a decision worth a
   dialog. Everything that changes the step's substance (model, prompt,
   ratio) lives behind Configure, where there is room to be honest about it.
   ══════════════════════════════════════════════════════════════════════════ */

const pad = (n) => String(n).padStart(2, "0");
const isUrl = (s) => typeof s === "string" && /^(https?:\/\/|\/)/.test(s.trim());
const isVideoUrl = (u) => /\.(mp4|webm|mov|m4v)(\?|$)/i.test(u) || u.includes("/video/");
const isAudioUrl = (u) => /\.(mp3|wav|ogg|m4a|flac|aac)(\?|$)/i.test(u);

const STATUS_LABEL = { done: "Done", failed: "Failed", running: "Running" };

export default function StepNode({
  index,
  step,
  kind,
  cost,
  status,          // "done" | "failed" | "running" | undefined
  output,          // url produced by the last run, when there was one
  active,          // its editor is open
  dragging,
  busy,
  canRerun,
  onOpen,
  onRename,
  onDuplicate,
  onRemove,
  onRerun,
  onDragStart,
  onDragEnd,
}) {
  const n = index + 1;
  const label = kind?.label || step.kind;
  const Icon = kind?.icon;
  const nameId = `wf-step-name-${step.key}`;
  const preview = step.prompt?.trim() || step.model || (kind ? kind.desc : "Not configured yet");

  return (
    <div
      className={
        `st-node${active ? " is-active" : ""}${dragging ? " is-dragging" : ""}` +
        (status ? ` is-${status}` : "")
      }
      draggable
      onDragStart={(e) => {
        // A drag that begins inside the name field is a text selection, not
        // a reorder — let the browser have it.
        if (e.target?.closest?.("input, textarea")) { e.preventDefault(); return; }
        onDragStart?.(e, step.key);
      }}
      onDragEnd={onDragEnd}
      data-kind={step.kind}
    >
      <span className="st-node__grip" aria-hidden="true"><IcMenu className="hs-icon-sm" /></span>
      <span className="st-node__n hs-mono">{pad(n)}</span>
      <span className="st-node__icon" aria-hidden="true">{Icon ? <Icon className="hs-icon-sm" /> : null}</span>

      <label className="hs-sr" htmlFor={nameId}>Step {n} name</label>
      <input
        id={nameId}
        className="st-node__name"
        value={step.name}
        onChange={(e) => onRename?.(e.target.value)}
        placeholder={label}
        draggable={false}
      />

      <span className="st-node__kind">{label}</span>

      <span className="st-node__cost hs-mono">{cost == null ? "—" : `${cost} cr`}</span>

      {status && (
        <span className={`st-node__chip is-${status}`}>{STATUS_LABEL[status] || status}</span>
      )}

      <p className="st-node__prompt">{preview}</p>

      {isUrl(output) && (
        <a
          className="st-node__out"
          data-testid={`step-output-${n}`}
          href={output}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open step ${n}'s output in a new tab`}
        >
          {isVideoUrl(output) ? (
            <video src={output} muted playsInline preload="metadata" />
          ) : isAudioUrl(output) ? (
            <span className="st-node__out-audio hs-mono">AUDIO</span>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- next/image would change loading/layout behavior; deferred, out of scope for lint-only stabilization (2026-08-01)
            <img src={output} alt={`Step ${n} output`} />
          )}
        </a>
      )}

      {!kind && (
        <p className="hs-notice hs-notice--caution st-node__warn">
          This step is a “{step.kind}” type, which the engine cannot run. Configure it and pick
          a different type.
        </p>
      )}

      <div className="st-node__tools">
        <button
          type="button"
          className="hs-btn hs-btn--ghost hs-btn--sm"
          onClick={onOpen}
          aria-label={`Configure step ${n}`}
        >
          <IcSettings className="hs-icon-sm" /> Configure
        </button>

        {canRerun && (
          <button
            type="button"
            className="hs-btn hs-btn--ghost hs-btn--sm hs-btn--icon"
            onClick={onRerun}
            disabled={!!busy || status === "running"}
            aria-label={`Rerun step ${n} on its own`}
            title="Rerun this step on its own"
          >
            {status === "running"
              ? <span className="hs-spin" style={{ width: 12, height: 12 }} />
              : <IcRefresh className="hs-icon-sm" />}
          </button>
        )}

        <button
          type="button"
          className="hs-btn hs-btn--ghost hs-btn--sm hs-btn--icon"
          onClick={onDuplicate}
          disabled={!!busy}
          aria-label={`Duplicate step ${n}`}
          title="Duplicate this step"
        >
          <IcCopy className="hs-icon-sm" />
        </button>

        <button
          type="button"
          className="hs-btn hs-btn--ghost hs-btn--sm hs-btn--icon"
          onClick={onRemove}
          disabled={!!busy}
          aria-label={`Remove step ${n}`}
          title="Remove this step"
        >
          <IcTrash className="hs-icon-sm" />
        </button>
      </div>
    </div>
  );
}
