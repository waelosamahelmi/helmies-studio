"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getModeConfig } from "../chatModes";
import { useAsyncGeneration } from "../useAsyncGeneration";
import { useCreditCost } from "../useCreditCost";
import { useAllCreditCosts } from "../useAllCreditCosts";
import { apiFetch } from "@/lib/client-fetch";
import ChatFeed from "../chat/ChatFeed";
import ChatInput from "../chat/ChatInput";
import ChatHeader from "../chat/ChatHeader";
import AISuggestions from "../chat/AISuggestions";
import SettingsDrawer from "../chat/SettingsDrawer";
import {
  IconImage, IconVideo, IconMusic, IconSparkle, IconBolt,
  IconArrowRight, IconDownload, IconClose, IconUsers, IconCamera,
  IconFilm, IconCut, IconMegaphone, IconMic,
} from "@/components/Icons";

const SPRING = { type: "spring", stiffness: 380, damping: 30, mass: 0.8 };
const EASE = [0.32, 0.72, 0, 1];

const TOOL_ICONS = {
  image: IconImage,
  video: IconVideo,
  audio: IconMusic,
  cinema: IconCamera,
  "vibe-motion": IconFilm,
  clipping: IconCut,
  marketing: IconMegaphone,
  lipsync: IconVideo,
  "body-swap": IconUsers,
  influencer: IconImage,
};

const TOOL_SUGGESTIONS = {
  image: [
    { icon: "IM", label: "A warrior princess in golden armor" },
    { icon: "IM", label: "Sunset over futuristic Tokyo skyline" },
    { icon: "IM", label: "A dragon wrapped around a medieval castle" },
  ],
  video: [
    { icon: "VI", label: "Drone shot over neon-lit Tokyo at night" },
    { icon: "VI", label: "Cinematic wave crashing on rocky shore" },
  ],
  audio: [
    { icon: "AU", label: "Epic orchestral with soaring strings" },
    { icon: "AU", label: "Lo-fi hip hop for studying" },
  ],
  cinema: [
    { icon: "CI", label: "A lone figure in the rain, neon reflections" },
    { icon: "CI", label: "Close-up of an eye, anamorphic flare" },
  ],
  "vibe-motion": [
    { icon: "MO", label: "Flowing particles with gradient transitions" },
    { icon: "MO", label: "Liquid morphing shapes in pastel colors" },
  ],
  clipping: [
    { icon: "CL", label: "Extract the top 3 viral moments" },
    { icon: "CL", label: "Find the funniest 30-second clips" },
  ],
  marketing: [
    { icon: "AD", label: "A UGC ad for a luxury skincare product" },
    { icon: "AD", label: "Cinematic product reveal with dramatic lighting" },
  ],
  lipsync: [
    { icon: "LS", label: "Lip sync this portrait to the uploaded audio" },
    { icon: "LS", label: "Make this character speak the dialogue" },
  ],
  "body-swap": [
    { icon: "RC", label: "Swap the body to match the reference face" },
    { icon: "RC", label: "Replace the dancer with the subject" },
  ],
  influencer: [
    { icon: "IN", label: "A fitness influencer in a sunlit gym" },
    { icon: "IN", label: "A fashion creator in a Parisian street" },
  ],
};

const TIPS = [
  "Tip: Be specific — describe lighting, mood, and camera for stronger results.",
  "Tip: Use the settings panel to fine-tune model, aspect, and duration.",
  "Tip: Optimize your prompt with the sparkle button before generating.",
  "Tip: Upload a reference to unlock edit and image-to-video models.",
  "Tip: Press Cmd / Ctrl + Enter to generate instantly.",
];

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

function PremiumIdle({ tool, Icon, title, description, tipIdx }) {
  return (
    <div className="studio__empty" style={{ maxWidth: 460, margin: "0 auto" }}>
      <motion.div
        className="studio__empty-glyph"
        animate={{ scale: [1, 1.06, 1], opacity: [0.85, 1, 0.85] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      >
        <Icon className="studio__empty-glyph-icon" />
      </motion.div>
      <h3 className="studio__empty-title">{title}</h3>
      <p className="studio__empty-desc">{description}</p>

      <AnimatePresence mode="wait">
        <motion.div
          key={tipIdx}
          className="studio__empty-tip"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.3, ease: EASE }}
        >
          <IconSparkle className="studio__empty-tip-icon" />
          {TIPS[tipIdx]}
        </motion.div>
      </AnimatePresence>

      <div className="studio__empty-shortcuts">
        <kbd>Cmd</kbd>
        <kbd>↵</kbd>
        <span>Generate</span>
      </div>
    </div>
  );
}

