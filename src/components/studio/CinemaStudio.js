"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { StudioLayout, ModelSelector, PromptDock, StageArea } from "@/components/studio/v6";
import { CINEMA_CAMERAS, CINEMA_LENS, CINEMA_FOCAL, CINEMA_APERTURE } from "@/lib/models";
import { useAsyncGeneration } from "./useAsyncGeneration";
import { useCreditCost } from "./useCreditCost";
import { useModelCatalog } from "./useModelCatalog";
import { useIsMobile } from "@/lib/use-media-query";
import { MobileModelCarousel, MobileChipScroller } from "@/components/studio/mobile";

/* ── Inline SVGs ── */
const IconCamera = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" /><circle cx="12" cy="13" r="4" />
  </svg>
);
const IconBolt = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="13,2 3,14 12,14 11,22 21,10 12,10" />
  </svg>
);
const IconLens = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
  </svg>
);
const IconAperture = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><line x1="14.31" y1="8" x2="20.05" y2="17.94" /><line x1="9.69" y1="8" x2="21.17" y2="8" /><line x1="7.38" y1="12" x2="13.12" y2="2.06" /><line x1="9.69" y1="16" x2="3.95" y2="6.06" /><line x1="14.31" y1="16" x2="2.83" y2="16" /><line x1="16.62" y1="12" x2="10.88" y2="21.94" />
  </svg>
);
const IconCheck = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20,6 9,17 4,12" />
  </svg>
);

const ASPECTS = ["1:1", "16:9", "9:16", "4:3", "3:4", "21:9", "2:3", "3:2"];

const CINEMA_SUGGESTIONS = [
  "A lone figure in the rain, neon reflections on wet pavement, anamorphic lens flare",
  "Close-up of an eye, shallow depth of field, golden light catching the iris",
  "A desert highway at dusk, heat shimmer, wide vista, cinematic color grade",
  "Interrogation room, single overhead light, moody chiaroscuro, film noir",
  "A forest clearing at dawn, fog rolling through trees, ethereal light rays",
];

/* ── Camera preview gradients ── */
const CAMERA_PREVIEWS = {
  arri_alexa: "linear-gradient(135deg, #1a1a2e, #16213e, #0f3460)",
  red_komodo: "linear-gradient(135deg, #2d1b69, #e94560, #0f3460)",
  sony_fx9: "linear-gradient(135deg, #1b1b2f, #2c3e50, #3498db)",
  blackmagic: "linear-gradient(135deg, #261c2c, #3e2c41, #ff6b6b)",
  canon_c500: "linear-gradient(135deg, #1a1a2e, #2d3436, #e17055)",
  panasonic_eva1: "linear-gradient(135deg, #2d3436, #636e72, #00b894)",
  imax: "linear-gradient(135deg, #0c0c1d, #1a1a3e, #4a69bd)",
  dslr: "linear-gradient(135deg, #2d3436, #636e72, #b2bec3)",
};

