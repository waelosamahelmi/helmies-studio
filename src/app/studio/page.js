"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import Navbar from "@/components/Navbar";
import {
  FaImage, FaVideo, FaMusic, FaCameraRetro, FaFilm, FaCut,
  FaBullhorn, FaMicrophone, FaUserFriends, FaCrown,
  FaSearch, FaStar, FaBolt, FaChevronRight, FaTimes, FaMagic,
} from "react-icons/fa";

const TOOLS = [
  { id: "image", label: "Image", desc: "Text-to-image & image-to-image", icon: FaImage, color: "#FF1B6B", group: "Generate", badge: "55+", shortcut: "1" },
  { id: "video", label: "Video", desc: "Text, image & video-to-video", icon: FaVideo, color: "#7C3AED", group: "Generate", badge: "40+", shortcut: "2" },
  { id: "audio", label: "Audio", desc: "Music, voice & sound effects", icon: FaMusic, color: "#00E5FF", group: "Generate", badge: "20+", shortcut: "3" },
  { id: "cinema", label: "Cinema", desc: "Cinematic camera controls", icon: FaCameraRetro, color: "#FF6B35", group: "Cinematic", badge: null, shortcut: "4" },
  { id: "vibe-motion", label: "Motion", desc: "Motion graphics & remix", icon: FaFilm, color: "#FFD166", group: "Cinematic", badge: null, shortcut: "5" },
  { id: "clipping", label: "Clipping", desc: "AI highlight extraction", icon: FaCut, color: "#00E68A", group: "Cinematic", badge: null, shortcut: "6" },
  { id: "marketing", label: "Marketing", desc: "UGC video ads & product shots", icon: FaBullhorn, color: "#FF1B6B", group: "Cinematic", badge: "New", shortcut: "7" },
  { id: "lipsync", label: "Lip Sync", desc: "Sync audio to portrait or video", icon: FaMicrophone, color: "#7C3AED", group: "Character", badge: "9", shortcut: "8" },
  { id: "body-swap", label: "Body Swap", desc: "Recast faces into any scene", icon: FaUserFriends, color: "#00E5FF", group: "Character", badge: null, shortcut: "9" },
  { id: "influencer", label: "Influencer", desc: "Build AI personas", icon: FaCrown, color: "#FF6B35", group: "Character", badge: null, shortcut: "0" },
];

function EmptyState({ icon: Icon, title, description }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-12">
      <div className="w-16 h-16 rounded-2xl bg-brand/10 border border-brand/20 flex items-center justify-center mb-6">
        <Icon className="text-2xl text-brand" />
      </div>
      <h3 className="text-2xl font-bold text-white mb-2">{title}</h3>
      <p className="text-sm text-white/50 max-w-md">{description}</p>
    </div>
  );
}

function ToolPanel({ tool }) {
  const Icon = tool.icon;
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="studio__header">
        <span className="w-10 h-10 rounded-xl flex items-center justify-center text-lg" style={{ background: `${tool.color}15`, color: tool.color, border: `1px solid ${tool.color}30` }}>
          <Icon />
        </span>
        <div>
          <h1>{tool.label} Studio</h1>
          <p className="text-xs text-white/40">{tool.desc}</p>
        </div>
      </div>
      <div className="studio__body">
        <EmptyState icon={Icon} title={`${tool.label} Studio`} description={`The ${tool.label.toLowerCase()} studio is ready. Connect your API key to start generating. ${tool.desc}`} />
      </div>
    </div>
  );
}

