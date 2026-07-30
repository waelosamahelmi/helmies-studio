"use client";

import { IconSettings, IconEye } from "@/components/Icons";

export default function PanelToggles({ activePanel, onToggle }) {
  return (
    <div className="v6-mobile-panel-toggles">
      <button
        className={[
          "v6-mobile-panel-toggle",
          activePanel === "controls" && "v6-mobile-panel-toggle--active",
        ]
          .filter(Boolean)
          .join(" ")}
        onClick={() => onToggle("controls")}
        aria-label="Toggle controls panel"
        aria-pressed={activePanel === "controls"}
      >
        <IconSettings />
        <span>Controls</span>
      </button>
      <button
        className={[
          "v6-mobile-panel-toggle",
          activePanel === "inspector" && "v6-mobile-panel-toggle--active",
        ]
          .filter(Boolean)
          .join(" ")}
        onClick={() => onToggle("inspector")}
        aria-label="Toggle inspector panel"
        aria-pressed={activePanel === "inspector"}
      >
        <IconEye />
        <span>Inspector</span>
      </button>
    </div>
  );
}