/* ══════════════════════════════════════════════════════════════ */
export default function CinemaStudio() {
  const { models: imageModels } = useModelCatalog({ modelType: "image", capability: "text-to-image" });
  const isMobile = useIsMobile();

  const [selectedModelId, setSelectedModelId] = useState("");
  const [camera, setCamera] = useState(CINEMA_CAMERAS[0]?.id || "");
  const [lens, setLens] = useState(CINEMA_LENS[0]?.id || "");
  const [focal, setFocal] = useState(CINEMA_FOCAL[3]?.id || "");
  const [aperture, setAperture] = useState(CINEMA_APERTURE[0]?.id || "");
  const [aspect, setAspect] = useState("21:9");
  const [resolution, setResolution] = useState("1k");
  const [prompt, setPrompt] = useState("");

  const { loading: generating, result, error, elapsed, submit } = useAsyncGeneration();

  const cinemaModels = useMemo(
    () => imageModels.filter((m) => m.hasDimensions || (m.aspectRatios && m.aspectRatios.includes(aspect))),
    [imageModels, aspect]
  );
  const currentModel = cinemaModels.find((m) => m.id === selectedModelId) || cinemaModels[0] || {};

  const { cost, affordable, balance, shortfall } = useCreditCost("image", currentModel?.id || "", { aspect_ratio: aspect, resolution });

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
    return { camera: cam?.prompt, lens: ln?.prompt, focal: fo?.prompt, aperture: ap?.prompt, user: prompt, full: [prompt, cam?.prompt, ln?.prompt, fo?.prompt, ap?.prompt].filter(Boolean).join(", ") };
  }, [prompt, camera, lens, focal, aperture]);

  const handleGenerate = useCallback(() => {
    if (!prompt.trim()) return;
    submit("image", currentModel?.id, { endpoint: currentModel?.endpoint || currentModel?.id, prompt: compiledPrompt.full, aspect_ratio: aspect, resolution });
  }, [prompt, currentModel, aspect, resolution, compiledPrompt, submit]);

  /* ── Focal position (0-100) ── */
  const focalIdx = CINEMA_FOCAL.findIndex(f => f.id === focal);
  const focalPct = CINEMA_FOCAL.length > 1 ? (focalIdx / (CINEMA_FOCAL.length - 1)) * 100 : 50;

  /* ── Controls ── */
  const controls = (
    <div className="v6-control-stack">
      {/* Camera cards */}
      <div className="v6-field">
        <div className="v6-field-label">Camera</div>
        {isMobile ? (
          <MobileChipScroller items={CINEMA_CAMERAS.map(c => ({ label: c.name, value: c.id }))} selectedValue={camera} onSelect={setCamera} />
        ) : (
          <div className="v6-camera-grid">
            {CINEMA_CAMERAS.map((c) => {
              const active = camera === c.id;
              return (
                <div key={c.id} className={`v6-camera-card${active ? " v6-active" : ""}`} onClick={() => setCamera(c.id)}>
                  <div className="v6-camera-card-preview" style={{ background: CAMERA_PREVIEWS[c.id] || "var(--v6-surface2)" }}>
                    <IconCamera style={{ width: 20, height: 20, color: "rgba(255,255,255,0.5)" }} />
                  </div>
                  <div className="v6-camera-card-body">
                    {c.name}
                    <span>{c.sensor || "Digital Cinema"}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Lens with focal bar */}
      <div className="v6-field">
        <div className="v6-field-label">Lens</div>
        {isMobile ? (
          <MobileChipScroller items={CINEMA_LENS.map(l => ({ label: l.name, value: l.id }))} selectedValue={lens} onSelect={setLens} />
        ) : (
          <div className="v6-chip-row" style={{ marginBottom: 8 }}>
            {CINEMA_LENS.map((l) => (
              <button key={l.id} className={`v6-chip${lens === l.id ? " v6-active" : ""}`} onClick={() => setLens(l.id)}>{l.name}</button>
            ))}
          </div>
        )}
        <div className="v6-focal-bar-wrap">
          <span className="v6-tiny" style={{ color: "var(--v6-accent)" }}>wide</span>
          <div className="v6-focal-bar">
            <div className="v6-focal-dot" style={{ left: `${focalPct}%` }} />
          </div>
          <span className="v6-tiny" style={{ color: "var(--v6-good)" }}>tele</span>
        </div>
      </div>

      {/* Focal length */}
      <div className="v6-field">
        <div className="v6-field-label">Focal Length</div>
        {isMobile ? (
          <MobileChipScroller items={CINEMA_FOCAL.map(f => ({ label: f.name, value: f.id }))} selectedValue={focal} onSelect={setFocal} />
        ) : (
          <div className="v6-chip-row">
            {CINEMA_FOCAL.map((f, i) => (
              <button key={f.id} className={`v6-chip${focal === f.id ? " v6-active" : ""}`} onClick={() => setFocal(f.id)}>{f.name}</button>
            ))}
          </div>
        )}
      </div>

      {/* Aperture */}
      <div className="v6-field">
        <div className="v6-field-label">Aperture</div>
        {isMobile ? (
          <MobileChipScroller items={CINEMA_APERTURE.map(a => ({ label: a.name, value: a.id }))} selectedValue={aperture} onSelect={setAperture} />
        ) : (
          <div className="v6-chip-row">
            {CINEMA_APERTURE.map((a) => (
              <button key={a.id} className={`v6-chip${aperture === a.id ? " v6-active" : ""}`} onClick={() => setAperture(a.id)}>{a.name}</button>
            ))}
          </div>
        )}
      </div>

      {/* Aspect ratio */}
      <div className="v6-field">
        <div className="v6-field-label">Aspect Ratio</div>
        {isMobile ? (
          <MobileChipScroller items={ASPECTS.map(ar => ({ label: ar, value: ar }))} selectedValue={aspect} onSelect={setAspect} />
        ) : (
          <div className="v6-chip-row">
            {ASPECTS.map((ar) => (
              <button key={ar} className={`v6-chip${aspect === ar ? " v6-active" : ""}`} onClick={() => setAspect(ar)}>{ar}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  /* ── Center ── */
  const center = (
    <>
      {!generating && !result ? (
        <div className="v6-stage">
          <div className="v6-stage-grid" />
          <div className="v6-empty-state v6-entrance-scale" style={{ maxWidth: 520 }}>
            <div className="v6-empty-orbit"><IconCamera /></div>
            <h2>Cinema Studio</h2>
            <p>Cinematic image generation with precise camera, lens, focal, and aperture control.</p>
            <div className="v6-prompt-suggestions">
              {CINEMA_SUGGESTIONS.map((s) => (
                <button key={s} className="v6-prompt-suggestion" onClick={() => setPrompt(s)}>{s.length > 70 ? s.slice(0, 70) + "\u2026" : s}</button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <StageArea generating={generating} progress={null} stage={generating ? "generating" : undefined}
          model={currentModel?.name || currentModel?.id} quality={resolution} ratio={aspect}
          result={result} resultTitle="Cinema generation" toolLabel="Cinema Studio"
          toolDesc="Cinematic image generation with precise camera, lens, focal, and aperture control."
          toolIcon={<IconCamera />} onNew={() => setPrompt("")}
          onDownload={() => { if (result?.url) window.open(result.url, "_blank"); }} />
      )}
      <PromptDock value={prompt} onChange={setPrompt} onSubmit={generating ? undefined : handleGenerate} cost={cost}
        generating={generating} stage={generating ? "generating" : undefined} icon="spark" />
    </>
  );

  /* ── Inspector ── */
  const inspector = (
    <div className="v6-control-stack">
      {isMobile ? (
        <MobileModelCarousel models={cinemaModels.map((m) => ({ ...m, displayName: m.displayName || m.name }))} selectedModelId={selectedModelId} onSelect={(id) => setSelectedModelId(id)} />
      ) : (
        <ModelSelector models={cinemaModels.map((m) => ({ ...m, displayName: m.displayName || m.name }))} selectedModelId={selectedModelId} onSelect={(id) => setSelectedModelId(id)} label="Choose cinema model" />
      )}
      <div className="v6-section-rule" />

      {/* Cost quote */}
      <div className="v6-quote">
        <div className="v6-quote-row"><span className="v6-muted">Estimated cost</span><strong><IconBolt /> {cost || "\u2014"}</strong></div>
        <div className="v6-quote-row"><span className="v6-muted">Balance</span><strong className="v6-balance">{balance ?? "\u2014"}</strong></div>
        <div className="v6-quote-row"><span className="v6-muted">Model</span><strong>{currentModel?.name || "\u2014"}</strong></div>
      </div>
      {!affordable && cost > 0 && <div style={{ fontSize: 11, color: "var(--v6-warn)", lineHeight: 1.4 }}><strong>{shortfall} more credits required</strong></div>}
      <div className="v6-section-rule" />

      {/* Visual Kit Summary */}
      <div className="v6-eyebrow">Camera Kit</div>
      <div className="v6-kit-summary" style={{ marginTop: 8 }}>
        <div className="v6-kit-card">
          <span className="v6-kit-label">Camera</span>
          <span className="v6-kit-value">{CINEMA_CAMERAS.find((c) => c.id === camera)?.name || "\u2014"}</span>
        </div>
        <div className="v6-kit-card">
          <span className="v6-kit-label">Lens</span>
          <span className="v6-kit-value">{CINEMA_LENS.find((l) => l.id === lens)?.name || "\u2014"}</span>
        </div>
        <div className="v6-kit-card">
          <span className="v6-kit-label">Focal</span>
          <span className="v6-kit-value">{CINEMA_FOCAL.find((f) => f.id === focal)?.name || "\u2014"}</span>
        </div>
        <div className="v6-kit-card">
          <span className="v6-kit-label">Aperture</span>
          <span className="v6-kit-value">{CINEMA_APERTURE.find((a) => a.id === aperture)?.name || "\u2014"}</span>
        </div>
      </div>
      <div className="v6-section-rule" style={{ marginTop: 12 }} />

      {/* Compiled prompt with syntax highlighting */}
      <div className="v6-eyebrow">Compiled Prompt</div>
      <div className="v6-quote" style={{ marginTop: 8, padding: 10 }}>
        <div className="v6-prompt-syntax">
          {compiledPrompt.camera && <><span className="v6-syn-camera">{compiledPrompt.camera}</span>, </>}
          {compiledPrompt.lens && <><span className="v6-syn-lens">{compiledPrompt.lens}</span>, </>}
          {compiledPrompt.focal && <><span className="v6-syn-focal">{compiledPrompt.focal}</span>, </>}
          {compiledPrompt.aperture && <><span className="v6-syn-aperture">{compiledPrompt.aperture}</span>, </>}
          {prompt && <span className="v6-syn-prompt">{prompt}</span>}
          {!prompt && !compiledPrompt.camera && <span className="v6-syn-dim">Configure your cinema kit to build the prompt\u2026</span>}
        </div>
      </div>
    </div>
  );

  return <StudioLayout controls={controls} inspector={inspector} inspectorVisible>{center}</StudioLayout>;
}
