"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import UniverseNav from "@/components/studio/universe/UniverseNav";
import TemplatePurchaseButton from "@/components/templates/TemplatePurchaseButton";
import ApplyTemplateButton from "@/components/templates/ApplyTemplateButton";
import { IconSparkle, IconArrowUpRight, IconCheck, IconClose } from "@/components/Icons";
import { useIsMobile } from "@/lib/use-media-query";

const EASE = [0.32, 0.72, 0, 1];

const CATEGORY_COLORS = {
  creative: { bg: "rgba(255,27,107,0.12)", text: "#FF4D8D", border: "rgba(255,27,107,0.25)" },
  social: { bg: "rgba(0,229,255,0.12)", text: "#33EAFF", border: "rgba(0,229,255,0.25)" },
  cinematic: { bg: "rgba(255,107,53,0.12)", text: "#FF8F6B", border: "rgba(255,107,53,0.25)" },
  audio: { bg: "rgba(0,230,138,0.12)", text: "#33EEAA", border: "rgba(0,230,138,0.25)" },
  marketing: { bg: "rgba(255,27,107,0.12)", text: "#FF4D8D", border: "rgba(255,27,107,0.25)" },
};

const TOOL_META = {
  image: { label: "Image", color: "#FF1B6B", d: "M3 3h18v18H3z M9 9h.01M15 9h.01M9 15h.01M15 15h.01" },
  video: { label: "Video", color: "#7C3AED", d: "M2 5h14v14H2z M16 10l5-3v10l-5-3" },
  audio: { label: "Audio", color: "#00E68A", d: "M9 18V5l11-2v13 M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M17 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" },
  director: { label: "Director", color: "#E040FB", d: "M7 4l13 8-13 8z" },
  cinema: { label: "Cinema", color: "#FF6B35", d: "M3 3h18v18H3z M7 3v18M17 3v18M3 8h4M3 16h4M17 8h4M17 16h4" },
  canvas: { label: "Canvas", color: "#FF6B35", d: "M3 3h18v18H3z M9 9h.01M15 9h.01M9 15h.01M15 15h.01" },
  marketing: { label: "Marketing", color: "#FF1B6B", d: "M3 11v2a1 1 0 0 0 1 1h2l8 4V6L6 10H4a1 1 0 0 0-1 1z M18 8a4 4 0 0 1 0 8" },
};

function SvgIcon({ d, size = 18, color }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || "currentColor"} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

