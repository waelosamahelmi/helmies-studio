"use client";

import { useState, useEffect, useCallback } from "react";
import { getModeConfig } from "../chatModes";
import { useAsyncGeneration } from "../useAsyncGeneration";
import { useCreditCost } from "../useCreditCost";
import { apiFetch } from "@/lib/client-fetch";
import ChatFeed from "../chat/ChatFeed";
import ChatInput from "../chat/ChatInput";
import ChatHeader from "../chat/ChatHeader";
import AISuggestions from "../chat/AISuggestions";
import SettingsDrawer from "../chat/SettingsDrawer";
import RichIdle from "../RichIdle";
import {
  IconImage, IconVideo, IconMusic,
} from "@/components/Icons";

const TOOL_ICONS = {
  image: IconImage,
  video: IconVideo,
  audio: IconMusic,
  cinema: IconImage,
  "vibe-motion": IconVideo,
  clipping: IconVideo,
  marketing: IconVideo,
  lipsync: IconVideo,
  "body-swap": IconVideo,
  influencer: IconImage,
};

const TOOL_SUGGESTIONS = {
  image: [
    { icon: "🎨", label: "A warrior princess in golden armor" },
    { icon: "🌅", label: "Sunset over futuristic Tokyo skyline" },
    { icon: "🐉", label: "A dragon wrapped around a medieval castle" },
  ],
  video: [
    { icon: "🎬", label: "Drone shot over neon-lit Tokyo at night" },
    { icon: "🌊", label: "Cinematic wave crashing on rocky shore" },
  ],
  audio: [
    { icon: "🎵", label: "Epic orchestral with soaring strings" },
    { icon: "🎹", label: "Lo-fi hip hop for studying" },
  ],
};

function getDefaultSettings(config) {
  const defaults = {};
  if (config.settings) {
    for (const s of config.settings) {
      if (s.showIf && config.defaultModel && !s.showIf(config.defaultModel)) continue;
      defaults[s.key] = s.default;
    }
  }
  return defaults;
}

function getSettingOptions(setting, model) {
  if (setting.options) return setting.options;
  if (setting.fromModel && model) return model[setting.fromModel] || [];
  return [];
}

function buildParams(config, model, prompt, settings, uploads) {
  const params = {};
  const promptKey = config.promptKey ? config.promptKey(model, settings) : "prompt";

  if (config.buildPrompt) {
    params[promptKey] = config.buildPrompt(prompt, settings);
  } else if (prompt) {
    params[promptKey] = prompt;
  }

  if (model?.endpoint) params.endpoint = model.endpoint;
  else if (model?.id) params.endpoint = model.id;

  for (const [key, val] of Object.entries(settings)) {
    if (val === null || val === undefined || val === -1) continue;
    if (typeof val === "string" && val === "") continue;
    if (key.startsWith("influencer_")) continue;
    params[key] = val;
  }

  for (const [key, val] of Object.entries(uploads)) {
    if (val) {
      if (Array.isArray(val)) {
        if (val.length > 0) params[key] = val;
      } else {
        params[key] = val;
      }
    }
  }

  if (config.paramOverrides) {
    Object.assign(params, config.paramOverrides(settings));
  }

  return params;
}

