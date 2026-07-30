"use client";

import { useState, useCallback, useMemo } from "react";
import StudioLayout from "./v6/StudioLayout";
import PromptDock from "./v6/PromptDock";
import StageArea from "./v6/StageArea";
import { useAsyncGeneration } from "./useAsyncGeneration";
import { useCreditCost } from "./useCreditCost";
import { useModelCatalog } from "@/components/studio/useModelCatalog";

/* ── Inline SVGs ── */
const IconFilm = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
    <path d="M7 2v20M17 2v20M2 12h20M2 7h5M2 17h5M17 17h5M17 7h5" />
  </svg>
);

const IconBolt = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="13,2 3,14 12,14 11,22 21,10 12,10" />
  </svg>
);

const IconClock = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><polyline points="12,6 12,12 16,14" />
  </svg>
);

const IconRefresh = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23,4 23,10 17,10" />
    <polyline points="1,20 1,14 7,14" />
    <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
  </svg>
);

const IconDownload = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
    <polyline points="7,10 12,15 17,10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

/* ── Constants ── */
const ASPECTS = ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"];
const DURATIONS = [3, 6, 10, 15];
const SUGGESTIONS = [
  "Smooth motion graphics with flowing particles and gradient transitions",
  "Liquid morphing shapes in pastel colors",
  "Geometric patterns pulsing to an energetic rhythm",
];

