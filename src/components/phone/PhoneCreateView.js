"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import PhoneStage from "./PhoneStage";
import PhonePromptBar from "./PhonePromptBar";
import PhonePillBar from "./PhonePillBar";
import PhonePicker from "./PhonePicker";
import PhoneLoadingScreen from "./PhoneLoadingScreen";
import PhoneResultView from "./PhoneResultView";
import { useAsyncGeneration } from "@/components/studio/useAsyncGeneration";
import { useModelCatalog } from "@/components/studio/useModelCatalog";
import { apiFetch } from "@/lib/client-fetch";

/* ── Tool selector bar at top ── */
function ToolSelector({ tools, active, onChange }) {
  return (
    <div className="ph-tool-selector">
      {tools.slice(0, 8).map((t) => (
        <button
          key={t.id}
          className={`ph-tool-selector-item${active === t.id ? " ph-active" : ""}`}
          onClick={() => onChange(t.id)}
        >
          {t.Icon && <t.Icon />}
          {t.label}
        </button>
      ))}
    </div>
  );
}

/* ── Prompt suggestions ── */
const SUGGESTIONS = [
  "A cinematic portrait with soft light",
  "Abstract geometric neon composition",
  "Moody landscape at golden hour",
];

export default function PhoneCreateView({ activeTool, tools, onToolChange }) {
  const [prompt, setPrompt] = useState("");
  const [selectedModelId, setSelectedModelId] = useState("");
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [resolution, setResolution] = useState("2K");
  const [pickerOpen, setPickerOpen] = useState(null); // "model" | "aspect" | "resolution"
  const [resultViewId, setResultViewId] = useState(null); // show result in full-screen viewer

  /* ── Model catalog ── */
  const { models: allModels } = useModelCatalog({});
  const toolModels = useMemo(() => {
    if (!allModels?.length) return [];
    // filter by image models for image-like tools
    return allModels.filter(m =>
      m.aspectRatios?.length || m.resolutions?.length || (m.capability === "text-to-image" || m.capability === "image-to-image")
    );
  }, [allModels]);
  const currentModel = toolModels.find(m => m.id === selectedModelId) || toolModels[0];

  useEffect(() => {
    if (toolModels.length && !selectedModelId) setSelectedModelId(toolModels[0]?.id);
  }, [toolModels, selectedModelId]);

  /* ── Generation ── */
  const { loading: generating, result, error, elapsed, submit } = useAsyncGeneration();
  const [genError, setGenError] = useState("");

  const handleGenerate = useCallback(() => {
    if (!prompt.trim()) return;
    setGenError("");
    submit("image", currentModel?.id || selectedModelId, {
      endpoint: currentModel?.endpoint || currentModel?.id || selectedModelId,
      prompt,
      aspect_ratio: aspectRatio,
      resolution,
    });
  }, [prompt, currentModel, selectedModelId, aspectRatio, resolution, submit]);

  // Sync error
  useEffect(() => { if (error) setGenError(error); }, [error]);

  /* ── Handlers ── */
  const pillItems = [
    {
      key: "model",
      label: currentModel?.displayName || currentModel?.name || "Model",
      valueKey: "model",
    },
    { key: "aspect", label: aspectRatio, valueKey: "aspect" },
    { key: "resolution", label: resolution, valueKey: "resolution" },
  ];

  const handlePillTap = (key) => setPickerOpen(key);

  const handlePickerSelect = (key, value) => {
    if (key === "model") setSelectedModelId(value);
    if (key === "aspect") setAspectRatio(value);
    if (key === "resolution") setResolution(value);
    setPickerOpen(null);
  };

  const pickerData = useMemo(() => {
    if (pickerOpen === "model") {
      return {
        title: "Choose Model",
        items: toolModels.map(m => ({
          value: m.id,
          label: m.displayName || m.name || m.id,
          meta: m.provider || "",
        })),
        selected: selectedModelId,
      };
    }
    if (pickerOpen === "aspect") {
      const ars = currentModel?.aspectRatios?.length ? currentModel.aspectRatios : ["1:1", "4:5", "16:9", "9:16", "3:2"];
      return { title: "Aspect Ratio", items: ars.map(a => ({ value: a, label: a })), selected: aspectRatio };
    }
    if (pickerOpen === "resolution") {
      const res = currentModel?.resolutions?.length ? currentModel.resolutions : ["1K", "2K", "4K"];
      return { title: "Resolution", items: res.map(r => ({ value: r, label: r.toUpperCase() })), selected: resolution };
    }
    return null;
  }, [pickerOpen, toolModels, selectedModelId, currentModel, aspectRatio, resolution]);

  return (
    <div className="ph-create-view">
      <ToolSelector tools={tools} active={activeTool} onChange={onToolChange} />

      <div className="ph-create-stage-wrap">
        {generating ? (
          <PhoneLoadingScreen stage="Generating" progress={elapsed > 0 ? Math.min((elapsed % 30) * 3.3, 99) : null} />
        ) : (
          <PhoneStage
            result={result}
            error={genError}
            emptyLabel={tools.find(t => t.id === activeTool)?.label || "Create"}
            emptyDesc="Describe your vision with precision and watch it emerge."
            onResultTap={() => setResultViewId(result?.url)}
          />
        )}

        {/* Floating pills */}
        {!generating && (
          <PhonePillBar items={pillItems} onTap={handlePillTap} />
        )}
      </div>

      {/* Suggestions when empty */}
      {!generating && !result && !genError && (
        <div className="ph-suggestions">
          {SUGGESTIONS.map((s, i) => (
            <button key={i} className="ph-suggestion" onClick={() => setPrompt(s)}>{s}</button>
          ))}
        </div>
      )}

      {/* Prompt bar */}
      <PhonePromptBar
        value={prompt}
        onChange={setPrompt}
        onGenerate={handleGenerate}
        generating={generating}
        cost={currentModel?.credits || 0}
        onCancel={() => {}}
      />

      {/* Picker */}
      {pickerData && (
        <PhonePicker
          title={pickerData.title}
          items={pickerData.items}
          selected={pickerData.selected}
          onSelect={(v) => handlePickerSelect(pickerOpen, v)}
          onClose={() => setPickerOpen(null)}
        />
      )}

      {/* Full-screen result viewer */}
      {resultViewId && result && (
        <PhoneResultView
          result={result}
          onClose={() => setResultViewId(null)}
        />
      )}
    </div>
  );
}
