"use client";

import { useState, useCallback } from "react";
import PhoneTabBar from "./PhoneTabBar";
import PhoneCreateView from "./PhoneCreateView";
import PhoneHomeFeed from "./PhoneHomeFeed";
import PhoneGallery from "./PhoneGallery";
import PhoneToolsGrid from "./PhoneToolsGrid";
import PhoneProfile from "./PhoneProfile";

export default function PhoneShell({ tools = [], initialTool = "image" }) {
  const [activeTab, setActiveTab] = useState("create");
  const [activeTool, setActiveTool] = useState(initialTool);

  const handleToolSelect = useCallback((toolId) => {
    setActiveTool(toolId);
    setActiveTab("create");
  }, []);

  const tool = tools.find((t) => t.id === activeTool) || tools[0];

  return (
    <div className="ph-app">
      <div className="ph-shell">
        {/* Top bar */}
        <header className="ph-topbar">
          <span className="ph-topbar-title">
            {activeTab === "home" ? "Helmies" :
             activeTab === "create" ? (tool?.label || "Create") :
             activeTab === "gallery" ? "Gallery" :
             activeTab === "tools" ? "Tools" : "Profile"}
          </span>
          {activeTab === "create" && (
            <button className="ph-topbar-action" onClick={() => handleToolSelect(tools[0]?.id || "image")} aria-label="New">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
            </button>
          )}
        </header>

        {/* Content */}
        <div className="ph-content">
          {activeTab === "home" && <PhoneHomeFeed />}
          {activeTab === "create" && (
            <PhoneCreateView
              activeTool={activeTool}
              tools={tools}
              onToolChange={setActiveTool}
            />
          )}
          {activeTab === "gallery" && <PhoneGallery />}
          {activeTab === "tools" && (
            <PhoneToolsGrid
              tools={tools}
              activeTool={activeTool}
              onSelect={handleToolSelect}
            />
          )}
          {activeTab === "profile" && <PhoneProfile />}
        </div>

        {/* Tab bar */}
        <PhoneTabBar activeTab={activeTab} onSelect={setActiveTab} />
      </div>
    </div>
  );
}
