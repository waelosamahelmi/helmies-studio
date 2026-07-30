"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { StudioLayout, ModelSelector, PromptDock, StageArea } from "@/components/studio/v6";
import { IMAGE_MODELS, CINEMA_CAMERAS, CINEMA_LENS, CINEMA_FOCAL, CINEMA_APERTURE } from "@/lib/models";
import { useAsyncGeneration } from "./useAsyncGeneration";
import { useCreditCost } from "./useCreditCost";

/* ── Inline SVGs ── */
const IconCamera = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
);

const IconBolt = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="13,2 3,14 12,14 11,22 21,10 12,10" />
  </svg>
);

const IconAperture = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="14.31" y1="8" x2="20.05" y2="17.94" />
    <line x1="9.69" y1="8" x2="21.17" y2="8" />
    <line x1="7.38" y1="12" x2="13.12" y2="2.06" />
    <line x1="9.69" y1="16" x2="3.95" y2="6.06" />
    <line x1="14.31" y1="16" x2="2.83" y2="16" />
    <line x1="16.62" y1="12" x2="10.88" y2="21.94" />
  </svg>
);

const IconLens = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
  </svg>
);

/* ── ASPECT presets ── */
const ASPECTS = ["1:1", "16:9", "9:16", "4:3", "3:4", "21:9", "2:3", "3:2"];

/* ── Prompt suggestions ── */
const CINEMA_SUGGESTIONS = [
  "A lone figure in the rain, neon reflections on wet pavement",
  "Close-up of an eye, anamorphic lens flare",
  "A desert highway at dusk, heat shimmer, wide vista",
];

