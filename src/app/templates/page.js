"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import UniverseNav from "@/components/studio/universe/UniverseNav";
import { IconSearch, IconSparkle, IconArrowUpRight, IconImage, IconVideo, IconMusic, IconMegaphone, IconCamera, IconFilm, IconCrown, IconUsers, IconClose } from "@/components/Icons";
import { useIsMobile } from "@/lib/use-media-query";
import { MobileChipScroller } from "@/components/studio/mobile";

const EASE = [0.32, 0.72, 0, 1];

// ── Category definitions ──
const CATEGORIES = [
  { id: null, label: "All", color: "#aa91a0" },
  { id: "creative", label: "Creative", color: "#FF1B6B" },
  { id: "social", label: "Social", color: "#00E5FF" },
  { id: "cinematic", label: "Cinematic", color: "#FF6B35" },
  { id: "audio", label: "Audio", color: "#00E68A" },
  { id: "marketing", label: "Marketing", color: "#FF1B6B" },
];

// ── Tool type definitions ──
const TOOL_TYPES = [
  { id: null, label: "All", color: "#aa91a0" },
  { id: "image", label: "Image", color: "#FF1B6B", icon: IconImage },
  { id: "video", label: "Video", color: "#7C3AED", icon: IconVideo },
  { id: "director", label: "Director", color: "#E040FB", icon: IconFilm },
  { id: "canvas", label: "Canvas", color: "#FF6B35", icon: IconImage },
  { id: "cinema", label: "Cinema", color: "#FF6B35", icon: IconCamera },
  { id: "audio", label: "Audio", color: "#00E68A", icon: IconMusic },
  { id: "marketing", label: "Marketing", color: "#FF1B6B", icon: IconMegaphone },
];

// ── Category color map ──
const CATEGORY_COLORS = {
  creative: { bg: "rgba(255,27,107,0.12)", text: "#FF4D8D", border: "rgba(255,27,107,0.25)" },
  social: { bg: "rgba(0,229,255,0.12)", text: "#33EAFF", border: "rgba(0,229,255,0.25)" },
  cinematic: { bg: "rgba(255,107,53,0.12)", text: "#FF8F6B", border: "rgba(255,107,53,0.25)" },
  audio: { bg: "rgba(0,230,138,0.12)", text: "#33EEAA", border: "rgba(0,230,138,0.25)" },
  marketing: { bg: "rgba(255,27,107,0.12)", text: "#FF4D8D", border: "rgba(255,27,107,0.25)" },
};

// ── Gradient thumbnails for templates without images ──
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

function TemplateThumbnail({ url, name, toolType, index }) {
  const gradient = THUMBNAIL_GRADIENTS[index % THUMBNAIL_GRADIENTS.length];
  if (url) {
    return (
      <div className="template-card__media">
        <img src={url} alt={name} loading="lazy" />
      </div>
    );
  }
  return (
    <div
      className="template-card__media template-card__media--gradient"
      style={{
        background: `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]})`,
      }}
    >
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="4" />
        <circle cx="9" cy="9" r="1.5" />
        <path d="M21 15l-5-5L5 21" />
      </svg>
    </div>
  );
}

function SvgIcon({ d, size = 16, color }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || "currentColor"} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

const ICON_PATHS = {
  image: "M3 3h18v18H3z M9 9h.01M15 9h.01M9 15h.01M15 15h.01",
  video: "M2 5h14v14H2z M16 10l5-3v10l-5-3",
  audio: "M9 18V5l11-2v13 M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M17 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  director: "M7 4l13 8-13 8z",
  cinema: "M3 3h18v18H3z M7 3v18M17 3v18M3 8h4M3 16h4M17 8h4M17 16h4",
  canvas: "M3 3h18v18H3z M9 9h.01M15 9h.01M9 15h.01M15 15h.01",
  marketing: "M3 11v2a1 1 0 0 0 1 1h2l8 4V6L6 10H4a1 1 0 0 0-1 1z M18 8a4 4 0 0 1 0 8",
};

// ── Skeleton Card ──
function SkeletonCard({ index }) {
  return (
    <motion.div
      className="template-card"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.35, ease: EASE }}
    >
      <div className="v6-skeleton template-card__media" style={{ minHeight: 180 }} />
      <div className="template-card__body">
        <div className="v6-skeleton v6-skeleton-text" style={{ width: "25%", height: 8 }} />
        <div className="v6-skeleton v6-skeleton-text" style={{ width: "75%", height: 14, marginBottom: 4 }} />
        <div className="v6-skeleton v6-skeleton-text" style={{ width: "100%", height: 10 }} />
        <div className="template-card__footer" style={{ marginTop: 10 }}>
          <div className="v6-skeleton v6-skeleton-text" style={{ width: "40%", height: 8 }} />
        </div>
      </div>
    </motion.div>
  );
}