export default function SimpleMode({ tool }) {
  const config = getModeConfig(tool);
  const [messages, setMessages] = useState([]);
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState(config.defaultModel);
  const [settings, setSettings] = useState(() => getDefaultSettings(config));
  const [uploads, setUploads] = useState({});
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [optimizing, setOptimizing] = useState(false);
  const [pendingOptimization, setPendingOptimization] = useState(null);
  const { result, error, elapsed, submit, loading: genLoading } = useAsyncGeneration();
  const [loading, setLoading] = useState(false);

  const creditParams = buildParams(config, model, prompt, settings, uploads);
  const { cost, affordable } = useCreditCost(config.tool, model?.id || "default", creditParams);

  useEffect(() => { setModel(config.defaultModel); setSettings(getDefaultSettings(config)); setUploads({}); setMessages([]); }, [tool]);

  useEffect(() => {
    if (loading && elapsed > 0) {
      setMessages(prev => prev.map(m => m.type === "loading" ? { ...m, elapsed } : m));
    }
  }, [elapsed, loading]);

  useEffect(() => {
    if (result && loading) {
      setMessages(prev => prev.map(m =>
        m.type === "loading" ? { ...m, type: "result", url: result.url, creditsUsed: result.creditsUsed, outputs: result.outputs } : m
      ));
      setLoading(false);
    }
  }, [result, loading]);

  useEffect(() => {
    if (error && loading) {
      setMessages(prev => prev.map(m =>
        m.type === "loading" ? { ...m, type: "error", text: error } : m
      ));
      setLoading(false);
    }
  }, [error, loading]);

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await apiFetch("/api/generations/status?limit=50");
        const data = await res.json();
        if (data.generations) setPendingCount(data.generations.filter(g => g.status === "pending").length);
      } catch {}
    };
    poll();
    const interval = setInterval(poll, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleUpload = async (e, uploadConfig, presetUrl) => {
    if (presetUrl) {
      const key = uploadConfig.key;
      setUploads(prev => ({ ...prev, [key]: [...(prev[key] || []), presetUrl] }));
      return;
    }
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const key = uploadConfig?.key || "file";
    const isMulti = uploadConfig?.multi;

    const uploadFile = async (file) => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await apiFetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      return data.url;
    };

    try {
      const urls = await Promise.all(files.map(uploadFile));
      setUploads(prev => ({
        ...prev,
        [key]: isMulti ? [...(prev[key] || []), ...urls] : urls[0],
      }));
    } catch {}
    e.target.value = "";
  };

  const removeUpload = (key, index) => {
    setUploads(prev => {
      const val = prev[key];
      if (Array.isArray(val)) {
        const next = val.filter((_, i) => i !== index);
        return { ...prev, [key]: next.length > 0 ? next : undefined };
      }
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handleOptimize = useCallback(async (text) => {
    if (!text.trim() || optimizing) return;
    setOptimizing(true);
    try {
      const res = await apiFetch("/api/prompt/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: text, type: config.resultType || "image", modelId: model?.id }),
      });
      const data = await res.json();
      if (data.expanded && data.expanded !== text) {
        setPendingOptimization({ original: text, optimized: data.expanded });
      }
    } catch {}
    setOptimizing(false);
  }, [optimizing, config, model]);

  const handleGenerate = useCallback(async (text) => {
    const promptText = text || prompt;
    if (!promptText.trim() && !config.noPrompt) return;
    if (!affordable || loading) return;

    let activeModel = model;
    let activeTool = config.tool;
    if (config.autoSwitchToI2V && uploads.image_url && config.i2vModels) {
      activeModel = config.i2vModels[0];
      activeTool = "i2v";
    }

    const chips = [];
    if (activeModel) chips.push(activeModel.name);
    for (const s of config.settings || []) {
      if (s.showIf && model && !s.showIf(model, settings, uploads)) continue;
      if (s.type === "pills" && settings[s.key] !== undefined) {
        const opts = getSettingOptions(s, model);
        const val = settings[s.key];
        const opt = opts?.find(o => (typeof o === "object" ? o.id : o) === val);
        chips.push(`${s.label}: ${typeof opt === "object" ? opt.label || opt.name : val}${s.suffix || ""}`);
      }
    }

    const attachments = [];
    for (const [key, val] of Object.entries(uploads)) {
      if (Array.isArray(val)) {
        val.forEach(url => attachments.push({ url, type: url.match(/\.(jpg|jpeg|png|webp|gif)$/i) ? "image" : "file", name: key }));
      } else if (val) {
        attachments.push({ url: val, type: url.match(/\.(jpg|jpeg|png|webp|gif)$/i) ? "image" : "file", name: key });
      }
    }

    const userMsg = { id: Date.now(), type: "user", text: promptText, chips, attachments };
    const loadingMsg = { id: Date.now() + 1, type: "loading", elapsed: 0 };
    setMessages(prev => [...prev, userMsg, loadingMsg]);
    setLoading(true);
    setPrompt("");
    setPendingOptimization(null);

    const params = buildParams(config, activeModel, promptText, settings, uploads);
    submit(activeTool, activeModel?.id || "default", params);
  }, [prompt, config, model, settings, uploads, loading, affordable, submit]);

  const handleRetry = (msg) => {
    setMessages(prev => prev.filter(m => m.id !== msg.id));
  };

  const handleSuggestion = (s) => {
    setPrompt(s.label);
  };

  const visibleUploads = config.uploads?.filter(u => {
    if (u.showIf && model && !u.showIf(model, settings, uploads)) return false;
    return true;
  }) || [];

  const handleSettingChange = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const Icon = TOOL_ICONS[tool] || IconImage;
  const suggestions = TOOL_SUGGESTIONS[tool] || [];

  return (
    <div className="simple-mode">
      <ChatHeader Icon={Icon} pendingCount={pendingCount} />
      <ChatFeed
        messages={messages}
        config={config}
        onRetry={handleRetry}
        idle={
          <RichIdle
            tool={config.tool}
            icon={Icon}
            title={`${config.label} Studio`}
            description={`Type a prompt below to create ${config.resultType === "image" ? "images" : config.resultType === "video" ? "videos" : "audio"} with AI.`}
          />
        }
      />
      {messages.length === 0 && suggestions.length > 0 && (
        <div className="simple-mode__suggestions">
          <AISuggestions suggestions={suggestions} onSelect={handleSuggestion} />
        </div>
      )}
      <ChatInput
        placeholder={config.promptPlaceholder}
        onSubmit={handleGenerate}
        uploads={visibleUploads.length > 0 ? visibleUploads : null}
        handleUpload={handleUpload}
        removeUpload={removeUpload}
        uploadsState={uploads}
        modelChip={model?.name}
        disabled={!affordable}
        loading={loading}
        cost={cost}
        onSettingsOpen={() => setSettingsOpen(true)}
        onOptimize={handleOptimize}
      />
      {pendingOptimization && (
        <div className="prompt-opt__overlay" onClick={() => setPendingOptimization(null)}>
          <div className="prompt-opt" onClick={(e) => e.stopPropagation()}>
            <div className="prompt-opt__header">
              <IconSparkle />
              <span>Optimized Prompt</span>
              <button className="prompt-opt__close" onClick={() => setPendingOptimization(null)}>✕</button>
            </div>
            <div className="prompt-opt__original">
              <label>Original</label>
              <p>{pendingOptimization.original}</p>
            </div>
            <div className="prompt-opt__optimized">
              <label>Optimized</label>
              <textarea
                className="prompt-opt__textarea"
                value={pendingOptimization.optimized}
                onChange={(e) => setPendingOptimization(prev => ({ ...prev, optimized: e.target.value }))}
                rows={4}
              />
            </div>
            <div className="prompt-opt__actions">
              <button className="prompt-opt__btn prompt-opt__btn--cancel" onClick={() => setPendingOptimization(null)}>
                Edit
              </button>
              <button className="prompt-opt__btn prompt-opt__btn--confirm" onClick={() => { setPrompt(pendingOptimization.optimized); setPendingOptimization(null); }}>
                Use Prompt
              </button>
            </div>
          </div>
        </div>
      )}
      <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        config={config}
        model={model}
        onModelChange={setModel}
        settings={settings}
        onSettingChange={handleSettingChange}
        uploads={uploads}
      />
    </div>
  );
}
