"use client";

import { useState, useCallback } from "react";
import StudioLayout from "./v6/StudioLayout";
import PromptDock from "./v6/PromptDock";
import StageArea from "./v6/StageArea";
import { IconMegaphone, IconBolt } from "@/components/Icons";
import { MARKETING_AVATARS } from "@/lib/models";
import { useAsyncGeneration } from "./useAsyncGeneration";
import { useCreditCost } from "./useCreditCost";
import { apiFetch } from "@/lib/client-fetch";
import { useModelCatalog } from "@/components/studio/useModelCatalog";

/* ── Platform definitions ── */
const PLATFORMS = [
  { id: "instagram", label: "Instagram", aspect: "9:16" },
  { id: "tiktok", label: "TikTok", aspect: "9:16" },
  { id: "youtube", label: "YouTube", aspect: "16:9" },
  { id: "shorts", label: "Shorts", aspect: "9:16" },
  { id: "x", label: "X", aspect: "16:9" },
];

const DURATIONS = [15, 30, 60];
const RESOLUTIONS = ["1080p", "4K"];

const CAMPAIGN_FORMATS = [
  { id: "product_hero", label: "Product Hero" },
  { id: "ugc_advert", label: "UGC Advert" },
  { id: "social_set", label: "Social Set" },
];

const SUGGESTIONS = [
  "A UGC-style ad for a luxury skincare product, energetic and authentic",
  "Cinematic product reveal with dramatic lighting and slow rotation",
  "Lifestyle ad showing a morning routine with the product",
];

