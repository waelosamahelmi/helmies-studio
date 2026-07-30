"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import UniverseNav from "@/components/studio/universe/UniverseNav";
import ApplyTemplateButton from "@/components/templates/ApplyTemplateButton";

const EASE = [0.32, 0.72, 0, 1];

const CATEGORY_COLORS = {
  creative: { bg: "rgba(255,27,107,0.12)", text: "#FF4D8D", border: "rgba(255,27,107,0.25)" },
  social: { bg: "rgba(0,229,255,0.12)", text: "#33EAFF", border: "rgba(0,229,255,0.25)" },
  cinematic: { bg: "rgba(255,107,53,0.12)", text: "#FF8F6B", border: "rgba(255,107,53,0.25)" },
  audio: { bg: "rgba(0,230,138,0.12)", text: "#33EEAA", border: "rgba(0,230,138,0.25)" },
  marketing: { bg: "rgba(255,27,107,0.12)", text: "#FF4D8D", border: "rgba(255,27,107,0.25)" },
};

const THUMBNAIL_GRADIENTS = [
  ["#FF1B6B", "#7C3AED"],
  ["#00E5FF", "#FF6B35"],
  ["#00E68A", "#E040FB"],
  ["#FF6B35", "#FF1B6B"],
  ["#7C3AED", "#00E5FF"],
  ["#FF1B6B", "#FFD166"],
  ["#E040FB", "#FF6B35"],
  ["#00E5FF", "#00E68A"],
];

const ICON_PATHS = {
  image: "M3 3h18v18H3z M9 9h.01M15 9h.01M9 15h.01M15 15h.01",
  video: "M2 5h14v14H2z M16 10l5-3v10l-5-3",
  audio: "M9 18V5l11-2v13 M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M17 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  director: "M7 4l13 8-13 8z",
  cinema: "M3 3h18v18H3z M7 3v18M17 3v18M3 8h4M3 16h4M17 8h4M17 16h4",
  canvas: "M3 3h18v18H3z M9 9h.01M15 9h.01M9 15h.01M15 15h.01",
  marketing: "M3 11v2a1 1 0 0 0 1 1h2l8 4V6L6 10H4a1 1 0 0 0-1 1z M18 8a4 4 0 0 1 0 8",
};

function SvgIcon({ d, size = 16, color }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || "currentColor"} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

function SkeletonCard({ index }) {
  return (
    <motion.div
      className="library-card"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.35, ease: EASE }}
    >
      <div className="v6-skeleton library-card__media" style={{ minHeight: 160 }} />
      <div className="library-card__body">
        <div className="v6-skeleton v6-skeleton-text" style={{ width: "25%", height: 8 }} />
        <div className="v6-skeleton v6-skeleton-text" style={{ width: "75%", height: 14, marginBottom: 4 }} />
        <div className="v6-skeleton v6-skeleton-text" style={{ width: "100%", height: 10 }} />
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <div className="v6-skeleton v6-skeleton-text" style={{ width: "45%", height: 8 }} />
        </div>
      </div>
    </motion.div>
  );
}