export default function SimpleMode({ tool, initialModel }) {
  const config = getModeConfig(tool);
  const [messages, setMessages] = useState([]);
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState(config.defaultModel);
  const [bgMap, setBgMap] = useState({});

  useEffect(() => {
    if (initialModel && Array.isArray(models) && models.some((m) => m.id === initialModel)) {
      setModel(initialModel);
    }
  }, [initialModel]);

  useEffect(() => {
    fetch("/api/admin/models")
      .then((r) => r.json())
      .then((d) => {
        const map = {};
        (d.models || []).forEach((m) => {
          if (m.background) map[m.id] = {
              url: m.background,
              overlay: m.backgroundOverlay ?? 0.05,
              textColor: m.textColor || "light",
            };
        });
        setBgMap(map);
      })
      .catch(() => {});
  }, []);
  const [settings, setSettings] = useState(() => getDefaultSettings(config));
  const [uploads, setUploads] = useState({});
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [optimizing, setOptimizing] = useState(false);
  const [pendingOptimization, setPendingOptimization] = useState(null);
  const [tipIdx, setTipIdx] = useState(0);
  const { result, error, elapsed, submit, loading: genLoading } = useAsyncGeneration();
  const [loading, setLoading] = useState(false);

  const selectableModels = config.models
    ? [...config.models, ...(config.i2vModels || [])]
    : [];

  const { costs: allCosts } = useAllCreditCosts(config.tool, selectableModels);

  const creditParams = buildParams(config, model, prompt, settings, uploads);
  const { cost, affordable, shortfall, topUpPacks } = useCreditCost(config.tool, model?.id || "default", creditParams);

  useEffect(() => { setModel(config.defaultModel); setSettings(getDefaultSettings(config)); setUploads({}); setMessages([]); }, [tool]);

  useEffect(() => {
    const id = setInterval(() => setTipIdx((i) => (i + 1) % TIPS.length), 5200);
    return () => clearInterval(id);
  }, []);

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
        attachments.push({ url: val, type: val.match(/\.(jpg|jpeg|png|webp|gif)$/i) ? "image" : "file", name: key });
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
          messages.length === 0 ? (
            <PremiumIdle
              tool={config.tool}
              Icon={Icon}
              title={`${config.label} Studio`}
              description={`Type a prompt below to create ${config.resultType === "image" ? "images" : config.resultType === "video" ? "videos" : "audio"} with AI.`}
              tipIdx={tipIdx}
            />
          ) : null
        }
      />
      <AnimatePresence>
        {messages.length === 0 && suggestions.length > 0 && (
          <motion.div
            className="simple-mode__suggestions"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={SPRING}
          >
            <AISuggestions suggestions={suggestions} onSelect={handleSuggestion} />
          </motion.div>
        )}
      </AnimatePresence>
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
      <AnimatePresence>
        {pendingOptimization && (
          <motion.div
            className="prompt-opt__overlay"
            onClick={() => setPendingOptimization(null)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <motion.div
              className="prompt-opt"
              onClick={(e) => e.stopPropagation()}
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={SPRING}
            >
              <div className="prompt-opt__header">
                <IconSparkle />
                <span>Optimized Prompt</span>
                <button className="prompt-opt__close" onClick={() => setPendingOptimization(null)} type="button">
                  <IconClose style={{ width: 14, height: 14 }} />
                </button>
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
                <button className="prompt-opt__btn prompt-opt__btn--cancel" onClick={() => setPendingOptimization(null)} type="button">
                  Edit
                </button>
                <button
                  className="prompt-opt__btn prompt-opt__btn--confirm"
                  onClick={() => { setPrompt(pendingOptimization.optimized); setPendingOptimization(null); }}
                  type="button"
                >
                  Use Prompt
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
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