/* ══════════════════════════════════════════════════════════════ */
export default function MarketingStudio() {
  const [platform, setPlatform] = useState("instagram");
  const [duration, setDuration] = useState(15);
  const [resolution, setResolution] = useState("1080p");
  const [selectedAvatar, setSelectedAvatar] = useState(null);
  const [productImages, setProductImages] = useState([]);
  const [prompt, setPrompt] = useState("");
  const [campaignFormat, setCampaignFormat] = useState("ugc_advert");
  const { loading, result, error, elapsed, submit } = useAsyncGeneration();
  const [genStage, setGenStage] = useState("");

  const { models: marketingModels } = useModelCatalog({ modelType: "video" });
  const marketingModelId = marketingModels[0]?.id || "";

  /* ── Derived aspect ── */
  const aspect = PLATFORMS.find((p) => p.id === platform)?.aspect || "9:16";

  /* ── Credit cost estimate ── */
  const { cost, affordable, shortfall } = useCreditCost("marketing", marketingModelId, {
    duration,
    resolution,
  });

  /* ── Avatar toggle ── */
  const handleAvatarSelect = (a) => {
    setSelectedAvatar((prev) => (prev?.id === a.id ? null : a));
  };

  /* ── Product image upload ── */
  const handleProductUpload = async (files) => {
    const newImgs = [];
    for (const file of Array.from(files).slice(0, 4 - productImages.length)) {
      const fd = new FormData();
      fd.append("file", file);
      try {
        const r = await apiFetch("/api/upload", { method: "POST", body: fd });
        const d = await r.json();
        if (d.url) {
          newImgs.push({
            id: `prod_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            url: d.url,
          });
        }
      } catch {
        // silently skip failed uploads
      }
    }
    setProductImages((prev) => [...prev, ...newImgs]);
  };

  /* ── Generate handler ── */
  const handleGenerate = useCallback(() => {
    if (!prompt.trim()) return;
    setGenStage("preparing");
    submit("marketing", marketingModelId, {
      prompt,
      aspect_ratio: aspect,
      duration,
      resolution,
      images_list: [
        ...(selectedAvatar ? [selectedAvatar.url] : []),
        ...productImages.map((p) => p.url),
      ],
    });
  }, [prompt, aspect, duration, resolution, selectedAvatar, productImages, submit]);

  /* ── Download handler ── */
  const handleDownload = useCallback(() => {
    if (result?.url) window.open(result.url, "_blank");
  }, [result]);

  /* ── Reset handler ── */
  const handleReset = useCallback(() => {
    setGenStage("");
  }, [submit]);

  /* ── Controls sidebar ── */
  const controls = (
    <div className="v6-control-stack">
      {/* Platform selector */}
      <div className="v6-field">
        <span className="v6-field-label">Platform</span>
        <div className="v6-chip-row">
          {PLATFORMS.map((p) => (
            <button
              key={p.id}
              className={`v6-chip${platform === p.id ? " v6-active" : ""}`}
              onClick={() => setPlatform(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Duration */}
      <div className="v6-field">
        <span className="v6-field-label">Duration</span>
        <div className="v6-segmented">
          {DURATIONS.map((d) => (
            <button
              key={d}
              className={duration === d ? "v6-active" : ""}
              onClick={() => setDuration(d)}
            >
              {d}s
            </button>
          ))}
        </div>
      </div>

      {/* Resolution */}
      <div className="v6-field">
        <span className="v6-field-label">Resolution</span>
        <div className="v6-segmented">
          {RESOLUTIONS.map((r) => (
            <button
              key={r}
              className={resolution === r ? "v6-active" : ""}
              onClick={() => setResolution(r)}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Avatar grid */}
      <div className="v6-field">
        <span className="v6-field-label">
          Avatar {selectedAvatar ? `· ${selectedAvatar.name}` : ""}
        </span>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 6,
          }}
        >
          {MARKETING_AVATARS.map((a) => {
            const sel = selectedAvatar?.id === a.id;
            return (
              <button
                key={a.id}
                onClick={() => handleAvatarSelect(a)}
                style={{
                  position: "relative",
                  border: sel
                    ? "2px solid var(--v6-accent)"
                    : "2px solid transparent",
                  borderRadius: 8,
                  overflow: "hidden",
                  cursor: "pointer",
                  background: "none",
                  padding: 0,
                }}
              >
                <img
                  src={a.url}
                  alt={a.name}
                  style={{
                    width: "100%",
                    aspectRatio: "1",
                    objectFit: "cover",
                    display: "block",
                  }}
                />
                {sel && (
                  <span
                    style={{
                      position: "absolute",
                      top: 2,
                      right: 2,
                      background: "var(--v6-accent)",
                      color: "#fff",
                      fontSize: 9,
                      borderRadius: 4,
                      padding: "1px 4px",
                    }}
                  >
                    ✓
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Product image upload */}
      <div className="v6-field">
        <span className="v6-field-label">
          Product Images ({productImages.length}/4)
        </span>
        <label
          className="v6-drop"
          style={{ cursor: "pointer" }}
        >
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => {
              handleProductUpload(e.target.files);
              e.target.value = "";
            }}
            style={{ display: "none" }}
          />
          Drop or click to upload product images
        </label>
        {productImages.length > 0 && (
          <div className="v6-upload-preview">
            {productImages.map((p) => (
              <div className="v6-upload-preview-item" key={p.id}>
                <img src={p.url} alt="" />
                <button
                  onClick={() =>
                    setProductImages((prev) => prev.filter((x) => x.id !== p.id))
                  }
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Suggestions */}
      <div className="v6-field">
        <span className="v6-field-label">Try an idea</span>
        <div className="v6-chip-row">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              className="v6-chip"
              onClick={() => setPrompt(s)}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  /* ── Center: StageArea + PromptDock ── */
  const center = (
    <>
      <StageArea
        generating={loading}
        stage={genStage}
        model="Marketing Ad"
        quality={resolution}
        ratio={aspect}
        result={result}
        resultTitle="Marketing Ad"
        toolLabel="Marketing Studio"
        toolDesc="Create UGC-style video ads with avatars, product images, and platform-optimized formats."
        toolIcon={<IconMegaphone />}
        onDownload={handleDownload}
        onNew={handleReset}
      />
      <PromptDock
        value={prompt}
        onChange={setPrompt}
        onSubmit={handleGenerate}
        cost={cost}
        generating={loading}
        stage={genStage}
        icon="bolt"
      />
    </>
  );

  /* ── Inspector sidebar ── */
  const inspector = (
    <>
      {/* Campaign format chips */}
      <div className="v6-field">
        <span className="v6-field-label">Campaign Format</span>
        <div className="v6-chip-row">
          {CAMPAIGN_FORMATS.map((cf) => (
            <button
              key={cf.id}
              className={`v6-chip${campaignFormat === cf.id ? " v6-active" : ""}`}
              onClick={() => setCampaignFormat(cf.id)}
            >
              {cf.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <div className="v6-section-rule" />
      </div>

      {/* Avatar preview */}
      <div style={{ marginTop: 14 }}>
        <div className="v6-eyebrow">Avatar Preview</div>
        {selectedAvatar ? (
          <div
            style={{
              marginTop: 8,
              borderRadius: 12,
              overflow: "hidden",
              border: "1px solid var(--v6-line)",
            }}
          >
            <img
              src={selectedAvatar.url}
              alt={selectedAvatar.name}
              style={{ width: "100%", display: "block" }}
            />
            <div
              style={{
                padding: "8px 10px",
                fontSize: 11,
                fontWeight: 700,
                background: "var(--v6-surface2)",
              }}
            >
              {selectedAvatar.name}
            </div>
          </div>
        ) : (
          <div
            style={{
              marginTop: 8,
              padding: 16,
              border: "1px dashed var(--v6-line)",
              borderRadius: 12,
              textAlign: "center",
              fontSize: 10,
              color: "var(--v6-muted)",
            }}
          >
            Select an avatar above
          </div>
        )}
      </div>

      <div style={{ marginTop: 14 }}>
        <div className="v6-section-rule" />
      </div>

      {/* Cost quote */}
      <div style={{ marginTop: 14 }}>
        <div className="v6-eyebrow">Cost</div>
        <div className="v6-quote" style={{ marginTop: 8 }}>
          <div className="v6-quote-row">
            <span className="v6-muted">Credits</span>
            <strong>
              <IconBolt style={{ width: 12, height: 12 }} /> {cost || "—"}
            </strong>
          </div>
          <div className="v6-quote-row">
            <span className="v6-muted">Platform</span>
            <strong>{PLATFORMS.find((p) => p.id === platform)?.label}</strong>
          </div>
          <div className="v6-quote-row">
            <span className="v6-muted">Format</span>
            <strong>
              {aspect} · {duration}s · {resolution}
            </strong>
          </div>
          <div className="v6-quote-row">
            <span className="v6-muted">Assets</span>
            <strong>
              {selectedAvatar ? "1 avatar" : "0 avatars"} ·{" "}
              {productImages.length} product(s)
            </strong>
          </div>
        </div>
        {shortfall > 0 && (
          <div className="v6-status" style={{ marginTop: 6 }}>
            <span style={{ color: "var(--v6-bad)", fontSize: 10 }}>
              Need {shortfall} more credits
            </span>
          </div>
        )}
      </div>

      <div style={{ marginTop: 14 }}>
        <div className="v6-section-rule" />
      </div>

      {/* Prompt preview */}
      {prompt && (
        <div style={{ marginTop: 14 }}>
          <div className="v6-eyebrow">Prompt</div>
          <div
            style={{
              marginTop: 8,
              padding: 10,
              border: "1px solid var(--v6-line)",
              borderRadius: 12,
              background: "var(--v6-surface2)",
              fontSize: 10,
              lineHeight: 1.55,
              color: "var(--v6-muted)",
              wordBreak: "break-word",
            }}
          >
            {prompt}
          </div>
        </div>
      )}
    </>
  );

  return (
    <StudioLayout controls={controls} inspector={inspector}>
      {center}
    </StudioLayout>
  );
}
