"use client";

import CreationWorkspace, { withUniverseCreation } from "./universe/CreationWorkspace";

import { useState, useCallback, useEffect } from "react";
import {
  WorkspaceShell, ModelSelector, PromptComposer, GenerateButton,
  StagedProgress, ResultCard, EmptyState,
} from "./StudioComponents";
import { IconMegaphone, IconBolt, IconArrowUpRight } from "@/components/Icons";
import { MARKETING_AVATARS } from "@/lib/models";
import { useAsyncGeneration } from "./useAsyncGeneration";
import { useCreditCost } from "./useCreditCost";
import { apiFetch } from "@/lib/client-fetch";

const EASE = [0.32, 0.72, 0, 1];

const PLATFORMS = [
  { id: "instagram", label: "Instagram", aspect: "9:16" },
  { id: "tiktok", label: "TikTok", aspect: "9:16" },
  { id: "youtube", label: "YouTube", aspect: "16:9" },
  { id: "shorts", label: "Shorts", aspect: "9:16" },
  { id: "twitter", label: "X", aspect: "16:9" },
];

const DURATIONS = [5, 10, 15];
const TIPS = [
  "Tip: Select an avatar to feature in your UGC ad.",
  "Tip: Upload product images to ground the ad in your brand.",
  "Tip: Vertical (9:16) works best for Instagram and TikTok.",
];

const SUGGESTIONS = [
  "A UGC-style ad for a luxury skincare product, energetic and authentic",
  "Cinematic product reveal with dramatic lighting and slow rotation",
  "Lifestyle ad showing a morning routine with the product",
];

