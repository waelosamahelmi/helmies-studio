"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import StudioLayout from "./v6/StudioLayout";
import ModelSelector from "./v6/ModelSelector";
import PromptDock from "./v6/PromptDock";
import StageArea from "./v6/StageArea";
import { VIDEO_MODELS, I2V_MODELS, V2V_MODELS } from "@/lib/models";
import { useAsyncGeneration } from "./useAsyncGeneration";
import { useCreditCost } from "./useCreditCost";
import { apiFetch } from "@/lib/client-fetch";

/* ── Inline SVGs ── */
const IconFilm = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
    <path d="M7 2v20M17 2v20M2 12h20M2 7h5M2 17h5M17 17h5M17 7h5" />
  </svg>
);

const IconImage = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21 15 16 10 5 21" />
  </svg>
);

const IconVideo = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="23 7 16 12 23 17 23 7" />
    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
  </svg>
);

const IconChevronDown = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9" />
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

const IconTrash = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3,6 5,6 21,6" />
    <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
  </svg>
);

/* ── Helpers ── */
function getModelsForMode(mode) {
  switch (mode) {
    case "ttv":
      return VIDEO_MODELS.filter((m) => !m.isExtend);
    case "i2v":
      return I2V_MODELS.map((m) => ({ ...m, maxImages: m.maxImages ?? 1 }));
    case "v2v":
      return V2V_MODELS.map((m) => ({ ...m, maxImages: m.maxImages ?? 1 }));
    default:
      return [];
  }
}

