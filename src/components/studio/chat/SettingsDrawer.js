"use client";

import { useState } from "react";
import { IconSettings, IconClose, IconCheck, IconChevron, IconSearch } from "@/components/Icons";

const INPUT_LABELS = {
  aspect_ratio: "Aspect Ratio",
  resolution: "Resolution",
  width: "Width",
  height: "Height",
  num_images: "Variations",
  seed: "Seed",
  duration: "Duration",
  voice: "Voice",
  mode: "Mode",
  camera: "Camera",
  lens: "Lens",
  focal: "Focal Length",
  aperture: "Aperture",
  character_orientation: "Character Orientation",
  num_highlights: "Number of Highlights",
  return_coordinates_only: "Output Type",
};

const METHOD_LABELS = {
  text_to_image: "Text to Image",
  image_to_image: "Image to Image",
  image_to_video: "Image to Video",
  video_to_video: "Video to Video",
  text_to_video: "Text to Video",
  lipsync: "Lip Sync",
  audio: "Audio",
};

const MODE_TO_METHOD = {
  "t2i": "text_to_image",
  "i2i": "image_to_image",
  "t2v": "text_to_video",
  "i2v": "image_to_video",
  "v2v": "video_to_video",
};

function detectMethods(config, models) {
  const methods = [];
  if (models && models.length > 0) {
    methods.push({ id: "t2i", label: "Text to Image" });
    if (config.uploads?.some(u => u.key === "image_url" || u.key === "images_list")) {
      methods.push({ id: "i2i", label: "Image to Image" });
    }
    if (config.uploads?.some(u => u.key === "video_url" || u.key === "videos_list")) {
      methods.push({ id: "v2v", label: "Video to Video" });
    }
    if (config.i2vModels?.length > 0) {
      methods.push({ id: "i2v", label: "Image to Video" });
    }
  }
  return methods;
}

const ToolSection = ({ label, children, defaultOpen }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="settings-drawer__section">
      <button className="settings-drawer__section-toggle" onClick={() => setOpen(!open)} type="button">
        <IconChevron style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }} />
        <h4 className="settings-drawer__section-title">{label}</h4>
      </button>
      {open && <div className="settings-drawer__section-content">{children}</div>}
    </div>
  );
};

