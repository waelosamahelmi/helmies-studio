"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getModeConfig } from "./chatModes";
import { useAsyncGeneration } from "./useAsyncGeneration";
import { useCreditCost } from "./useCreditCost";
import { apiFetch } from "@/lib/client-fetch";
import RichIdle from "./RichIdle";
import StagedProgress from "./StagedProgress";
import {
  IconBolt, IconArrowUpRight, IconArrowRight, IconDownload,
  IconClose, IconSettings, IconImage, IconVideo, IconMusic,
} from "@/components/Icons";

const EASE = [0.32, 0.72, 0, 1];

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
  if (setting.fromModel && model) {
    return model[setting.fromModel] || [];
  }
  return [];
}

function buildParams(config, model, prompt, settings, uploads) {
  const params = {};
  if (config.buildPrompt) {
    params.prompt = config.buildPrompt(prompt, settings);
  } else if (prompt) {
    params.prompt = prompt;
  }
  if (model?.endpoint) params.endpoint = model.endpoint;
  else if (model?.id) params.endpoint = model.id;

  for (const [key, val] of Object.entries(settings)) {
    if (val !== null && val !== undefined && val !== -1) {
      if (typeof val === "string" && val === "") continue;
      params[key] = val;
    }
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

  return params;
}

function ChatMessage({ msg, config, onRetry }) {
  if (msg.type === "system") {
    return (
      <div className="chat__msg chat__msg--system">
        <div className="chat__system-bubble">{msg.text}</div>
      </div>
    );
  }

  if (msg.type === "user") {
    return (
      <div className="chat__msg chat__msg--user">
        <div className="chat__user-bubble">
          {msg.text && <p className="chat__user-text">{msg.text}</p>}
          {msg.chips && msg.chips.length > 0 && (
            <div className="chat__chips">
              {msg.chips.map((c, i) => (
                <span key={i} className="chat__chip">{c}</span>
              ))}
            </div>
          )}
          {msg.attachments && msg.attachments.length > 0 && (
            <div className="chat__attachments">
              {msg.attachments.map((a, i) => (
                <div key={i} className="chat__attachment">
                  {a.type === "image" ? <img src={a.url} alt="" /> : <span>{a.name}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (msg.type === "loading") {
    return (
      <div className="chat__msg chat__msg--assistant">
        <div className="chat__assistant-bubble">
          <StagedProgress tool={config.tool} elapsed={msg.elapsed || 0} />
        </div>
      </div>
    );
  }

  if (msg.type === "error") {
    return (
      <div className="chat__msg chat__msg--assistant">
        <div className="chat__assistant-bubble chat__assistant-bubble--error">
          <p>{msg.text}</p>
        </div>
      </div>
    );
  }

  if (msg.type === "result") {
    return (
      <div className="chat__msg chat__msg--assistant">
        <div className="chat__assistant-bubble">
          {config.resultType === "image" && (
            <img src={msg.url} alt="Generated" className="chat__result-img" />
          )}
          {config.resultType === "video" && (
            <video src={msg.url} controls autoPlay loop playsInline className="chat__result-video" />
          )}
          {config.resultType === "audio" && (
            <audio src={msg.url} controls className="chat__result-audio" />
          )}
          {msg.outputs && msg.outputs.length > 1 && (
            <div className="chat__result-multi">
              {msg.outputs.map((o, i) => (
                <video key={i} src={o.url || o} controls playsInline className="chat__result-video" />
              ))}
            </div>
          )}
          <div className="chat__result-meta">
            <a href={msg.url} download className="btn btn-secondary btn-sm">
              <IconDownload /> Download
            </a>
            <button className="btn btn-secondary btn-sm" onClick={() => onRetry(msg)}>
              <IconArrowRight /> Retry
            </button>
            {msg.creditsUsed && (
              <span className="chat__credits"><IconBolt /> {msg.creditsUsed}</span>
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
}

function SettingsSheet({ open, onClose, config, model, settings, onSetting }) {
  if (!config.settings) return null;

  const visibleSettings = config.settings.filter(s => {
    if (s.showIf && model && !s.showIf(model)) return false;
    return true;
  });

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="chat__settings-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="chat__settings-sheet"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ duration: 0.4, ease: EASE }}
          >
            <div className="chat__settings-handle" />
            <div className="chat__settings-header">
              <h3>Settings</h3>
              <button className="chat__settings-close" onClick={onClose}><IconClose /></button>
            </div>
            <div className="chat__settings-body">
              {visibleSettings.map((s) => {
                if (s.type === "pills") {
                  const opts = getSettingOptions(s, model);
                  if (!opts || opts.length === 0) return null;
                  return (
                    <div key={s.key} className="chat__setting-group">
                      <label>{s.label}</label>
                      <div className="chat__pills">
                        {opts.map((o) => {
                          const val = typeof o === "object" ? o.id : o;
                          const label = typeof o === "object" ? o.label : o;
                          return (
                            <button
                              key={val}
                              className={`chat__pill ${settings[s.key] === val ? "chat__pill--active" : ""}`}
                              onClick={() => onSetting(s.key, val)}
                            >
                              {label}{s.suffix}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                }
                if (s.type === "select") {
                  const opts = getSettingOptions(s, model);
                  if (!opts || opts.length === 0) return null;
                  return (
                    <div key={s.key} className="chat__setting-group">
                      <label>{s.label}</label>
                      <select
                        className="chat__select"
                        value={settings[s.key] || ""}
                        onChange={(e) => onSetting(s.key, e.target.value)}
                      >
                        {opts.map((o) => {
                          const val = typeof o === "object" ? o.id : o;
                          const label = typeof o === "object" ? o.name || o.label : o;
                          return <option key={val} value={val}>{label}</option>;
                        })}
                      </select>
                    </div>
                  );
                }
                if (s.type === "number") {
                  return (
                    <div key={s.key} className="chat__setting-group">
                      <label>{s.label}</label>
                      <input
                        type="number"
                        className="chat__number"
                        value={settings[s.key] ?? ""}
                        min={s.min}
                        max={s.max}
                        onChange={(e) => onSetting(s.key, parseInt(e.target.value) || 0)}
                      />
                    </div>
                  );
                }
                return null;
              })}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function ModelDropdown({ config, model, onSelect }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (!config.models) return null;

  const filtered = config.models.filter(m =>
    m.name.toLowerCase().includes(search.toLowerCase()) || m.id.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="chat__model-dropdown" ref={ref}>
      <button className="chat__model-trigger" onClick={() => setOpen(!open)}>
        <span className="chat__model-name">{model?.name || "Select model"}</span>
        <span className={`chat__model-arrow ${open ? "chat__model-arrow--open" : ""}`}>▾</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="chat__model-list"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3, ease: EASE }}
          >
            <input
              className="chat__model-search"
              placeholder="Search models..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
            {filtered.map((m) => (
              <button
                key={m.id}
                className={`chat__model-item ${model?.id === m.id ? "chat__model-item--active" : ""}`}
                onClick={() => { onSelect(m); setOpen(false); setSearch(""); }}
              >
                <span className="chat__model-item-name">{m.name}</span>
                <span className="chat__model-item-provider">{m.provider}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function ChatStudio({ tool }) {
  const config = getModeConfig(tool);
  const [messages, setMessages] = useState([]);
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState(config.defaultModel);
  const [settings, setSettings] = useState(() => getDefaultSettings(config));
  const [uploads, setUploads] = useState({});
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const feedRef = useRef(null);
  const fileRef = useRef(null);
  const { result, error, elapsed, submit } = useAsyncGeneration();

  const creditParams = buildParams(config, model, prompt, settings, uploads);
  const { cost, affordable } = useCreditCost(config.tool, model?.id || "default", creditParams);

  useEffect(() => { setModel(config.defaultModel); }, [tool]);
  useEffect(() => { setSettings(getDefaultSettings(config)); }, [tool]);
  useEffect(() => { setUploads({}); setMessages([]); }, [tool]);

  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [messages, elapsed]);

  useEffect(() => {
    if (loading) {
      setMessages(prev => prev.map(m => m.type === "loading" ? { ...m, elapsed } : m));
    }
  }, [elapsed, loading]);

  const handleSetting = (key, val) => {
    setSettings(prev => ({ ...prev, [key]: val }));
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await apiFetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (data.url) {
        const uploadConfig = config.uploads?.find(u => u.accept?.includes(file.type.split("/")[0]) || u.accept === "image/*" || u.accept === "video/*" || u.accept === "audio/*");
        const key = uploadConfig?.key || "file";
        setUploads(prev => ({ ...prev, [key]: data.url }));
      }
    } catch {}
  };

  const handleGenerate = useCallback(async () => {
    const hasPrompt = prompt.trim() || config.noPrompt;
    const hasRequiredUploads = !config.uploads?.some(u => u.required && !uploads[u.key]);
    if (!hasPrompt || !hasRequiredUploads || loading) return;

    const chips = [];
    if (model) chips.push(model.name);
    for (const s of config.settings || []) {
      if (s.showIf && model && !s.showIf(model)) continue;
      if (s.type === "pills" && settings[s.key]) {
        chips.push(`${s.label}: ${settings[s.key]}${s.suffix || ""}`);
      } else if (s.type === "select" && settings[s.key]) {
        const opts = getSettingOptions(s, model);
        const opt = opts?.find(o => (typeof o === "object" ? o.id : o) === settings[s.key]);
        chips.push(`${s.label}: ${typeof opt === "object" ? opt.name || opt.label : opt}`);
      }
    }

    const attachments = Object.entries(uploads).map(([key, url]) => ({
      url, type: url.match(/\.(jpg|jpeg|png|webp|gif)$/i) ? "image" : "file", name: key,
    }));

    const userMsg = { id: Date.now(), type: "user", text: prompt.trim(), chips, attachments };
    const loadingMsg = { id: Date.now() + 1, type: "loading", elapsed: 0 };
    setMessages(prev => [...prev, userMsg, loadingMsg]);
    setLoading(true);
    setPrompt("");

    const params = buildParams(config, model, prompt, settings, uploads);
    submit(config.tool, model?.id || "default", params);
  }, [prompt, config, model, settings, uploads, loading, submit]);

  useEffect(() => {
    if (result && loading) {
      setMessages(prev => prev.map(m =>
        m.type === "loading" ? {
          ...m,
          type: "result",
          url: result.url,
          creditsUsed: result.creditsUsed,
          outputs: result.outputs,
        } : m
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

  const handleRetry = (msg) => {
    setMessages(prev => prev.filter(m => m.id !== msg.id));
    handleGenerate();
  };

  const hasRequiredUploads = !config.uploads?.some(u => u.required && !uploads[u.key]);
  const canGenerate = (prompt.trim() || config.noPrompt) && hasRequiredUploads && !loading && affordable;
  const visibleUploads = config.uploads?.filter(u => {
    if (u.showIf && model && !u.showIf(model)) return false;
    return true;
  }) || [];

  return (
    <div className="chat-studio">
      <div className="chat__feed" ref={feedRef}>
        {messages.length === 0 && (
          <RichIdle
            tool={config.tool}
            icon={config.resultType === "image" ? IconImage : config.resultType === "video" ? IconVideo : IconMusic}
            title={`${config.label} Studio`}
            description={`Type a prompt below and hit Generate to create ${config.resultType === "image" ? "images" : config.resultType === "video" ? "videos" : "audio"} with AI.`}
          />
        )}
        {messages.map(msg => (
          <ChatMessage key={msg.id} msg={msg} config={config} onRetry={handleRetry} />
        ))}
      </div>

      <div className="chat__input-bar">
        {visibleUploads.length > 0 && (
          <div className="chat__upload-row">
            {visibleUploads.map(u => (
              <button
                key={u.key}
                className={`chat__upload-btn ${uploads[u.key] ? "chat__upload-btn--done" : ""}`}
                onClick={() => fileRef.current?.click()}
              >
                {uploads[u.key] ? "✓ " : ""}{u.label}
                {u.required && !uploads[u.key] && <span className="chat__required">*</span>}
              </button>
            ))}
            <input ref={fileRef} type="file" onChange={handleUpload} style={{ display: "none" }} />
          </div>
        )}

        <div className="chat__config-row">
          <ModelDropdown config={config} model={model} onSelect={setModel} />
          <button
            className="chat__settings-btn"
            onClick={() => setSettingsOpen(true)}
            aria-label="Settings"
          >
            <IconSettings />
          </button>
        </div>

        <div className="chat__input-row">
          <div className="chat__input-inner">
            <ModelDropdown config={config} model={model} onSelect={setModel} />
            <button
              className="chat__settings-btn chat__settings-btn--desktop"
              onClick={() => setSettingsOpen(true)}
              aria-label="Settings"
            >
              <IconSettings />
            </button>
            <textarea
              className="chat__textarea"
              placeholder={config.promptPlaceholder}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleGenerate(); } }}
              rows={1}
            />
          </div>
          <button
            className="chat__send-btn"
            onClick={handleGenerate}
            disabled={!canGenerate}
          >
            {loading ? (
              <span className="chat__send-loading">...</span>
            ) : (
              <>
                Generate
                <IconArrowUpRight />
                {cost && <span className="chat__send-cost"><IconBolt />{cost}</span>}
              </>
            )}
          </button>
        </div>
      </div>

      <SettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        config={config}
        model={model}
        settings={settings}
        onSetting={handleSetting}
      />
    </div>
  );
}