// ── Template Card ──
function TemplateCard({ template, index, featured }) {
  const router = useRouter();
  const catColors = CATEGORY_COLORS[template.category] || { bg: "rgba(255,255,255,0.06)", text: "#aa91a0", border: "rgba(255,255,255,0.1)" };
  const priceLabel = template.pricingModel === "subscription" ? "Included" : template.oneTimePrice ? `€${(template.oneTimePrice / 100).toFixed(2)}` : "Free";
  const isFree = template.pricingModel === "subscription" || !template.oneTimePrice;
  const toolPath = ICON_PATHS[template.toolType] || ICON_PATHS.image;

  return (
    <motion.div
      className={`template-card ${featured ? "template-card--featured" : ""}`}
      initial={{ opacity: 0, y: 20, filter: "blur(6px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ delay: index * 0.08, duration: 0.5, ease: EASE }}
      onClick={() => router.push(`/templates/${template.slug}`)}
    >
      <TemplateThumbnail url={template.thumbnailUrl} name={template.name} toolType={template.toolType} index={index} />

      <div className="template-card__overlay">
        <span className="template-card__overlay-text">
          View details
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 17L17 7M9 7h8v8" />
          </svg>
        </span>
      </div>

      <div className="template-card__body">
        <div className="template-card__meta">
          <span
            className="template-card__category"
            style={{ background: catColors.bg, color: catColors.text, borderColor: catColors.border }}
          >
            {template.category}
          </span>
          <span className="template-card__tool" title={template.toolType}>
            <SvgIcon d={toolPath} size={13} color="rgba(255,255,255,0.55)" />
            {template.toolType}
          </span>
        </div>
        <h3 className="template-card__name">{template.name}</h3>
        <p className="template-card__desc">{template.description}</p>
        <div className="template-card__footer">
          <span className={`template-card__price ${isFree ? "template-card__price--free" : "template-card__price--paid"}`}>
            {isFree && (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12l5 5L20 6" />
              </svg>
            )}
            {priceLabel}
          </span>
          {template.isFeatured && (
            <span className="template-card__featured-badge">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3l2.7 6.3 6.8.7-5 4.8 1.4 6.7L12 18l-6 3.5 1.4-6.7-5-4.8 6.8-.7z" />
              </svg>
              Featured
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ── Main Marketplace Page ──
export default function TemplatesPage() {
  const isMobile = useIsMobile();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState(null);
  const [toolType, setToolType] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [featured, setFeatured] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [offset, setOffset] = useState(0);
  const searchRef = useRef(null);

  const fetchTemplates = useCallback(async (reset = true, extraOffset = 0) => {
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    if (toolType) params.set("toolType", toolType);
    params.set("limit", "12");
    params.set("offset", String(reset ? 0 : extraOffset));

    try {
      if (reset) {
        setLoading(true);
      }
      const res = await fetch(`/api/templates?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch templates");
      const data = await res.json();

      if (reset) {
        setTemplates(data.templates);
        // Auto-extract featured
        setFeatured(data.templates.filter((t) => t.isFeatured).slice(0, 3));
        setOffset(12);
      } else {
        setTemplates((prev) => [...prev, ...data.templates]);
        setOffset((prev) => prev + data.templates.length);
      }
      setTotal(data.total);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [category, toolType]);

  // Initial fetch
  useEffect(() => {
    fetchTemplates(true);
  }, [fetchTemplates]);

  // Client-side text search
  const filtered = search
    ? templates.filter(
        (t) =>
          t.name?.toLowerCase().includes(search.toLowerCase()) ||
          t.description?.toLowerCase().includes(search.toLowerCase())
      )
    : templates;

  const hasMore = filtered.length < total && !search;

  const handleLoadMore = async () => {
    setLoadingMore(true);
    await fetchTemplates(false, offset);
  };

  const clearFilters = () => {
    setSearch("");
    setCategory(null);
    setToolType(null);
  };

  const hasActiveFilters = category || toolType || search;

  return (
    <div className="universe-page-shell" style={{ minHeight: "100vh" }}>
      <UniverseNav />

      <div className="universe-page-shell__content">
        {/* ── Hero Section ── */}
        <motion.div
          className="templates-hero"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: EASE }}
        >
          <div className="templates-hero__text">
            <div className="templates-hero__badge">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3l2.7 6.3 6.8.7-5 4.8 1.4 6.7L12 18l-6 3.5 1.4-6.7-5-4.8 6.8-.7z" />
              </svg>
              Template Marketplace
            </div>
            <h1 className="templates-hero__title">Creative Templates</h1>
            <p className="templates-hero__sub">
              Pre-built prompts and settings for stunning AI generations. Start creating in seconds.
            </p>
          </div>
          <div className="templates-hero__visual">
            <div className="templates-hero__orb" />
            <div className="templates-hero__ring" />
            <div className="templates-hero__ring2" />
          </div>
        </motion.div>

        {/* ── Featured Section ── */}
        {!loading && !error && featured.length > 0 && !search && (
          <motion.div
            className="templates-featured"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.5, ease: EASE }}
          >
            <div className="templates-featured__head">
              <h2>Featured Templates</h2>
              <span className="templates-featured__count">{featured.length} handpicked</span>
            </div>
            <div className="templates-featured__grid">
              {featured.map((t, i) => (
                <TemplateCard key={t.id} template={t} index={i} featured />
              ))}
            </div>
          </motion.div>
        )}

        {/* ── Search & Filters ── */}
        <motion.div
          className="templates-filters"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.45, ease: EASE }}
        >
          <div className="templates-search" onClick={() => searchRef.current?.focus()}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.5-4.5" />
            </svg>
            <input
              ref={searchRef}
              type="text"
              className="templates-search__input"
              placeholder="Search templates..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button className="templates-search__clear" onClick={() => setSearch("")}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            )}
          </div>

          {/* Category pills */}
          {isMobile ? (
            <div style={{ marginBottom: 8 }}>
              <MobileChipScroller
                items={CATEGORIES.map((cat) => ({ label: cat.label, value: cat.id }))}
                selectedValue={category}
                onSelect={setCategory}
              />
            </div>
          ) : (
          <div className="universe-pills">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id ?? "all"}
                className={`universe-pill ${category === cat.id ? "is-active" : ""}`}
                style={category === cat.id ? { borderColor: cat.color, color: "#fff" } : {}}
                onClick={() => setCategory(cat.id)}
              >
                {cat.label}
              </button>
            ))}
          </div>
          )}

          {/* Tool type pills */}
          {isMobile ? (
            <div style={{ marginBottom: 8 }}>
              <MobileChipScroller
                items={TOOL_TYPES.map((tool) => ({ label: tool.label, value: tool.id }))}
                selectedValue={toolType}
                onSelect={setToolType}
              />
            </div>
          ) : (
          <div className="universe-pills">
            {TOOL_TYPES.map((tool) => (
              <button
                key={tool.id ?? "all"}
                className={`universe-pill ${toolType === tool.id ? "is-active" : ""}`}
                style={toolType === tool.id ? { borderColor: tool.color, color: "#fff" } : {}}
                onClick={() => setToolType(tool.id)}
              >
                {tool.label}
              </button>
            ))}
          </div>
          )}
        </motion.div>

        {/* ── Results Info ── */}
        <div className="templates-results-info">
          {hasActiveFilters && (
            <button className="templates-clear-filters" onClick={clearFilters}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
              Clear filters
            </button>
          )}
          <span className="templates-count">
            {total} template{total !== 1 ? "s" : ""}
            {search && ` matching "${search}"`}
          </span>
        </div>

        {/* ── Error State ── */}
        {error && (
          <div className="v6-error-state">
            <svg className="v6-icon" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4M12 16h.01" />
            </svg>
            <h3>Failed to load templates</h3>
            <p>{error}</p>
            <button className="v6-btn v6-primary" onClick={() => fetchTemplates(true)}>
              Try again
            </button>
          </div>
        )}

        {/* ── Loading Skeleton ── */}
        {loading && (
          <div className="template-grid">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} index={i} />
            ))}
          </div>
        )}

        {/* ── Template Grid ── */}
        {!loading && !error && (
          <>
            {filtered.length > 0 ? (
              <div className="template-grid">
                {filtered.map((t, i) => (
                  <TemplateCard key={t.id} template={t} index={i} featured={false} />
                ))}
              </div>
            ) : (
              <motion.div
                className="templates-empty"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
              >
                <div className="templates-empty__icon">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="7" />
                    <path d="M21 21l-4.5-4.5" />
                  </svg>
                </div>
                <h3>No templates found</h3>
                <p>Try adjusting your search or filters.</p>
                {hasActiveFilters && (
                  <button className="v6-btn" onClick={clearFilters}>
                    Clear filters
                  </button>
                )}
              </motion.div>
            )}

            {/* ── Pagination ── */}
            {hasMore && (
              <div className="templates-pagination">
                <button
                  className="v6-btn v6-primary"
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                >
                  {loadingMore ? (
                    <>
                      <span className="v6-skeleton" style={{ width: 16, height: 16, borderRadius: "50%", display: "inline-block" }} />
                      Loading...
                    </>
                  ) : (
                    <>
                      Show more
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M7 17L17 7M9 7h8v8" />
                      </svg>
                    </>
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── CSS-in-JS for template-specific styles ── */}
      <style jsx>{`
        /* ── Hero ── */
        .templates-hero {
          display: flex;
          align-items: center;
          gap: 40px;
          padding: 40px 0 32px;
          position: relative;
          overflow: hidden;
        }
        .templates-hero__text {
          flex: 1;
        }
        .templates-hero__badge {
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
          margin-bottom: 16px;
        }
        .templates-hero__title {
          font-size: clamp(2.4rem, 5vw, 3.8rem);
          font-family: var(--font-display);
          font-weight: 800;
          letter-spacing: -0.05em;
          line-height: 0.95;
          margin: 0 0 12px;
          background: linear-gradient(135deg, #fff8fc 0%, #ffbdd6 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .templates-hero__sub {
          font-size: 1rem;
          color: #aa91a0;
          max-width: 440px;
          line-height: 1.55;
          margin: 0;
        }
        .templates-hero__visual {
          position: relative;
          width: 220px;
          height: 220px;
          flex-shrink: 0;
          display: none;
        }
        @media (min-width: 768px) {
          .templates-hero__visual { display: block; }
        }
        .templates-hero__orb {
          position: absolute;
          inset: 20px;
          border-radius: 50%;
          background: radial-gradient(circle at 40% 40%, rgba(255, 27, 107, 0.25), transparent 65%);
          animation: orbPulse 3s ease-in-out infinite;
        }
        .templates-hero__ring {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          border: 1px solid rgba(255, 255, 255, 0.08);
          animation: ringSpin 20s linear infinite;
        }
        .templates-hero__ring2 {
          position: absolute;
          inset: 40px;
          border-radius: 50%;
          border: 1px dashed rgba(255, 27, 107, 0.2);
          animation: ringSpin 14s linear infinite reverse;
        }
        @keyframes orbPulse {
          0%, 100% { transform: scale(1); opacity: 0.6; }
          50% { transform: scale(1.08); opacity: 1; }
        }
        @keyframes ringSpin {
          to { transform: rotate(360deg); }
        }

        /* ── Featured ── */
        .templates-featured {
          margin-bottom: 36px;
        }
        .templates-featured__head {
          display: flex;
          align-items: baseline;
          gap: 12px;
          margin-bottom: 16px;
        }
        .templates-featured__head h2 {
          font-size: 1.15rem;
          font-weight: 700;
          margin: 0;
          letter-spacing: -0.02em;
        }
        .templates-featured__count {
          font-size: 0.7rem;
          color: #aa91a0;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        .templates-featured__grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
        }
        @media (max-width: 1050px) {
          .templates-featured__grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
        @media (max-width: 640px) {
          .templates-featured__grid {
            grid-template-columns: 1fr;
          }
        }

        /* ── Search ── */
        .templates-filters {
          margin-bottom: 28px;
        }
        .templates-search {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 16px;
          border: 1px solid rgba(255, 190, 214, 0.16);
          border-radius: 14px;
          background: rgba(21, 15, 24, 0.78);
          backdrop-filter: blur(22px);
          margin-bottom: 14px;
          cursor: text;
          transition: border-color 0.25s;
        }
        .templates-search:focus-within {
          border-color: rgba(255, 27, 107, 0.35);
        }
        .templates-search svg {
          color: #aa91a0;
          flex-shrink: 0;
        }
        .templates-search__input {
          flex: 1;
          border: none;
          background: none;
          color: #fff8fc;
          font-size: 0.85rem;
          font-family: inherit;
          outline: none;
        }
        .templates-search__input::placeholder {
          color: #aa91a0;
        }
        .templates-search__clear {
          border: none;
          background: rgba(255, 255, 255, 0.06);
          color: #aa91a0;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          display: grid;
          place-items: center;
          cursor: pointer;
          transition: 0.18s;
        }
        .templates-search__clear:hover {
          background: rgba(255, 27, 107, 0.2);
          color: #FF1B6B;
        }

        /* ── Results Info ── */
        .templates-results-info {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 16px;
        }
        .templates-clear-filters {
          display: flex;
          align-items: center;
          gap: 5px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.02);
          border-radius: 999px;
          padding: 5px 11px;
          font-size: 10px;
          color: #aa91a0;
          font-family: inherit;
          cursor: pointer;
          transition: 0.18s;
        }
        .templates-clear-filters:hover {
          border-color: rgba(255, 65, 111, 0.3);
          color: #FF416F;
        }
        .templates-count {
          font-size: 0.7rem;
          color: #aa91a0;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-left: auto;
        }

        /* ── Grid ── */
        .template-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 14px;
        }
        @media (max-width: 1050px) {
          .template-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 640px) {
          .template-grid { grid-template-columns: 1fr; }
        }

        /* ── Card ── */
        .template-card {
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
        .template-card:hover {
          transform: translateY(-4px);
          border-color: rgba(255, 27, 107, 0.3);
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.4), 0 0 30px rgba(255, 27, 107, 0.08);
        }
        .template-card--featured {
          border-color: rgba(255, 27, 107, 0.2);
        }
        .template-card__media {
          width: 100%;
          height: 180px;
          overflow: hidden;
          position: relative;
          background: rgba(255, 255, 255, 0.03);
        }
        .template-card__media img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          transition: transform 0.5s cubic-bezier(0.32,0.72,0,1);
        }
        .template-card:hover .template-card__media img {
          transform: scale(1.05);
        }
        .template-card__media--gradient {
          display: grid;
          place-items: center;
        }
        .template-card__overlay {
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0;
          transition: opacity 0.3s;
          z-index: 2;
        }
        .template-card:hover .template-card__overlay {
          opacity: 1;
        }
        .template-card__overlay-text {
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
        .template-card__body {
          padding: 14px;
        }
        .template-card__meta {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 10px;
        }
        .template-card__category {
          display: inline-flex;
          padding: 3px 8px;
          border: 1px solid;
          border-radius: 999px;
          font-size: 9px;
          font-weight: 600;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }
        .template-card__tool {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 9px;
          color: rgba(255, 255, 255, 0.5);
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .template-card__name {
          font-size: 1.05rem;
          font-weight: 700;
          letter-spacing: -0.02em;
          margin: 0 0 6px;
          line-height: 1.2;
        }
        .template-card__desc {
          font-size: 0.78rem;
          color: #aa91a0;
          line-height: 1.5;
          margin: 0;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .template-card__footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-top: 12px;
        }
        .template-card__price {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 4px 10px;
          border-radius: 999px;
          font-size: 10px;
          font-weight: 600;
        }
        .template-card__price--free {
          background: rgba(0, 230, 138, 0.1);
          color: #00E68A;
          border: 1px solid rgba(0, 230, 138, 0.2);
        }
        .template-card__price--paid {
          background: rgba(255, 255, 255, 0.05);
          color: #aa91a0;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }
        .template-card__featured-badge {
          display: inline-flex;
          align-items: center;
          gap: 3px;
          font-size: 9px;
          color: #FFB84D;
          letter-spacing: 0.03em;
        }

        /* ── Empty State ── */
        .templates-empty {
          text-align: center;
          padding: 60px 20px;
          border: 1px solid rgba(255, 190, 214, 0.14);
          border-radius: 22px;
          background: rgba(21, 15, 24, 0.5);
        }
        .templates-empty__icon {
          width: 80px;
          height: 80px;
          border: 1px solid rgba(255, 65, 111, 0.18);
          border-radius: 50%;
          display: grid;
          place-items: center;
          margin: 0 auto 20px;
          color: #aa91a0;
        }
        .templates-empty h3 {
          font-size: 1.2rem;
          margin: 0 0 6px;
        }
        .templates-empty p {
          font-size: 0.85rem;
          color: #aa91a0;
          margin: 0 0 16px;
        }

        /* ── Pagination ── */
        .templates-pagination {
          display: flex;
          justify-content: center;
          padding: 32px 0 16px;
        }
      `}</style>
    </div>
  );
}