export default function SettingsDrawer({
  open,
  onClose,
  config,
  model,
  onModelChange,
  settings,
  onSettingChange,
  uploads,
}) {
  const [methodFilter, setMethodFilter] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  if (!open) return null;

  const models = config?.models || [];
  const i2vModels = config?.i2vModels || [];
  const settingsList = config?.settings || [];
  const advancedSettings = settingsList.filter(s => s.advanced);
  const basicSettings = settingsList.filter(s => !s.advanced);
  const methods = detectMethods(config, models);

  const allSelectableModels = [...models, ...i2vModels];
  const filteredModels = allSelectableModels.filter(m => {
    if (methodFilter === "i2v") return i2vModels.some(iv => iv.id === m.id);
    if (methodFilter === "i2i") return models.some(mm => mm.id === m.id);
    if (methodFilter === "t2i") return models.some(mm => mm.id === m.id);
    if (searchQuery) return m.name?.toLowerCase().includes(searchQuery.toLowerCase()) || m.provider?.toLowerCase().includes(searchQuery.toLowerCase());
    return true;
  });

  const showMethodPicker = methods.length > 0;

  function renderSetting(setting) {
    const label = INPUT_LABELS[setting.key] || setting.label || setting.key;

    if (setting.type === "pills") {
      let options = setting.options || [];
      if (setting.fromModel && model?.[setting.fromModel]) {
        options = model[setting.fromModel];
      }
      const value = settings[setting.key] ?? setting.default;
      return (
        <div key={setting.key} className="settings-drawer__field">
          <label className="settings-drawer__label">{label}</label>
          <div className="settings-drawer__pills">
            {options.map((opt) => {
              const optId = typeof opt === "object" ? opt.id : opt;
              const optLabel = typeof opt === "object" ? opt.label || opt.name : opt;
              const isActive = String(value) === String(optId);
              return (
                <button
                  key={String(optId)}
                  className={`settings-drawer__pill ${isActive ? "settings-drawer__pill--active" : ""}`}
                  onClick={() => onSettingChange(setting.key, optId)}
                  type="button"
                >
                  {optLabel}
                  {isActive && <IconCheck />}
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    if (setting.type === "select") {
      let options = setting.options || [];
      if (setting.fromModel && model?.[setting.fromModel]) {
        options = model[setting.fromModel];
      }
      const value = settings[setting.key] ?? setting.default ?? "";
      return (
        <div key={setting.key} className="settings-drawer__field">
          <label className="settings-drawer__label">{label}</label>
          <div className="settings-drawer__select-wrap">
            <select
              className="settings-drawer__select"
              value={value}
              onChange={(e) => onSettingChange(setting.key, e.target.value)}
            >
              {options.map((opt) => {
                const optId = typeof opt === "object" ? opt.id : opt;
                const optLabel = typeof opt === "object" ? opt.label || opt.name : opt;
                return <option key={String(optId)} value={String(optId)}>{optLabel}</option>;
              })}
            </select>
            <IconChevron className="settings-drawer__select-chevron" />
          </div>
        </div>
      );
    }

    if (setting.type === "number") {
      const value = settings[setting.key] ?? setting.default ?? "";
      return (
        <div key={setting.key} className="settings-drawer__field">
          <label className="settings-drawer__label">{label}</label>
          <div className="settings-drawer__number-wrap">
            <input
              type="number"
              className="settings-drawer__number"
              value={value}
              min={setting.min}
              max={setting.max}
              step={setting.step}
              onChange={(e) => onSettingChange(setting.key, e.target.value === "" ? "" : Number(e.target.value))}
            />
            {setting.suffix && <span className="settings-drawer__suffix">{setting.suffix}</span>}
          </div>
        </div>
      );
    }

    return null;
  }

  return (
    <div className="settings-drawer__overlay" onClick={onClose}>
      <div className="settings-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="settings-drawer__header">
          <IconSettings />
          <span>Settings</span>
          <button className="settings-drawer__close" onClick={onClose} type="button">
            <IconClose />
          </button>
        </div>

        <div className="settings-drawer__body">
          {/* Method picker */}
          {showMethodPicker && (
            <div className="settings-drawer__method-bar">
              {methods.map((m) => (
                <button
                  key={m.id}
                  className={`settings-drawer__method ${methodFilter === m.id ? "settings-drawer__method--active" : ""}`}
                  onClick={() => setMethodFilter(methodFilter === m.id ? null : m.id)}
                  type="button"
                >
                  {m.label}
                </button>
              ))}
            </div>
          )}

          {/* Model search */}
          {filteredModels.length > 4 && (
            <div className="settings-drawer__search">
              <IconSearch />
              <input
                type="text"
                className="settings-drawer__search-input"
                placeholder="Search models..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          )}

          {/* Model selection */}
          {filteredModels.length > 0 && (
            <ToolSection label="Model" defaultOpen={true}>
              <div className="settings-drawer__models">
                {filteredModels.map((m) => (
                  <button
                    key={m.id}
                    className={`settings-drawer__model ${model?.id === m.id ? "settings-drawer__model--active" : ""}`}
                    onClick={() => onModelChange(m)}
                    type="button"
                  >
                    <span className="settings-drawer__model-name">{m.name}</span>
                    {m.provider && (
                      <span className="settings-drawer__model-provider">{m.provider}</span>
                    )}
                  </button>
                ))}
              </div>
            </ToolSection>
          )}

          {/* Basic settings */}
          {basicSettings.length > 0 && (
            <ToolSection label="Parameters" defaultOpen={true}>
              <div className="settings-drawer__fields">
                {basicSettings
                  .filter(s => !s.showIf || (model && s.showIf(model, settings, uploads)))
                  .map(renderSetting)}
              </div>
            </ToolSection>
          )}

          {/* Advanced settings */}
          {advancedSettings.length > 0 && (
            <ToolSection label="Advanced" defaultOpen={false}>
              <div className="settings-drawer__fields">
                {advancedSettings
                  .filter(s => !s.showIf || (model && s.showIf(model, settings, uploads)))
                  .map(renderSetting)}
              </div>
            </ToolSection>
          )}

          {/* No settings */}
          {filteredModels.length === 0 && basicSettings.length === 0 && (
            <div className="settings-drawer__empty">
              <p>No settings available for this tool.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
