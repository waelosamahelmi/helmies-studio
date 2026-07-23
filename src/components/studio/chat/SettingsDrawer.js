"use client";

import { IconSettings, IconClose, IconCheck, IconChevron } from "@/components/Icons";

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
  if (!open) return null;

  const models = config?.models || [];
  const settingsList = config?.settings || [];
  const advancedSettings = settingsList.filter(s => s.advanced);
  const basicSettings = settingsList.filter(s => !s.advanced);

  function renderSetting(setting) {
    const label = INPUT_LABELS[setting.key] || setting.label || setting.key;

    if (setting.type === "pills") {
      const options = setting.options || setting.fromModel && model?.[setting.fromModel] || [];
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
                  key={optId}
                  className={`settings-drawer__pill ${isActive ? "settings-drawer__pill--active" : ""}`}
                  onClick={() => onSettingChange(setting.key, optId)}
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
      const options = setting.options || setting.fromModel && model?.[setting.fromModel] || [];
      const value = settings[setting.key] ?? setting.default ?? "";
      return (
        <div key={setting.key} className="settings-drawer__field">
          <label className="settings-drawer__label">{label}</label>
          <select
            className="settings-drawer__select"
            value={value}
            onChange={(e) => onSettingChange(setting.key, e.target.value)}
          >
            {options.map((opt) => {
              const optId = typeof opt === "object" ? opt.id : opt;
              const optLabel = typeof opt === "object" ? opt.label || opt.name : opt;
              return <option key={optId} value={optId}>{optLabel}</option>;
            })}
          </select>
        </div>
      );
    }

    if (setting.type === "number") {
      const value = settings[setting.key] ?? setting.default ?? "";
      return (
        <div key={setting.key} className="settings-drawer__field">
          <label className="settings-drawer__label">{label}</label>
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
          <button className="settings-drawer__close" onClick={onClose}>
            <IconClose />
          </button>
        </div>

        <div className="settings-drawer__body">
          {/* Model selection */}
          {models.length > 0 && (
            <div className="settings-drawer__section">
              <h4 className="settings-drawer__section-title">Model</h4>
              <div className="settings-drawer__models">
                {models.map((m) => (
                  <button
                    key={m.id}
                    className={`settings-drawer__model ${model?.id === m.id ? "settings-drawer__model--active" : ""}`}
                    onClick={() => onModelChange(m)}
                  >
                    <span className="settings-drawer__model-name">{m.name}</span>
                    {m.provider && <span className="settings-drawer__model-provider">{m.provider}</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Basic settings */}
          {basicSettings.length > 0 && (
            <div className="settings-drawer__section">
              <h4 className="settings-drawer__section-title">Parameters</h4>
              <div className="settings-drawer__fields">
                {basicSettings
                  .filter(s => !s.showIf || (model && s.showIf(model, settings, uploads)))
                  .map(renderSetting)}
              </div>
            </div>
          )}

          {/* Advanced settings */}
          {advancedSettings.length > 0 && (
            <div className="settings-drawer__section">
              <h4 className="settings-drawer__section-title">Advanced</h4>
              <div className="settings-drawer__fields">
                {advancedSettings
                  .filter(s => !s.showIf || (model && s.showIf(model, settings, uploads)))
                  .map(renderSetting)}
              </div>
            </div>
          )}

          {/* No settings */}
          {models.length === 0 && basicSettings.length === 0 && (
            <div className="settings-drawer__empty">
              <p>No settings available for this tool.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