/* ══════════════════════════════════════════════════════════════ */
export default function MotionStudio() {
  /* ── Sub-mode ── */
  const [subMode, setSubMode] = useState("generate");

  /* ── Params ── */
  const [prompt, setPrompt] = useState("");
  const [editPrompt, setEditPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [duration, setDuration] = useState(6);
  const [requestId, setRequestId] = useState("");

  /* ── Generation ── */
  const [genStage, setGenStage] = useState("");
  const { loading: generating, result, error, elapsed, submit } = useAsyncGeneration();

  /* ── Model catalog ── */
  const { models: motionModels } = useModelCatalog({ modelType: "video" });

  const motionModelId = useMemo(() => {
    const found = motionModels.find(
      (m) => m.displayName?.toLowerCase().includes("motion")
    ) || motionModels[0];
    return found?.id || "";
  }, [motionModels]);

  /* ── Credit cost ── */
  const { cost, affordable, balance, shortfall } = useCreditCost(
    "vibe-motion",
    motionModelId,
    { duration_seconds: duration },
  );

  /* ── Generate ── */
  const handleGenerate = useCallback(() => {
    if (subMode === "edit") {
      if (!requestId || !editPrompt.trim()) return;
      setGenStage("preparing");
      submit("motion", motionModelId, {
        edit_prompt: editPrompt,
        request_id: requestId,
        aspect_ratio: aspectRatio,
      });
    } else {
      if (!prompt.trim()) return;
      setGenStage("preparing");
      submit("motion", motionModelId, {
        prompt,
        aspect_ratio: aspectRatio,
        duration_seconds: duration,
      });
    }
  }, [subMode, prompt, editPrompt, requestId, aspectRatio, duration, submit]);

  /* ── Actions ── */
  const handleNew = useCallback(() => {
    setPrompt("");
    setEditPrompt("");
    setRequestId("");
    setGenStage("");
    setDuration(6);
    setAspectRatio("16:9");
    window.location.reload();
  }, []);

  const handleDownload = useCallback(() => {
    if (result?.url) window.open(result.url, "_blank");
  }, [result]);

  /* ── Controls sidebar ── */
  const controls = (
    <div className="v6-control-stack">
      {/* ── Sub-mode toggle ── */}
      <div className="v6-field">
        <span className="v6-field-label">Mode</span>
        <div className="v6-segmented">
          {[
            { key: "generate", label: "Generate" },
            { key: "edit", label: "Edit" },
          ].map((m) => (
            <button
              key={m.key}
              className={subMode === m.key ? "v6-active" : ""}
              onClick={() => setSubMode(m.key)}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Duration (generate only) ── */}
      {subMode === "generate" && (
        <div className="v6-field">
          <span className="v6-field-label">
            Duration <span className="v6-muted">{duration}s</span>
          </span>
          <div className="v6-chip-row">
            {DURATIONS.map((d) => (
              <button
                key={d}
                className={`v6-chip ${duration === d ? "v6-active" : ""}`}
                onClick={() => setDuration(d)}
              >
                {d}s
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Aspect ratio ── */}
      <div className="v6-field">
        <span className="v6-field-label">
          Aspect Ratio <span className="v6-muted">{aspectRatio}</span>
        </span>
        <div className="v6-chip-row">
          {ASPECTS.map((a) => (
            <button
              key={a}
              className={`v6-chip ${aspectRatio === a ? "v6-active" : ""}`}
              onClick={() => setAspectRatio(a)}
            >
              {a}
            </button>
          ))}
        </div>
      </div>

      {/* ── Request ID (edit only) ── */}
      {subMode === "edit" && (
        <div className="v6-field">
          <span className="v6-field-label">Request ID</span>
          <input
            type="text"
            className="v6-input"
            value={requestId}
            onChange={(e) => setRequestId(e.target.value)}
            placeholder="req_xxx from previous generation"
          />
          <span className="v6-muted v6-tiny">Paste the request ID from a previous motion generation to refine it.</span>
        </div>
      )}

      {/* ── Suggestions (generate only) ── */}
      {subMode === "generate" && (
        <div className="v6-field">
          <span className="v6-field-label">Suggestions</span>
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              className="v6-chip v6-chip-suggestion"
              onClick={() => setPrompt(s)}
              style={{ justifyContent: "flex-start", textAlign: "left", width: "100%" }}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  /* ── Center: StageArea ── */
  const stageArea = (
    <StageArea
      generating={generating}
      progress={elapsed > 0 ? Math.min((elapsed % 30) * 3.3, 99) : null}
      stage={genStage}
      model="Motion Graphics"
      result={result}
      resultTitle="Motion generation"
      toolLabel="Motion Studio"
      toolDesc="Generate or edit motion graphics, animated backgrounds, and visual loops."
      toolIcon={<IconFilm />}
      onNew={handleNew}
      onDownload={handleDownload}
    />
  );

  /* ── Bottom: PromptDock ── */
  const currentPrompt = subMode === "edit" ? editPrompt : prompt;
  const currentSetPrompt = subMode === "edit" ? setEditPrompt : setPrompt;

  const promptDock = (
    <PromptDock
      value={currentPrompt}
      onChange={currentSetPrompt}
      onSubmit={handleGenerate}
      cost={cost}
      generating={generating}
      stage={genStage}
    />
  );

  /* ── Inspector sidebar ── */
  const inspector = (
    <>
      {/* Mode summary */}
      <div className="v6-quote">
        <div className="v6-quote-row">
          <span className="v6-muted">Mode</span>
          <strong>{subMode === "generate" ? "Generate" : "Edit"}</strong>
        </div>
        <div className="v6-quote-row">
          <span className="v6-muted">Settings</span>
          <strong>
            {aspectRatio}
            {subMode === "generate" ? ` · ${duration}s` : ""}
          </strong>
        </div>
        {subMode === "edit" && requestId && (
          <div className="v6-quote-row">
            <span className="v6-muted">Request ID</span>
            <strong className="v6-mono v6-tiny">{requestId}</strong>
          </div>
        )}
      </div>

      <div className="v6-section-rule" style={{ margin: "14px 0" }} />

      {/* Cost & credits */}
      <div className="v6-quote">
        <div className="v6-quote-row">
          <span className="v6-muted">Estimated Cost</span>
          <strong>
            <IconBolt /> {cost || "—"} credits
          </strong>
        </div>
        <div className="v6-quote-row">
          <span className="v6-muted">Balance</span>
          <strong className={balance != null ? "v6-balance" : ""}>
            {balance ?? "—"}
          </strong>
        </div>
        {shortfall > 0 && (
          <div className="v6-quote-row">
            <span style={{ fontSize: 10, color: "var(--v6-bad)" }}>
              Need {shortfall} more
            </span>
          </div>
        )}
      </div>

      {/* Provider status */}
      <div className="v6-quote" style={{ marginTop: 10 }}>
        <div className="v6-quote-row">
          <span className="v6-muted">Provider</span>
          <strong>Motion Graphics</strong>
        </div>
        <div className="v6-quote-row">
          <span className="v6-muted">Status</span>
          <span className="v6-status">Available</span>
        </div>
        <div className="v6-quote-row">
          <span className="v6-muted">Elapsed</span>
          <strong>
            <IconClock /> {generating ? `${elapsed}s` : "—"}
          </strong>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="v6-quote" style={{ marginTop: 10, borderColor: "var(--v6-bad)" }}>
          <div className="v6-quote-row">
            <span style={{ fontSize: 10, color: "var(--v6-bad)" }}>{error}</span>
            <button className="v6-btn v6-sm v6-primary" onClick={handleNew}>
              <IconRefresh /> Retry
            </button>
          </div>
        </div>
      )}
    </>
  );

  return (
    <StudioLayout controls={controls} inspector={inspector}>
      {stageArea}
      {!generating && (
        <div style={{ padding: "0 20px 20px" }}>
          {promptDock}
        </div>
      )}
    </StudioLayout>
  );
}