function LibraryCard({ item, index }) {
  const router = useRouter();
  const template = item;
  const purchase = item.purchase;
  const catColors = CATEGORY_COLORS[template.category] || { bg: "rgba(255,255,255,0.06)", text: "#aa91a0", border: "rgba(255,255,255,0.1)" };
  const toolPath = ICON_PATHS[template.toolType] || ICON_PATHS.image;
  const gradient = THUMBNAIL_GRADIENTS[index % THUMBNAIL_GRADIENTS.length];

  const usageLabel =
    purchase.usageRemaining === null
      ? "Unlimited uses"
      : purchase.usageRemaining === 0
      ? "Used"
      : `${purchase.usageRemaining} use${purchase.usageRemaining !== 1 ? "s" : ""} remaining`;
  const isExhausted = purchase.usageRemaining !== null && purchase.usageRemaining <= 0;

  return (
    <motion.div
      className={`library-card ${isExhausted ? "library-card--exhausted" : ""}`}
      initial={{ opacity: 0, y: 20, filter: "blur(6px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ delay: index * 0.08, duration: 0.5, ease: EASE }}
      onClick={() => !isExhausted && router.push(`/templates/${template.slug}`)}
      style={{ cursor: isExhausted ? "default" : "pointer" }}
    >
      {template.thumbnailUrl ? (
        <div className="library-card__media">
          <img src={template.thumbnailUrl} alt={template.name} loading="lazy" />
        </div>
      ) : (
        <div
          className="library-card__media library-card__media--gradient"
          style={{ background: `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]})` }}
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="4" />
            <circle cx="9" cy="9" r="1.5" />
            <path d="M21 15l-5-5L5 21" />
          </svg>
        </div>
      )}

      <div className="library-card__overlay">
        {isExhausted ? (
          <span className="library-card__overlay-text library-card__overlay-text--done">All uses completed</span>
        ) : (
          <span className="library-card__overlay-text">
            View details
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 17L17 7M9 7h8v8" />
            </svg>
          </span>
        )}
      </div>

      <div className="library-card__body">
        <div className="library-card__meta">
          <span
            className="library-card__category"
            style={{ background: catColors.bg, color: catColors.text, borderColor: catColors.border }}
          >
            {template.category}
          </span>
          <span className="library-card__tool">
            <SvgIcon d={toolPath} size={11} color="rgba(255,255,255,0.5)" />
            {template.toolType}
          </span>
        </div>
        <h3 className="library-card__name">{template.name}</h3>
        <p className="library-card__desc">{template.description}</p>

        <div className="library-card__footer">
          <span className={`library-card__usage ${isExhausted ? "library-card__usage--done" : ""}`}>
            {isExhausted ? (
              <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12l5 5L20 6" />
              </svg>
            ) : (
              <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
              </svg>
            )}
            {usageLabel}
          </span>
          {!isExhausted && purchase.lastUsedAt && (
            <span className="library-card__last-used">
              Last used: {new Date(purchase.lastUsedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </span>
          )}
        </div>

        {!isExhausted && (
          <div className="library-card__action" onClick={(e) => e.stopPropagation()}>
            <ApplyTemplateButton template={template} compact />
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default function TemplatesLibraryPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const res = await fetch("/api/templates/library");
        if (res.status === 401) {
          setError("unauthorized");
          return;
        }
        if (!res.ok) throw new Error("Failed to load library");
        const data = await res.json();
        setItems(data.templates || []);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="universe-page-shell" style={{ minHeight: "100vh" }}>
      <UniverseNav />

      <div className="universe-page-shell__content">
        {/* ── Header ── */}
        <motion.div
          className="library-header"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE }}
        >
          <div>
            <div className="library-header__badge">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3l2.7 6.3 6.8.7-5 4.8 1.4 6.7L12 18l-6 3.5 1.4-6.7-5-4.8 6.8-.7z" />
              </svg>
              Your Library
            </div>
            <h1 className="library-header__title">My Templates</h1>
            <p className="library-header__sub">
              Your purchased templates and subscription content. Click to open and start creating.
            </p>
          </div>
          <Link href="/templates" className="v6-btn">
            Browse Marketplace
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 17L17 7M9 7h8v8" />
            </svg>
          </Link>
        </motion.div>

        {/* ── Loading ── */}
        {loading && (
          <div className="library-grid">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} index={i} />
            ))}
          </div>
        )}

        {/* ── Error ── */}
        {error && error !== "unauthorized" && (
          <div className="v6-error-state">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--v6-bad)" }}>
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4M12 16h.01" />
            </svg>
            <h3>Failed to load templates</h3>
            <p>{error}</p>
            <button className="v6-btn v6-primary" onClick={() => window.location.reload()}>
              Try again
            </button>
          </div>
        )}

        {/* ── Unauthorized ── */}
        {error === "unauthorized" && (
          <motion.div
            className="library-empty"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <div className="library-empty__icon">
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <h3>Sign in to view your library</h3>
            <p>Your purchased templates will appear here.</p>
            <Link href="/login" className="v6-btn v6-primary">
              Sign in
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </Link>
          </motion.div>
        )}

        {/* ── Empty ── */}
        {!loading && !error && items.length === 0 && (
          <motion.div
            className="library-empty"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <div className="library-empty__icon">
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="4" />
                <circle cx="9" cy="9" r="1.5" />
                <path d="M21 15l-5-5L5 21" />
              </svg>
            </div>
            <h3>You haven't purchased any templates yet</h3>
            <p>Browse the marketplace to find templates that match your creative style.</p>
            <Link href="/templates" className="v6-btn v6-primary">
              Browse Marketplace
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 17L17 7M9 7h8v8" />
              </svg>
            </Link>
          </motion.div>
        )}

        {/* ── Grid ── */}
        {!loading && !error && items.length > 0 && (
          <div className="library-grid">
            {items.map((item, i) => (
              <LibraryCard key={item.id || item.slug} item={item} index={i} />
            ))}
          </div>
        )}
      </div>

      <style jsx>{`
        /* ── Header ── */
        .library-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 24px;
          padding: 20px 0 28px;
          flex-wrap: wrap;
        }
        .library-header__badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 5px 12px;
          border: 1px solid rgba(255, 27, 107, 0.25);
          border-radius: 999px;
          background: rgba(255, 27, 107, 0.08);
          color: #FF1B6B;
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          margin-bottom: 12px;
        }
        .library-header__title {
          font-size: clamp(2rem, 4vw, 3rem);
          font-family: var(--font-display);
          font-weight: 800;
          letter-spacing: -0.05em;
          line-height: 0.95;
          margin: 0 0 8px;
          background: linear-gradient(135deg, #fff8fc 0%, #ffbdd6 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .library-header__sub {
          font-size: 0.88rem;
          color: #aa91a0;
          margin: 0;
          max-width: 420px;
          line-height: 1.5;
        }

        /* ── Grid ── */
        .library-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 14px;
        }
        @media (max-width: 1050px) {
          .library-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 640px) {
          .library-grid { grid-template-columns: 1fr; }
        }

        /* ── Card ── */
        .library-card {
          position: relative;
          border: 1px solid rgba(255, 190, 214, 0.14);
          border-radius: 18px;
          background: rgba(21, 15, 24, 0.7);
          backdrop-filter: blur(16px);
          overflow: hidden;
          cursor: pointer;
          transition: transform 0.3s cubic-bezier(0.32,0.72,0,1),
                      box-shadow 0.3s cubic-bezier(0.32,0.72,0,1),
                      border-color 0.3s;
        }
        .library-card:hover {
          transform: translateY(-4px);
          border-color: rgba(255, 27, 107, 0.3);
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.4), 0 0 30px rgba(255, 27, 107, 0.08);
        }
        .library-card--exhausted {
          opacity: 0.55;
        }
        .library-card--exhausted:hover {
          border-color: rgba(255, 190, 214, 0.14);
          box-shadow: none;
          transform: none;
        }
        .library-card__media {
          width: 100%;
          height: 160px;
          overflow: hidden;
          position: relative;
          background: rgba(255, 255, 255, 0.03);
        }
        .library-card__media img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          transition: transform 0.5s cubic-bezier(0.32,0.72,0,1);
        }
        .library-card:hover .library-card__media img {
          transform: scale(1.05);
        }
        .library-card__media--gradient {
          display: grid;
          place-items: center;
        }
        .library-card__overlay {
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, 0.45);
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0;
          transition: opacity 0.3s;
          z-index: 2;
          pointer-events: none;
        }
        .library-card:hover .library-card__overlay {
          opacity: 1;
        }
        .library-card__overlay-text {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 16px;
          border: 1px solid rgba(255, 255, 255, 0.3);
          border-radius: 999px;
          font-size: 12px;
          font-weight: 600;
          color: #fff;
          letter-spacing: -0.01em;
          background: rgba(255, 255, 255, 0.08);
          backdrop-filter: blur(10px);
        }
        .library-card__overlay-text--done {
          color: rgba(255, 255, 255, 0.55);
          border-color: rgba(255, 255, 255, 0.15);
          background: rgba(0, 0, 0, 0.5);
        }
        .library-card__body {
          padding: 14px;
        }
        .library-card__meta {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 10px;
        }
        .library-card__category {
          display: inline-flex;
          padding: 3px 8px;
          border: 1px solid;
          border-radius: 999px;
          font-size: 9px;
          font-weight: 600;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }
        .library-card__tool {
          display: inline-flex;
          align-items: center;
          gap: 3px;
          font-size: 8px;
          color: rgba(255, 255, 255, 0.45);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .library-card__name {
          font-size: 1rem;
          font-weight: 700;
          letter-spacing: -0.02em;
          margin: 0 0 6px;
          line-height: 1.2;
        }
        .library-card__desc {
          font-size: 0.76rem;
          color: #aa91a0;
          line-height: 1.5;
          margin: 0;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .library-card__footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-top: 10px;
          gap: 8px;
        }
        .library-card__usage {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 4px 10px;
          border-radius: 999px;
          font-size: 9px;
          font-weight: 600;
          background: rgba(0, 230, 138, 0.1);
          color: #00E68A;
          border: 1px solid rgba(0, 230, 138, 0.2);
        }
        .library-card__usage--done {
          background: rgba(255, 107, 83, 0.1);
          color: #FF8F6B;
          border-color: rgba(255, 107, 83, 0.2);
        }
        .library-card__last-used {
          font-size: 8px;
          color: rgba(255, 255, 255, 0.35);
        }
        .library-card__action {
          margin-top: 10px;
        }

        /* ── Empty ── */
        .library-empty {
          text-align: center;
          padding: 60px 20px;
          border: 1px solid rgba(255, 190, 214, 0.14);
          border-radius: 22px;
          background: rgba(21, 15, 24, 0.5);
          margin-top: 20px;
        }
        .library-empty__icon {
          width: 80px;
          height: 80px;
          border: 1px solid rgba(255, 65, 111, 0.18);
          border-radius: 50%;
          display: grid;
          place-items: center;
          margin: 0 auto 20px;
          color: #aa91a0;
        }
        .library-empty h3 {
          font-size: 1.2rem;
          margin: 0 0 6px;
        }
        .library-empty p {
          font-size: 0.85rem;
          color: #aa91a0;
          margin: 0 0 16px;
        }
      `}</style>
    </div>
  );
}