/* ══════════════════════════════════════════════════════════════ */
export default function CinemaStudio() {
  /* ── State ── */
  const [selectedModelId, setSelectedModelId] = useState(IMAGE_MODELS[0]?.id || "");
  const [camera, setCamera] = useState(CINEMA_CAMERAS[0].id);
  const [lens, setLens] = useState(CINEMA_LENS[0].id);
  const [focal, setFocal] = useState(CINEMA_FOCAL[3].id); // 35mm default
  const [aperture, setAperture] = useState(CINEMA_APERTURE[0].id); // f/1.4 default
  const [aspect, setAspect] = useState("21:9");
  const [resolution, setResolution] = useState("1k");
  const [prompt, setPrompt] = useState("");

  /* ── Hooks ── */
  const { loading: generating, result, error, elapsed, submit } = useAsyncGeneration();

  /* ── Model filtering ── */
  const cinemaModels = useMemo(
    () => IMAGE_MODELS.filter((m) => m.hasDimensions || (m.aspectRatios && m.aspectRatios.includes(aspect))),
    [aspect]
  );
  const currentModel = cinemaModels.find((m) => m.id === selectedModelId) || cinemaModels[0] || IMAGE_MODELS[0];

  /* ── Credit cost ── */
  const { cost, affordable, balance, shortfall } = useCreditCost(
    "image",
    currentModel?.id || "",
    { aspect_ratio: aspect, resolution }
  );

  /* ── Sync model when aspect changes filters the set ── */
  useEffect(() => {
    if (cinemaModels.length && !cinemaModels.some((m) => m.id === selectedModelId)) {
      setSelectedModelId(cinemaModels[0].id);
    }
  }, [aspect, cinemaModels, selectedModelId]);

  /* ── Compiled prompt ── */
  const compiledPrompt = useMemo(() => {
    const cam = CINEMA_CAMERAS.find((c) => c.id === camera);
    const ln = CINEMA_LENS.find((l) => l.id === lens);
    const fo = CINEMA_FOCAL.find((f) => f.id === focal);
    const ap = CINEMA_APERTURE.find((a) => a.id === aperture);
    return [prompt, cam?.prompt, ln?.prompt, fo?.prompt, ap?.prompt].filter(Boolean).join(", ");
  }, [prompt, camera, lens, focal, aperture]);

  /* ── Handlers ── */
  const handleGenerate = useCallback(() => {
    if (!prompt.trim()) return;
    submit("image", currentModel?.id, {
      endpoint: currentModel?.endpoint || currentModel?.id,
      prompt: compiledPrompt,
      aspect_ratio: aspect,
      resolution,
    });
  }, [prompt, currentModel, aspect, resolution, compiledPrompt, submit]);

  /* ── Controls ── */
  const controls = (
    <div className="v6-control-stack">
      {/* Camera */}
      <div className="v6-field">
        <div className="v6-field-label">Camera</div>
        <div className="v6-select-wrap">
          <select
            className="v6-select"
            value={camera}
            onChange={(e) => setCamera(e.target.value)}
          >
            {CINEMA_CAMERAS.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <IconBolt />
        </div>
      </div>

      {/* Lens */}
      <div className="v6-field">
        <div className="v6-field-label">Lens</div>
        <div className="v6-select-wrap">
          <select
            className="v6-select"
            value={lens}
            onChange={(e) => setLens(e.target.value)}
          >
            {CINEMA_LENS.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
          <IconLens />
        </div>
      </div>

      {/* Focal length */}
      <div className="v6-field">
        <div className="v6-field-label">Focal length</div>
        <div className="v6-chip-row">
          {CINEMA_FOCAL.map((f) => (
            <button
              key={f.id}
              className={`v6-chip${focal === f.id ? " v6-active" : ""}`}
              onClick={() => setFocal(f.id)}
            >
              {f.name}
            </button>
          ))}
        </div>
      </div>

      {/* Aperture */}
      <div className="v6-field">
        <div className="v6-field-label">Aperture</div>
        <div className="v6-chip-row">
          {CINEMA_APERTURE.map((a) => (
            <button
              key={a.id}
              className={`v6-chip${aperture === a.id ? " v6-active" : ""}`}
              onClick={() => setAperture(a.id)}
            >
              {a.name}
            </button>
          ))}
        </div>
      </div>

      {/* Aspect ratio */}
      <div className="v6-field">
        <div className="v6-field-label">Aspect ratio</div>
        <div className="v6-chip-row">
          {ASPECTS.map((ar) => (
            <button
              key={ar}
              className={`v6-chip${aspect === ar ? " v6-active" : ""}`}
              onClick={() => setAspect(ar)}
            >
              {ar}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  /* ── Center stage ── */
  const center = (
    <>
      {!generating && !result ? (
        <div className="v6-stage">
          <div className="v6-stage-grid" />
          <div className="v6-empty-state" style={{ maxWidth: 480 }}>
            <div className="v6-empty-orbit">
              <IconCamera />
            </div>
            <h2>Cinema Studio</h2>
            <p>Cinematic image generation with precise camera, lens, focal, and aperture control.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 16, maxWidth: 360, margin: "0 auto" }}>
              {CINEMA_SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  className="v6-chip"
                  style={{ textAlign: "left", fontSize: 11 }}
                  onClick={() => setPrompt(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <StageArea
          generating={generating}
          progress={null}
          stage={generating ? "generating" : undefined}
          model={currentModel?.name || currentModel?.id}
          quality={resolution}
          ratio={aspect}
          result={result}
          resultTitle="Cinema generation"
          toolLabel="Cinema Studio"
          toolDesc="Cinematic image generation with precise camera, lens, focal, and aperture control."
          toolIcon={<IconCamera />}
          onNew={() => setPrompt("")}
          onDownload={() => {
            if (result?.url) window.open(result.url, "_blank");
          }}
        />
      )}
      <PromptDock
        value={prompt}
        onChange={setPrompt}
        onSubmit={generating ? undefined : handleGenerate}
        cost={cost}
        generating={generating}
        stage={generating ? "generating" : undefined}
        icon="spark"
      />
    </>
  );

  /* ── Inspector ── */
  const inspector = (
    <div className="v6-control-stack">
      <ModelSelector
        models={cinemaModels.map((m) => ({
          ...m,
          displayName: m.displayName || m.name,
        }))}
        selectedModelId={selectedModelId}
        onSelect={(id) => setSelectedModelId(id)}
        label="Choose cinema model"
      />
      <div className="v6-section-rule" />
      <div className="v6-quote">
        <div className="v6-quote-row">
          <span className="v6-muted">Estimated cost</span>
          <strong><IconBolt /> {cost || "—"}</strong>
        </div>
        <div className="v6-quote-row">
          <span className="v6-muted">Balance</span>
          <strong className="v6-balance">{balance ?? "—"}</strong>
        </div>
        <div className="v6-quote-row">
          <span className="v6-muted">Model</span>
          <strong>{currentModel?.name || "—"}</strong>
        </div>
      </div>
      {!affordable && cost > 0 && (
        <div style={{ fontSize: 11, color: "var(--v6-warn)", lineHeight: 1.4 }}>
          <strong>{shortfall} more credits required</strong>
        </div>
      )}
      <div className="v6-section-rule" />
      <div className="v6-field">
        <div className="v6-field-label">Camera kit</div>
        <div style={{ fontSize: 12 }}>
          {CINEMA_CAMERAS.find((c) => c.id === camera)?.name}
        </div>
        <div className="v6-muted v6-tiny">
          {CINEMA_LENS.find((l) => l.id === lens)?.name} · {CINEMA_FOCAL.find((f) => f.id === focal)?.name} · {CINEMA_APERTURE.find((a) => a.id === aperture)?.name}
        </div>
      </div>
      <div className="v6-section-rule" />
      <div className="v6-field">
        <div className="v6-field-label">Compiled prompt</div>
        <div className="v6-muted v6-tiny" style={{ lineHeight: 1.5 }}>
          {compiledPrompt || "—"}
        </div>
      </div>
    </div>
  );

  return (
    <StudioLayout controls={controls} inspector={inspector} inspectorVisible>
      {center}
    </StudioLayout>
  );
}