function SkeletonDetail() {
  return (
    <div className="template-detail-page">
      <div className="universe-page-shell__content">
        <div className="v6-skeleton v6-skeleton-text v6-short" style={{ height: 10, marginBottom: 20 }} />
        {/* hero skeleton */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 30 }}>
          <div className="v6-skeleton v6-skeleton-media" style={{ height: 320 }} />
          <div>
            <div className="v6-skeleton v6-skeleton-text" style={{ width: "20%", height: 8, marginBottom: 12 }} />
            <div className="v6-skeleton v6-skeleton-text" style={{ width: "70%", height: 28, marginBottom: 8 }} />
            <div className="v6-skeleton v6-skeleton-text" style={{ width: "100%", height: 14 }} />
            <div className="v6-skeleton v6-skeleton-text" style={{ width: "80%", height: 14, marginBottom: 20 }} />
          </div>
        </div>
        {/* settings skeleton */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, marginBottom: 20 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="v6-skeleton" style={{ height: 80, borderRadius: 14 }} />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function TemplateDetailPage() {
  const isMobile = useIsMobile();
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const slug = params?.slug;

  const [template, setTemplate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hasAccess, setHasAccess] = useState(false);
  const [purchaseSuccess, setPurchaseSuccess] = useState(false);

  useEffect(() => {
    if (!slug) return;
    async function load() {
      try {
        setLoading(true);
        const res = await fetch(`/api/templates/${slug}`);
        if (!res.ok) throw new Error(res.status === 404 ? "Template not found" : "Failed to load template");
        const data = await res.json();
        setTemplate(data);
        setHasAccess(data.hasAccess || false);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [slug]);

  // Handle Stripe checkout return
  useEffect(() => {
    const purchase = searchParams.get("purchase");
    const sessionId = searchParams.get("session_id");

    if (purchase === "success" && sessionId) {
      async function verify() {
        try {
          await fetch(`/api/templates/purchase/verify?session_id=${sessionId}`);
          setPurchaseSuccess(true);
          setHasAccess(true);
          // Refresh template data
          const res = await fetch(`/api/templates/${slug}`);
          if (res.ok) {
            const data = await res.json();
            setTemplate(data);
          }
        } catch { /* silently handle */ }
      }
      verify();
    }
  }, [searchParams, slug]);

  if (loading) return <SkeletonDetail />;

  if (error) {
    return (
      <div className="universe-page-shell" style={{ minHeight: "100vh" }}>
        <UniverseNav />
        <div className="universe-page-shell__content">
          <div className="v6-error-state" style={{ paddingTop: 60 }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--v6-bad)" }}>
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4M12 16h.01" />
            </svg>
            <h3>{error === "Template not found" ? "Template not found" : "Something went wrong"}</h3>
            <p>{error === "Template not found" ? "This template may have been removed." : error}</p>
            <Link href="/templates" className="v6-btn v6-primary">
              Back to Marketplace
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!template) return null;

  const catColors = CATEGORY_COLORS[template.category] || { bg: "rgba(255,255,255,0.06)", text: "#aa91a0", border: "rgba(255,255,255,0.1)" };
  const toolMeta = TOOL_META[template.toolType] || TOOL_META.image;
  const config = template.config || {};
  const isSubscription = template.pricingModel === "subscription";
  const priceDisplay = template.oneTimePrice ? `€${(template.oneTimePrice / 100).toFixed(2)}` : null;

  return (
    <div className="universe-page-shell" style={{ minHeight: "100vh" }}>
      <UniverseNav />

      <div className="universe-page-shell__content template-detail-page">
        {/* ── Breadcrumb ── */}
        <motion.div
          className="template-breadcrumb"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: EASE }}
        >
          <Link href="/templates">Marketplace</Link>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 6l6 6-6 6" />
          </svg>
          <span style={{ color: "#FF416F" }}>{template.category}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 6l6 6-6 6" />
          </svg>
          <span>{template.name}</span>
        </motion.div>

        {/* ── Success Banner ── */}
        {purchaseSuccess && (
          <motion.div
            className="template-success"
            initial={{ opacity: 0, y: -8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            transition={{ duration: 0.4, ease: EASE }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 12l5 5L20 6" />
            </svg>
            <div>
              <strong>Payment successful!</strong>
              <span>This template is now available in your library.</span>
            </div>
            <button onClick={() => setPurchaseSuccess(false)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </motion.div>
        )}

        {/* ── Hero Section ── */}
        <motion.div
          className="template-detail-hero"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.45, ease: EASE }}
        >
          <div className="template-detail-hero__media" style={isMobile ? { minHeight: 180, width: "100%" } : {}}>
            {template.thumbnailUrl ? (
              <img src={template.thumbnailUrl} alt={template.name} style={isMobile ? { objectFit: "cover", width: "100%", height: "100%" } : {}} />
            ) : (
              <div className="template-detail-hero__placeholder" style={isMobile ? { minHeight: 180 } : {}}>
                <SvgIcon d={toolMeta.d} size={48} color="rgba(255,255,255,0.3)" />
              </div>
            )}
            <div className="template-detail-hero__badge">
              <span
                className="template-detail-hero__category"
                style={{ background: catColors.bg, color: catColors.text, borderColor: catColors.border }}
              >
                {template.category}
              </span>
            </div>
          </div>

          <div className="template-detail-hero__info">
            <h1 className="template-detail-hero__title">{template.name}</h1>
            <p className="template-detail-hero__desc">{template.description}</p>

            <div className="template-detail-hero__meta">
              <div className="template-detail-hero__tool" style={{ borderColor: `${toolMeta.color}33` }}>
                <span className="template-detail-hero__tool-icon" style={{ background: `${toolMeta.color}18`, color: toolMeta.color }}>
                  <SvgIcon d={toolMeta.d} size={16} color={toolMeta.color} />
                </span>
                <div>
                  <span className="template-detail-hero__meta-label">Tool</span>
                  <span className="template-detail-hero__meta-value">{toolMeta.label}</span>
                </div>
              </div>
              <div className="template-detail-hero__tool" style={{ borderColor: `${isSubscription ? "#00E68A" : "#FF416F"}33` }}>
                <span className="template-detail-hero__tool-icon" style={{ background: isSubscription ? "rgba(0,230,138,0.12)" : "rgba(255,65,111,0.12)", color: isSubscription ? "#00E68A" : "#FF416F" }}>
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <path d={isSubscription ? "M12 22c5.5 0 10-4.5 10-10S17.5 2 12 2 2 6.5 2 12s4.5 10 10 10z" : "M9 5h6v2l2 3-2 3v2H9v-2l-2-3 2-3z"} />
                  </svg>
                </span>
                <div>
                  <span className="template-detail-hero__meta-label">Pricing</span>
                  <span className="template-detail-hero__meta-value">{isSubscription ? "Included" : priceDisplay || "Free"}</span>
                </div>
              </div>
            </div>

            {/* ── Purchase / Apply CTA ── */}
            <div className="template-detail-hero__actions">
              {hasAccess ? (
                <ApplyTemplateButton template={template} />
              ) : (
                <TemplatePurchaseButton
                  template={template}
                  onSuccess={() => {
                    setHasAccess(true);
                    setPurchaseSuccess(true);
                  }}
                />
              )}
            </div>
          </div>
        </motion.div>

        {/* ── Settings Preview ── */}
        <motion.div
          className="template-settings"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.45, ease: EASE }}
        >
          <h2 className="template-section-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
            </svg>
            Pre-configured Settings
          </h2>

          <div className="template-settings__grid">
            {/* Tool Type */}
            <div className="template-setting-card">
              <div className="template-setting-card__icon">
                <SvgIcon d={toolMeta.d} size={16} color={toolMeta.color} />
              </div>
              <div className="template-setting-card__content">
                <span className="template-setting-card__label">Tool Type</span>
                <span className="template-setting-card__value">{toolMeta.label}</span>
              </div>
            </div>

            {/* Model */}
            {config.model && (
              <div className="template-setting-card">
                <div className="template-setting-card__icon">
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#C084FC" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 3l2.7 6.3 6.8.7-5 4.8 1.4 6.7L12 18l-6 3.5 1.4-6.7-5-4.8 6.8-.7z" />
                  </svg>
                </div>
                <div className="template-setting-card__content">
                  <span className="template-setting-card__label">Model</span>
                  <span className="template-setting-card__value template-setting-card__value--mono">{String(config.model)}</span>
                </div>
              </div>
            )}

            {/* Aspect Ratio */}
            {config.aspectRatio && (
              <div className="template-setting-card">
                <div className="template-setting-card__icon">
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#00E5FF" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="3" />
                    <path d="M3 9h18M9 21V9" />
                  </svg>
                </div>
                <div className="template-setting-card__content">
                  <span className="template-setting-card__label">Aspect Ratio</span>
                  <span className="template-setting-card__value">{String(config.aspectRatio)}</span>
                </div>
              </div>
            )}

            {/* Resolution */}
            {config.resolution && (
              <div className="template-setting-card">
                <div className="template-setting-card__icon">
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#FF6B35" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="3" />
                    <path d="M9 9h.01M15 9h.01M9 15h.01M15 15h.01" />
                  </svg>
                </div>
                <div className="template-setting-card__content">
                  <span className="template-setting-card__label">Resolution</span>
                  <span className="template-setting-card__value">{String(config.resolution)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Prompt Preview */}
          {config.prompt && (
            <div className="template-prompt-preview">
              <div className="template-prompt-preview__head">
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
                </svg>
                <span>Prompt Template</span>
              </div>
              <pre className="template-prompt-preview__code">{String(config.prompt)}</pre>
            </div>
          )}

          {/* Negative Prompt */}
          {config.negativePrompt && (
            <div className="template-prompt-preview template-prompt-preview--negative">
              <div className="template-prompt-preview__head">
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 8v4M12 16h.01" />
                </svg>
                <span>Negative Prompt</span>
              </div>
              <pre className="template-prompt-preview__code">{String(config.negativePrompt)}</pre>
            </div>
          )}

          {/* Input Requirements */}
          {config.inputType && (
            <div className="template-input-requirements">
              <div className="template-input-requirements__head">
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
                </svg>
                <span>Input Requirements</span>
              </div>
              <p>{String(config.inputType)}</p>
            </div>
          )}
        </motion.div>

        {/* ── Related Templates ── */}
        <motion.div
          className="template-related"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.45, ease: EASE }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <h2 className="template-section-title" style={{ margin: 0 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
              </svg>
              More {template.category} templates
            </h2>
            <Link href={`/templates?category=${template.category}`} className="template-related__link">
              View all
              <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </Link>
          </div>
          <RelatedTemplates slug={slug} category={template.category} />
        </motion.div>
      </div>

      <style jsx>{`
        .template-detail-page {
          animation: v6-fade-in 0.4s ease-out both;
        }

        /* ── Breadcrumb ── */
        .template-breadcrumb {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.78rem;
          color: #aa91a0;
          margin-bottom: 24px;
        }
        .template-breadcrumb a {
          transition: color 0.18s;
        }
        .template-breadcrumb a:hover {
          color: #FF416F;
        }

        /* ── Success Banner ── */
        .template-success {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 18px;
          background: rgba(0, 230, 138, 0.08);
          border: 1px solid rgba(0, 230, 138, 0.25);
          border-radius: 14px;
          margin-bottom: 20px;
          color: #00E68A;
        }
        .template-success > div {
          flex: 1;
        }
        .template-success strong {
          display: block;
          font-size: 0.85rem;
        }
        .template-success span {
          font-size: 0.72rem;
          color: rgba(0, 230, 138, 0.7);
        }
        .template-success button {
          border: none;
          background: rgba(255, 255, 255, 0.06);
          color: #aa91a0;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          display: grid;
          place-items: center;
          cursor: pointer;
        }

        /* ── Hero ── */
        .template-detail-hero {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 32px;
          padding: 28px;
          border: 1px solid rgba(255, 190, 214, 0.16);
          border-radius: 22px;
          background: rgba(21, 15, 24, 0.78);
          backdrop-filter: blur(22px);
          margin-bottom: 28px;
        }
        @media (max-width: 860px) {
          .template-detail-hero {
            grid-template-columns: 1fr;
          }
        }
        .template-detail-hero__media {
          position: relative;
          border-radius: 16px;
          overflow: hidden;
          min-height: 260px;
          background: rgba(255, 255, 255, 0.03);
        }
        .template-detail-hero__media img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          position: absolute;
          inset: 0;
        }
        .template-detail-hero__placeholder {
          width: 100%;
          height: 100%;
          min-height: 260px;
          display: grid;
          place-items: center;
          background: linear-gradient(135deg, rgba(255, 27, 107, 0.12), rgba(124, 58, 237, 0.12));
        }
        .template-detail-hero__badge {
          position: absolute;
          top: 12px;
          left: 12px;
          display: flex;
          gap: 6px;
        }
        .template-detail-hero__category {
          display: inline-flex;
          padding: 4px 10px;
          border: 1px solid;
          border-radius: 999px;
          font-size: 9px;
          font-weight: 600;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }
        .template-detail-hero__info {
          display: flex;
          flex-direction: column;
          justify-content: center;
        }
        .template-detail-hero__title {
          font-size: clamp(1.8rem, 3vw, 2.6rem);
          font-weight: 800;
          letter-spacing: -0.045em;
          line-height: 1.05;
          margin: 0 0 10px;
        }
        .template-detail-hero__desc {
          font-size: 0.9rem;
          color: #aa91a0;
          line-height: 1.6;
          margin: 0 0 20px;
        }
        .template-detail-hero__meta {
          display: flex;
          gap: 10px;
          margin-bottom: 22px;
        }
        .template-detail-hero__tool {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 14px;
          border: 1px solid;
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.02);
        }
        .template-detail-hero__tool-icon {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          display: grid;
          place-items: center;
          flex-shrink: 0;
          border: 1px solid rgba(255, 255, 255, 0.08);
        }
        .template-detail-hero__meta-label {
          display: block;
          font-size: 8px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: #aa91a0;
        }
        .template-detail-hero__meta-value {
          font-size: 0.78rem;
          font-weight: 600;
        }
        .template-detail-hero__actions {
          display: flex;
          gap: 10px;
        }

        /* ── Section Title ── */
        .template-section-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 1.05rem;
          font-weight: 700;
          margin: 0 0 14px;
          letter-spacing: -0.02em;
        }
        .template-section-title svg {
          color: #FF416F;
        }

        /* ── Settings ── */
        .template-settings {
          padding: 28px;
          border: 1px solid rgba(255, 190, 214, 0.16);
          border-radius: 22px;
          background: rgba(21, 15, 24, 0.78);
          backdrop-filter: blur(22px);
          margin-bottom: 28px;
        }
        .template-settings__grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 10px;
          margin-bottom: 18px;
        }
        @media (max-width: 640px) {
          .template-settings__grid {
            grid-template-columns: 1fr;
          }
        }
        .template-setting-card {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.02);
        }
        .template-setting-card__icon {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          display: grid;
          place-items: center;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          flex-shrink: 0;
        }
        .template-setting-card__content {
          min-width: 0;
        }
        .template-setting-card__label {
          display: block;
          font-size: 8px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: #aa91a0;
          margin-bottom: 2px;
        }
        .template-setting-card__value {
          font-size: 0.82rem;
          font-weight: 600;
        }
        .template-setting-card__value--mono {
          font-family: var(--font-mono, "JetBrains Mono", monospace);
          font-size: 0.7rem;
          color: #C084FC;
        }

        /* ── Prompt Preview ── */
        .template-prompt-preview {
          padding: 16px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 14px;
          background: rgba(0, 0, 0, 0.2);
          margin-bottom: 12px;
        }
        .template-prompt-preview--negative {
          border-color: rgba(255, 107, 83, 0.2);
          background: rgba(255, 107, 83, 0.03);
        }
        .template-prompt-preview__head {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 10px;
          font-weight: 600;
          color: #aa91a0;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 10px;
        }
        .template-prompt-preview__code {
          font-family: var(--font-mono, "JetBrains Mono", monospace);
          font-size: 0.8rem;
          line-height: 1.6;
          color: #c4b0bf;
          margin: 0;
          white-space: pre-wrap;
          word-break: break-word;
          background: rgba(0, 0, 0, 0.3);
          border-radius: 10px;
          padding: 14px;
          border-left: 3px solid #FF416F;
        }
        .template-prompt-preview--negative .template-prompt-preview__code {
          border-left-color: #FF6B35;
        }

        /* ── Input Requirements ── */
        .template-input-requirements {
          padding: 14px;
          border: 1px solid rgba(0, 229, 255, 0.15);
          border-radius: 14px;
          background: rgba(0, 229, 255, 0.03);
        }
        .template-input-requirements__head {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 10px;
          font-weight: 600;
          color: #00E5FF;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 6px;
        }
        .template-input-requirements p {
          font-size: 0.82rem;
          color: #c4b0bf;
          margin: 0;
          line-height: 1.5;
        }

        /* ── Related ── */
        .template-related {
          margin-bottom: 40px;
        }
        .template-related__link {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 0.78rem;
          color: #FF416F;
          font-weight: 500;
          transition: gap 0.2s;
        }
        .template-related__link:hover {
          gap: 8px;
        }
      `}</style>
    </div>
  );
}

/* ── Related Templates Sub-component ── */
function RelatedTemplates({ slug, category }) {
  const [related, setRelated] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/templates?category=${category}&limit=4`);
        if (res.ok) {
          const data = await res.json();
          setRelated(data.templates.filter((t) => t.slug !== slug).slice(0, 3));
        }
      } catch { /* silently fail */ }
      finally { setLoading(false); }
    }
    load();
  }, [slug, category]);

  if (loading) {
    return (
      <div className="template-related-grid">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="v6-skeleton v6-skeleton-card" style={{ minHeight: 200 }} />
        ))}
      </div>
    );
  }

  if (related.length === 0) return null;

  return (
    <div className="template-related-grid">
      {related.map((t) => (
        <RelatedCard key={t.id} template={t} />
      ))}
    </div>
  );
}

function RelatedCard({ template }) {
  const router = useRouter();
  const catColors = CATEGORY_COLORS[template.category] || { bg: "rgba(255,255,255,0.06)", text: "#aa91a0", border: "rgba(255,255,255,0.1)" };
  const isFree = template.pricingModel === "subscription" || !template.oneTimePrice;

  return (
    <motion.div
      className="template-card"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: EASE }}
      onClick={() => router.push(`/templates/${template.slug}`)}
    >
      <div className="template-card__body">
        <span
          className="template-card__category"
          style={{ background: catColors.bg, color: catColors.text, borderColor: catColors.border }}
        >
          {template.category}
        </span>
        <h3 className="template-card__name" style={{ marginTop: 8 }}>{template.name}</h3>
        <p className="template-card__desc">{template.description}</p>
        <div className="template-card__footer">
          <span className={`template-card__price ${isFree ? "template-card__price--free" : "template-card__price--paid"}`}>
            {isFree ? "Included" : template.oneTimePrice ? `€${(template.oneTimePrice / 100).toFixed(2)}` : "Free"}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

// Re-use card styles from marketplace
const cardStyles = `
  .template-related-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 14px;
  }
  @media (max-width: 1050px) {
    .template-related-grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 640px) {
    .template-related-grid { grid-template-columns: 1fr; }
  }
`;