function MarketingStudioV2() {
  const [mode, setMode] = useState(() => {
    if (typeof window !== "undefined") return localStorage.getItem("helmies.studio.marketing.mode") || "basic";
    return "basic";
  });
  const [prompt, setPrompt] = useState("");
  const [platform, setPlatform] = useState("instagram");
  const [duration, setDuration] = useState(10);
  const [resolution, setResolution] = useState("1080p");
  const [selectedAvatars, setSelectedAvatars] = useState([]);
  const [productImages, setProductImages] = useState([]);
  const { loading, result, error, elapsed, submit } = useAsyncGeneration();
  const [genStage, setGenStage] = useState("");

  useEffect(() => { localStorage.setItem("helmies.studio.marketing.mode", mode); }, [mode]);

  const aspect = PLATFORMS.find((p) => p.id === platform)?.aspect || "9:16";
  const { cost, affordable, shortfall } = useCreditCost("marketing", "default", { duration, resolution });

  const toggleAvatar = (a) => {
    setSelectedAvatars((prev) => {
      const exists = prev.find((x) => x.id === a.id);
      if (exists) return prev.filter((x) => x.id !== a.id);
      if (prev.length >= 4) return prev;
      return [...prev, a];
    });
  };

  const handleProductUpload = async (files) => {
    const newImgs = [];
    for (const file of Array.from(files).slice(0, 4 - productImages.length)) {
      const fd = new FormData(); fd.append("file", file);
      try {
        const r = await apiFetch("/api/upload", { method: "POST", body: fd });
        const d = await r.json();
        if (d.url) newImgs.push({ id: `prod_${Date.now()}_${Math.random()}`, url: d.url });
      } catch {}
    }
    setProductImages((prev) => [...prev, ...newImgs]);
  };

  const handleGenerate = useCallback(() => {
    if (!prompt.trim()) return;
    setGenStage("preparing");
    submit("marketing", "default", {
      prompt,
      aspect_ratio: aspect,
      duration,
      resolution,
      images_list: [...selectedAvatars.map((a) => a.url), ...productImages.map((p) => p.url)],
    });
  }, [prompt, aspect, duration, resolution, selectedAvatars, productImages, submit]);

  const handleAction = (actionId, url) => { if (actionId === "download") window.open(url, "_blank"); };

  const inputs = (
    <>
      <div>
        <label className="studio__label">Platform</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {PLATFORMS.map((p) => (
            <button key={p.id} className={`studio__chip-premium ${platform === p.id ? "studio__chip-premium--active" : ""}`} onClick={() => setPlatform(p.id)} style={{ padding: "4px 8px", fontSize: 11 }}>
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <div style={{ marginTop: 14 }}>
        <label className="studio__label">Duration</label>
        <div style={{ display: "flex", gap: 4 }}>
          {DURATIONS.map((d) => (
            <button key={d} className={`studio__chip-premium ${duration === d ? "studio__chip-premium--active" : ""}`} onClick={() => setDuration(d)} style={{ flex: 1, justifyContent: "center", fontSize: 11 }}>{d}s</button>
          ))}
        </div>
      </div>
      <div style={{ marginTop: 14 }}>
        <label className="studio__label">Resolution</label>
        <div style={{ display: "flex", gap: 4 }}>
          {["720p", "1080p"].map((r) => (
            <button key={r} className={`studio__chip-premium ${resolution === r ? "studio__chip-premium--active" : ""}`} onClick={() => setResolution(r)} style={{ flex: 1, justifyContent: "center", fontSize: 11 }}>{r}</button>
          ))}
        </div>
      </div>
      <div style={{ marginTop: 14 }}>
        <label className="studio__label">Avatars ({selectedAvatars.length}/4)</label>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
          {MARKETING_AVATARS.map((a) => {
            const sel = !!selectedAvatars.find((x) => x.id === a.id);
            return (
              <button key={a.id} onClick={() => toggleAvatar(a)} style={{ position: "relative", border: sel ? "2px solid var(--color-brand)" : "2px solid transparent", borderRadius: 8, overflow: "hidden", cursor: "pointer", background: "none", padding: 0 }}>
                <img src={a.url} alt={a.name} style={{ width: "100%", aspectRatio: "1", objectFit: "cover", display: "block" }} />
                {sel && <span style={{ position: "absolute", top: 2, right: 2, background: "var(--color-brand)", color: "#fff", fontSize: 9, borderRadius: 4, padding: "1px 4px" }}>✓</span>}
              </button>
            );
          })}
        </div>
      </div>
      <div style={{ marginTop: 14 }}>
        <label className="studio__label">Product Images ({productImages.length}/4)</label>
        <input type="file" accept="image/*" multiple onChange={(e) => handleProductUpload(e.target.files)} className="studio__input" />
        {productImages.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginTop: 8 }}>
            {productImages.map((p) => (
              <div key={p.id} style={{ position: "relative" }}>
                <img src={p.url} alt="" style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 8 }} />
                <button onClick={() => setProductImages((prev) => prev.filter((x) => x.id !== p.id))} style={{ position: "absolute", top: 2, right: 2, background: "rgba(0,0,0,0.7)", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 10, padding: "2px 6px" }}>×</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );

  const center = loading ? (
    <StagedProgress stage={genStage} elapsed={elapsed} />
  ) : result ? (
    <ResultCard result={result} type="video" credits={cost} model="Marketing Ad" onAction={handleAction} />
  ) : (
    <EmptyState Icon={IconMegaphone} title="Marketing Studio" description="Create UGC-style video ads with avatars, product images, and platform-optimized formats." tips={TIPS}>
      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 6 }}>
        {SUGGESTIONS.map((s) => (
          <button key={s} className="studio__chip--suggestion" onClick={() => setPrompt(s)} style={{ textAlign: "left" }}>{s}</button>
        ))}
      </div>
    </EmptyState>
  );

  const inspector = (
    <>
      <div className="studio__inspector-section">
        <div className="studio__label">Platform</div>
        <div className="studio__inspector-value">{PLATFORMS.find((p) => p.id === platform)?.label}</div>
        <div className="studio__inspector-sub">{aspect} · {duration}s · {resolution}</div>
      </div>
      <div className="studio__inspector-section">
        <div className="studio__label">Cost</div>
        <div className="studio__inspector-value"><IconBolt style={{ width: 12, height: 12 }} /> {cost || "—"} credits</div>
        {shortfall > 0 && <div className="studio__inspector-warn">Need {shortfall} more</div>}
      </div>
      <div className="studio__inspector-section">
        <div className="studio__label">Assets</div>
        <div className="studio__inspector-value">{selectedAvatars.length} avatar(s) · {productImages.length} product(s)</div>
      </div>
      {prompt && (
        <div className="studio__inspector-section">
          <div className="studio__label">Prompt</div>
          <div className="studio__inspector-prompt">{prompt}</div>
        </div>
      )}
    </>
  );

  const bottomBar = (
    <PromptComposer value={prompt} onChange={setPrompt} placeholder="Describe the ad — product, mood, style…" charLimit={2000}>
      <GenerateButton onClick={handleGenerate} disabled={!prompt.trim() || !affordable} generating={loading} stage={genStage} credits={cost} />
    </PromptComposer>
  );

  return (
    <WorkspaceShell title="Marketing" Icon={IconMegaphone} mode={mode} onModeChange={setMode} inputs={inputs} inspector={inspector} bottomBar={bottomBar} sheetTitle="Marketing Settings">
      {center}
    </WorkspaceShell>
  );
}

// CreationWorkspace is the canonical Command Universe composition; the adapter
// preserves this instrument's proven API behavior while its controls use the
// shared spatial workspace contract.
void CreationWorkspace;
export default withUniverseCreation(MarketingStudioV2, { tool: "marketing" });