export default function StudioPage() {
  const [activeTab, setActiveTab] = useState("image");
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [favorites, setFavorites] = useState([]);

  const activeTool = TOOLS.find((t) => t.id === activeTab) || TOOLS[0];

  const filtered = search.trim()
    ? TOOLS.filter((t) => t.label.toLowerCase().includes(search.toLowerCase()) || t.desc.toLowerCase().includes(search.toLowerCase()))
    : TOOLS;

  const grouped = filtered.reduce((acc, t) => {
    acc[t.group] = acc[t.group] || [];
    acc[t.group].push(t);
    return acc;
  }, {});

  const toggleFav = (id) => {
    setFavorites((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [id, ...prev].slice(0, 6));
  };

  return (
    <div className="min-h-screen bg-surface">
      <Navbar />
      <div className="studio">
        {/* Sidebar */}
        <aside className={`studio__sidebar ${collapsed ? "!w-[64px] !min-w-[64px]" : ""}`}>
          <div className="flex items-center gap-3 p-4 border-b border-white/[0.06]">
            <Link href="/" className="flex items-center gap-2">
              <img src="/helmies-mark.svg" alt="" className="w-6 h-6" />
              {!collapsed && <span className="text-sm font-extrabold text-white">Helmies</span>}
            </Link>
            <button onClick={() => setCollapsed(!collapsed)} className="ml-auto w-7 h-7 rounded-lg border border-white/[0.08] flex items-center justify-center text-white/40 hover:text-white hover:border-white/20 text-[10px] transition-colors">
              <FaChevronRight className={collapsed ? "rotate-180" : ""} />
            </button>
          </div>

          {!collapsed && (
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06]">
              <FaSearch className="text-white/30 text-xs shrink-0" />
              <input type="text" placeholder="Find a tool..." value={search} onChange={(e) => setSearch(e.target.value)} className="flex-1 bg-transparent border-none text-sm text-white outline-none placeholder:text-white/30" />
            </div>
          )}

          {!collapsed && favorites.length > 0 && !search && (
            <div className="p-3 border-b border-white/[0.06]">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-white/40 mb-2">
                <FaStar className="text-[#FFD166] text-[10px]" /> Favorites
              </div>
              <div className="flex flex-wrap gap-1.5">
                {favorites.map((id) => {
                  const t = TOOLS.find((x) => x.id === id);
                  if (!t) return null;
                  const Icon = t.icon;
                  return (
                    <button key={id} onClick={() => setActiveTab(id)} className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold transition-all ${activeTab === id ? "bg-brand/10 text-brand border border-brand/20" : "bg-white/[0.02] text-white/60 border border-white/[0.06] hover:border-white/20"}`}>
                      <Icon style={{ color: t.color, fontSize: "10px" }} />
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <nav className="flex-1 overflow-y-auto py-2">
            {Object.entries(grouped).map(([group, tools]) => (
              <div key={group} className="mb-1">
                {!collapsed && <div className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-white/30">{group}</div>}
                {tools.map((t) => {
                  const Icon = t.icon;
                  const isActive = activeTab === t.id;
                  const isFav = favorites.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      onClick={() => setActiveTab(t.id)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-all ${isActive ? "bg-brand/5 text-white" : "text-white/60 hover:text-white hover:bg-white/[0.02]"}`}
                      title={collapsed ? t.label : undefined}
                    >
                      <span className="w-7 h-7 rounded-lg flex items-center justify-center text-xs shrink-0" style={{ color: t.color }}>
                        <Icon />
                      </span>
                      {!collapsed && (
                        <>
                          <span className="flex-1 text-[13px] font-semibold">{t.label}</span>
                          {t.badge && <span className="text-[10px] font-bold text-brand bg-brand/10 px-1.5 py-0.5 rounded-full">{t.badge}</span>}
                          <span className={`text-[10px] ${isFav ? "text-[#FFD166]" : "text-white/10 hover:text-[#FFD166]"} transition-colors`} onClick={(e) => { e.stopPropagation(); toggleFav(t.id); }}>
                            <FaStar />
                          </span>
                        </>
                      )}
                      {isActive && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r bg-brand" />}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>

          <div className="p-3 border-t border-white/[0.06]">
            <Link href="/pricing" className="flex items-center gap-2 p-2 rounded-xl hover:bg-white/[0.03] transition-colors">
              <div className="w-8 h-8 rounded-full bg-brand/15 flex items-center justify-center text-sm font-bold text-brand shrink-0">W</div>
              {!collapsed && (
                <div className="min-w-0">
                  <div className="text-[12px] font-semibold text-white truncate">Wael Helmi</div>
                  <div className="flex items-center gap-1 text-[11px] text-white/50">
                    <FaBolt className="text-[#FFD166] text-[10px]" />
                    <span>100 credits</span>
                  </div>
                </div>
              )}
            </Link>
          </div>
        </aside>

        {/* Main */}
        <main className="studio__main">
          <AnimatePresence mode="wait">
            <motion.div key={activeTab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }} className="flex-1 flex flex-col min-h-0">
              <ToolPanel tool={activeTool} />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}