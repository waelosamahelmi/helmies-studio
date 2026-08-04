"use client";

import { useState } from "react";
import { ModelPicker, Sheet, IcCheck, IcRefresh, IcExternal } from "@/components/studio/kit";

/* ══════════════════════════════════════════════════════════════════════════
   ASSET CARD — one produced asset, reviewed before the run continues
   (EDITSv1 E3.5)
   ──────────────────────────────────────────────────────────────────────────
   Inline preview (img/video/audio by URL), and — while gated — Accept,
   Regenerate, Edit (prompt/model override sheet -> regenerate with
   overrides) and "Don't ask again" (auto-complete the rest). Rendered
   ungated (preview only, open-in-new-tab) for finished runs and history.
   ══════════════════════════════════════════════════════════════════════════ */

const isVideo = (u) => /\.(mp4|webm|mov|m4v)(\?|$)/i.test(u) || u.includes("/video/");
const isAudio = (u) => /\.(mp3|wav|ogg|m4a|flac)(\?|$)/i.test(u);

export default function AssetCard({
  url,
  label = "Generated asset",
  gated = false,
  busy = false,
  currentPrompt = "",
  modelPool = [],
  modelsLoading = false,
  onAccept,
  onRegenerate, // (overrides|null) => void
  onAutoComplete,
}) {
  const [editing, setEditing] = useState(false);
  const [prompt, setPrompt] = useState(currentPrompt || "");
  const [model, setModel] = useState("");

  if (!url) return null;

  const submitEdit = () => {
    const overrides = {};
    if (prompt.trim() && prompt.trim() !== (currentPrompt || "").trim()) overrides.prompt = prompt.trim();
    if (model) overrides.model = model;
    setEditing(false);
    onRegenerate?.(Object.keys(overrides).length ? overrides : null);
  };

  return (
    <section className="st-asset" aria-label={label}>
      <div className="st-asset__preview">
        {isVideo(url) ? (
          <video src={url} controls muted playsInline preload="metadata" />
        ) : isAudio(url) ? (
          <audio src={url} controls preload="metadata" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- provider/proxy output URLs; next/image would change loading behavior
          <img src={url} alt={label} />
        )}
      </div>

      <div className="st-asset__acts">
        {gated ? (
          <>
            <button
              type="button"
              className="hs-btn hs-btn--primary hs-btn--sm"
              onClick={onAccept}
              disabled={busy}
            >
              <IcCheck className="hs-icon-sm" /> Accept
            </button>
            <button
              type="button"
              className="hs-btn hs-btn--ghost hs-btn--sm"
              onClick={() => onRegenerate?.(null)}
              disabled={busy}
            >
              <IcRefresh className="hs-icon-sm" /> Regenerate
            </button>
            <button
              type="button"
              className="hs-btn hs-btn--ghost hs-btn--sm"
              onClick={() => setEditing(true)}
              disabled={busy}
            >
              Edit
            </button>
            <button
              type="button"
              className="hs-btn hs-btn--ghost hs-btn--sm"
              onClick={onAutoComplete}
              disabled={busy}
              title="Accept this and finish the remaining steps without asking again"
              style={{ marginLeft: "auto" }}
            >
              Don&apos;t ask again
            </button>
          </>
        ) : (
          <a
            className="hs-btn hs-btn--ghost hs-btn--sm"
            href={url}
            target="_blank"
            rel="noopener noreferrer"
          >
            <IcExternal className="hs-icon-sm" /> Open
          </a>
        )}
      </div>

      <Sheet open={editing} onClose={() => setEditing(false)} title="Edit and regenerate">
        <div className="hs-stack" style={{ gap: "var(--s-4)" }}>
          <div className="hs-field">
            <label className="hs-label" htmlFor="asset-edit-prompt">Prompt</label>
            <textarea
              id="asset-edit-prompt"
              className="hs-input"
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe what should change"
            />
          </div>

          {modelPool.length > 0 && (
            <ModelPicker
              models={modelPool}
              value={model}
              onSelect={(id) => setModel(id)}
              loading={modelsLoading}
              label="Model (optional override)"
            />
          )}

          <div className="hs-row" style={{ justifyContent: "flex-end", gap: "var(--s-2)" }}>
            <button type="button" className="hs-btn hs-btn--ghost hs-btn--sm" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button type="button" className="hs-btn hs-btn--primary hs-btn--sm" onClick={submitEdit} disabled={busy}>
              <IcRefresh className="hs-icon-sm" /> Regenerate with changes
            </button>
          </div>
        </div>
      </Sheet>
    </section>
  );
}