/* ══════════════════════════════════════════════════════════════ */
export default function VideoStudio() {
  /* ── Mode & model ── */
  const [mode, setMode] = useState("ttv");
  const filteredModels = getModelsForMode(mode);
  const [selectedModelId, setSelectedModelId] = useState(filteredModels[0]?.id || "");

  /* ── Params ── */
  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState(5);
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [resolution, setResolution] = useState("720p");
  const [cameraMotion, setCameraMotion] = useState("static");

  /* ── References ── */
  const [referenceImage, setReferenceImage] = useState(null); // { url, name, uploading }
  const [referenceVideo, setReferenceVideo] = useState(null); // { url, name, uploading }
  const [startFrame, setStartFrame] = useState(null); // { url, name, uploading }
  const [endFrame, setEndFrame] = useState(null); // { url, name, uploading }
  const [uploadError, setUploadError] = useState("");

  /* ── Generation ── */
  const [genStage, setGenStage] = useState("");
  const { loading: generating, result, error, elapsed, submit } = useAsyncGeneration();

  /* ── Current model ── */
  const currentModel = filteredModels.find((m) => m.id === selectedModelId) || filteredModels[0] || {};

  /* ── Derived options from current model ── */
  const durations = currentModel.durations?.length ? currentModel.durations : [3, 5, 10, 15];
  const aspects = currentModel.aspectRatios?.length ? currentModel.aspectRatios : ["16:9", "9:16", "1:1"];
  const resolutions = currentModel.resolutions?.length ? currentModel.resolutions : ["720p"];

  /* ── Credit cost ── */
  const { cost: estCredits, affordable, balance, shortfall } = useCreditCost("video", selectedModelId, {
    duration,
    resolution,
    aspect_ratio: aspectRatio,
  });
  const credits = estCredits || 0;

  /* ── Sync state when model list changes ── */
  useEffect(() => {
    if (filteredModels.length && !filteredModels.some((m) => m.id === selectedModelId)) {
      setSelectedModelId(filteredModels[0].id);
    }
  }, [mode]);

  useEffect(() => {
    if (durations.length && !durations.map(Number).includes(Number(duration))) {
      setDuration(Number(durations[0]));
    }
  }, [selectedModelId]);

  useEffect(() => {
    if (resolutions.length && !resolutions.some((v) => String(v).toLowerCase() === String(resolution).toLowerCase())) {
      setResolution(resolutions[0]);
    }
  }, [selectedModelId]);

  /* ── Upload helpers ── */
  const uploadFile = useCallback(async (file, setter) => {
    const localId = `upload-${Date.now()}`;
    setter({ id: localId, url: URL.createObjectURL(file), name: file.name, uploading: true });
    const body = new FormData();
    body.append("file", file);
    try {
      const res = await apiFetch("/api/upload", { method: "POST", body });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || "Upload failed");
      setter((prev) => ({ ...prev, url: data.url, uploading: false }));
    } catch (err) {
      setUploadError(err.message);
      setter(null);
    }
  }, []);

  const handleUpload = useCallback(
    (file) => {
      if (!file) return;
      setUploadError("");
      if (mode === "i2v") uploadFile(file, setReferenceImage);
      else if (mode === "v2v") uploadFile(file, setReferenceVideo);
    },
    [mode, uploadFile],
  );

  const handleStartFrameUpload = useCallback(
    (file) => { if (file) uploadFile(file, setStartFrame); },
    [uploadFile],
  );

  const handleEndFrameUpload = useCallback(
    (file) => { if (file) uploadFile(file, setEndFrame); },
    [uploadFile],
  );

  /* ── File input refs ── */
  const fileInputRef = useRef(null);
  const startFrameInputRef = useRef(null);
  const endFrameInputRef = useRef(null);

  const handlePromptUpload = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  /* ── Generate ── */
  const handleGenerate = useCallback(() => {
    if (!prompt.trim() || !affordable) return;
    setGenStage("preparing");

    const params = {
      prompt,
      duration,
      resolution,
      aspect_ratio: aspectRatio,
      camera_motion: cameraMotion === "static" ? undefined : cameraMotion,
    };

    if (mode === "i2v" && referenceImage?.url && !referenceImage.uploading) {
      params.image_url = referenceImage.url;
    }
    if (mode === "v2v") {
      if (referenceVideo?.url && !referenceVideo.uploading) {
        params.video_url = referenceVideo.url;
      }
      if (startFrame?.url && !startFrame.uploading) {
        params.first_frame_url = startFrame.url;
      }
      if (endFrame?.url && !endFrame.uploading) {
        params.last_frame_url = endFrame.url;
      }
    }

    submit("video", currentModel.endpoint || selectedModelId, params);
  }, [
    prompt, affordable, duration, resolution, aspectRatio, cameraMotion,
    mode, referenceImage, referenceVideo, startFrame, endFrame,
    currentModel, selectedModelId, submit,
  ]);

  /* ── Actions ── */
  const handleNew = useCallback(() => {
    setPrompt("");
    setReferenceImage(null);
    setReferenceVideo(null);
    setStartFrame(null);
    setEndFrame(null);
    setUploadError("");
    setGenStage("");
    setDuration(5);
    setAspectRatio("16:9");
    setCameraMotion("static");
    window.location.reload();
  }, []);

  const handleDownload = useCallback(() => {
    if (result?.url) window.open(result.url, "_blank");
  }, [result]);

  /* ── Controls sidebar ── */
  const controls = (
    <div className="v6-control-stack">
      {/* ── Mode selector ── */}
      <div className="v6-field">
        <span className="v6-field-label">Generation Mode</span>
        <div className="v6-segmented">
          {[
            { key: "ttv", label: "Text to Video" },
            { key: "i2v", label: "Image to Video" },
            { key: "v2v", label: "Video to Video" },
          ].map((m) => (
            <button
              key={m.key}
              className={mode === m.key ? "v6-active" : ""}
              onClick={() => setMode(m.key)}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Duration ── */}
      <div className="v6-field">
        <span className="v6-field-label">
          Duration <span className="v6-muted">{duration}s</span>
        </span>
        <div className="v6-chip-row">
          {durations.map((d) => (
            <button
              key={d}
              className={`v6-chip ${Number(duration) === Number(d) ? "v6-active" : ""}`}
              onClick={() => setDuration(Number(d))}
            >
              {d}s
            </button>
          ))}
        </div>
      </div>

      {/* ── Aspect ratio ── */}
      <div className="v6-field">
        <span className="v6-field-label">
          Aspect Ratio <span className="v6-muted">{aspectRatio}</span>
        </span>
        <div className="v6-chip-row">
          {aspects.map((a) => (
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

      {/* ── Resolution ── */}
      <div className="v6-field">
        <span className="v6-field-label">Resolution</span>
        <div className="v6-chip-row">
          {resolutions.map((r) => (
            <button
              key={r}
              className={`v6-chip ${String(resolution).toLowerCase() === String(r).toLowerCase() ? "v6-active" : ""}`}
              onClick={() => setResolution(r)}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* ── Camera motion ── */}
      <div className="v6-field">
        <span className="v6-field-label">Camera Motion</span>
        <div className="v6-select-wrap">
          <select
            className="v6-select"
            value={cameraMotion}
            onChange={(e) => setCameraMotion(e.target.value)}
          >
            <option value="static">Static</option>
            <option value="pan">Pan</option>
            <option value="zoom">Zoom</option>
            <option value="tracking">Tracking</option>
          </select>
          <IconChevronDown />
        </div>
      </div>

      {/* ── Reference uploads ── */}
      {mode === "i2v" && (
        <div className="v6-field">
          <span className="v6-field-label">Reference Image</span>
          {referenceImage ? (
            <div className="v6-upload-preview">
              <div className="v6-upload-preview-item">
                <img src={referenceImage.url} alt="Reference" />
                {!referenceImage.uploading && (
                  <button onClick={() => setReferenceImage(null)}>
                    <IconTrash />
                  </button>
                )}
                {referenceImage.uploading && (
                  <span className="v6-muted v6-tiny">Uploading…</span>
                )}
              </div>
            </div>
          ) : (
            <button
              className="v6-drop"
              onClick={() => fileInputRef.current?.click()}
            >
              <IconImage /> Drop or click to upload image
            </button>
          )}
        </div>
      )}

      {mode === "v2v" && (
        <>
          <div className="v6-field">
            <span className="v6-field-label">Reference Video</span>
            {referenceVideo ? (
              <div className="v6-upload-preview">
                <div className="v6-upload-preview-item">
                  {referenceVideo.name}
                  {!referenceVideo.uploading && (
                    <button onClick={() => setReferenceVideo(null)}>
                      <IconTrash />
                    </button>
                  )}
                  {referenceVideo.uploading && (
                    <span className="v6-muted v6-tiny">Uploading…</span>
                  )}
                </div>
              </div>
            ) : (
              <button
                className="v6-drop"
                onClick={() => fileInputRef.current?.click()}
              >
                <IconVideo /> Drop or click to upload video
              </button>
            )}
          </div>

          {currentModel.hasStartEndFrame && (
            <>
              <div className="v6-field">
                <span className="v6-field-label">Start Frame</span>
                {startFrame ? (
                  <div className="v6-upload-preview">
                    <div className="v6-upload-preview-item">
                      <img src={startFrame.url} alt="Start frame" />
                      {!startFrame.uploading && (
                        <button onClick={() => setStartFrame(null)}>
                          <IconTrash />
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <button
                    className="v6-drop"
                    onClick={() => startFrameInputRef.current?.click()}
                  >
                    <IconImage /> Upload start frame
                  </button>
                )}
              </div>
              <div className="v6-field">
                <span className="v6-field-label">End Frame</span>
                {endFrame ? (
                  <div className="v6-upload-preview">
                    <div className="v6-upload-preview-item">
                      <img src={endFrame.url} alt="End frame" />
                      {!endFrame.uploading && (
                        <button onClick={() => setEndFrame(null)}>
                          <IconTrash />
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <button
                    className="v6-drop"
                    onClick={() => endFrameInputRef.current?.click()}
                  >
                    <IconImage /> Upload end frame
                  </button>
                )}
              </div>
            </>
          )}
        </>
      )}

      {/* ── Hidden file inputs ── */}
      <input
        ref={fileInputRef}
        type="file"
        hidden
        accept={mode === "i2v" ? "image/*" : "video/*"}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleUpload(f);
          e.target.value = "";
        }}
      />
      <input
        ref={startFrameInputRef}
        type="file"
        hidden
        accept="image/*"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleStartFrameUpload(f);
          e.target.value = "";
        }}
      />
      <input
        ref={endFrameInputRef}
        type="file"
        hidden
        accept="image/*"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleEndFrameUpload(f);
          e.target.value = "";
        }}
      />

      {/* ── Upload error ── */}
      {uploadError && (
        <div className="v6-field">
          <span style={{ fontSize: 10, color: "var(--v6-bad)" }}>{uploadError}</span>
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
      model={currentModel.name || selectedModelId}
      result={result}
      resultTitle="Video generation"
      toolLabel="Video Studio"
      toolDesc="Direct motion from text or frames with duration-aware pricing and model-aware controls."
      toolIcon={<IconFilm />}
      onNew={handleNew}
      onDownload={handleDownload}
    />
  );

  /* ── Bottom: PromptDock ── */
  const promptDock = (
    <PromptDock
      value={prompt}
      onChange={setPrompt}
      onSubmit={handleGenerate}
      onUpload={mode !== "ttv" ? handlePromptUpload : undefined}
      cost={credits}
      generating={generating}
      stage={genStage}
    />
  );

  /* ── Inspector sidebar ── */
  const inspector = (
    <>
      {/* Model selector */}
      <ModelSelector
        models={filteredModels}
        selectedModelId={selectedModelId}
        onSelect={setSelectedModelId}
        label="Video Model"
        filterMode={mode}
      />

      <div className="v6-section-rule" style={{ margin: "14px 0" }} />

      {/* Cost quote */}
      <div className="v6-quote">
        <div className="v6-quote-row">
          <span className="v6-muted">Estimated Cost</span>
          <strong>
            <IconBolt /> {credits || "—"}
          </strong>
        </div>
        <div className="v6-quote-row">
          <span className="v6-muted">Pricing</span>
          <strong>{currentModel.pricingBasis || "Per second"}</strong>
        </div>
        <div className="v6-quote-row">
          <span className="v6-muted">Mode</span>
          <strong>{mode.toUpperCase()}</strong>
        </div>
        <div className="v6-quote-row">
          <span className="v6-muted">Balance</span>
          <strong className={balance != null ? "v6-balance" : ""}>
            {balance ?? "—"}
          </strong>
        </div>
      </div>

      {/* Provider info */}
      <div className="v6-quote" style={{ marginTop: 10 }}>
        <div className="v6-quote-row">
          <span className="v6-muted">Provider</span>
          <strong>{currentModel.provider || "—"}</strong>
        </div>
        <div className="v6-quote-row">
          <span className="v6-muted">Speed</span>
          <strong>
            <IconClock /> {currentModel.speedTier || "standard"}
          </strong>
        </div>
      </div>

      {/* Insufficient credits warning */}
      {!affordable && credits > 0 && (
        <div className="v6-quote" style={{ marginTop: 10, borderColor: "var(--v6-bad)" }}>
          <div className="v6-quote-row">
            <span className="v6-muted" style={{ color: "var(--v6-bad)" }}>
              {shortfall} more credits required
            </span>
            <Link href="/pricing" className="v6-btn v6-sm">
              Top Up
            </Link>
          </div>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="v6-quote" style={{ marginTop: 10, borderColor: "var(--v6-bad)" }}>
          <div className="v6-quote-row">
            <span style={{ fontSize: 10, color: "var(--v6-bad)" }}>{error}</span>
            <button className="v6-btn v6-sm" onClick={handleNew}>
              <IconRefresh /> Retry
            </button>
          </div>
        </div>
      )}
    </>
  );

  /* ── Layout ── */
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
