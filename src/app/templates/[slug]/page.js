import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import TemplateActions from "./TemplateActions";
import TemplateRunPanel from "./TemplateRunPanel";
import { TemplateCard } from "../TemplatesClient";
import { getTemplateBySlug, listTemplates, getPublishedVersion } from "@/lib/templates";
import { auth } from "@/lib/auth";
import { getTool } from "@/components/studio/kit/tools";
import { IcInfo, IcLayers } from "@/components/studio/kit/Icons";

const SITE = process.env.NEXTAUTH_URL || "https://studio.helmies.fi";

/* The row is read twice — once for <head>, once for the body. cache() makes
   that one query per request. */
const readTemplate = cache((slug) => getTemplateBySlug(slug));

export const dynamic = "force-dynamic";

const CATEGORY_LABEL = {
  creative: "Creative",
  social: "Social",
  cinematic: "Cinematic",
  audio: "Audio",
  marketing: "Marketing",
};

/* config keys rendered separately, or not at all */
const SKIP = new Set(["prompt", "negativePrompt", "negative_prompt", "inputRequirements"]);

const label = (k) =>
  k
    .replace(/[_-]+/g, " ")
    .replace(/([A-Z])/g, (m) => ` ${m.toLowerCase()}`)
    .trim()
    .replace(/^./, (c) => c.toUpperCase());

function specs(config) {
  if (!config || typeof config !== "object") return [];
  return Object.entries(config)
    .filter(([k, v]) => !SKIP.has(k) && (typeof v === "string" || typeof v === "number" || typeof v === "boolean"))
    .slice(0, 8)
    .map(([k, v]) => [label(k), typeof v === "boolean" ? (v ? "yes" : "no") : String(v)]);
}

/* Card props only — never hand a client component the whole prisma row. */
const cardProps = (t) => ({
  id: t.id,
  slug: t.slug,
  name: t.name,
  description: t.description,
  thumbnailUrl: t.thumbnailUrl,
  category: t.category,
  toolType: t.toolType,
  pricingModel: t.pricingModel,
  oneTimePrice: t.oneTimePrice,
  usageLimit: t.usageLimit,
  isFeatured: t.isFeatured,
});

// An unpublished template is admin-preview only. Shared by generateMetadata
// and the page body below so BOTH gate the same way — metadata alone isn't
// enough: the <title>/OpenGraph/Twitter tags (browser tab, social link
// previews) would otherwise leak the real name/description of an
// unpublished template to a normal visitor even though the page BODY
// correctly renders the not-found UI.
async function canViewUnpublished() {
  const session = await auth().catch(() => null);
  return session?.user?.role === "admin";
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const t = await readTemplate(slug).catch(() => null);

  if (!t || (!t.isPublished && !(await canViewUnpublished()))) {
    return { title: "Template not found", robots: { index: false, follow: true } };
  }

  const url = `${SITE}/templates/${t.slug}`;
  const description =
    t.description?.slice(0, 300) ||
    `A pre-built ${getTool(t.toolType).label.toLowerCase()} brief for Helmies Studio.`;

  return {
    title: t.name,
    description,
    openGraph: {
      type: "article",
      locale: "en_US",
      url,
      siteName: "Helmies Studio",
      title: `${t.name} | Helmies Studio`,
      description,
      images: [{ url: t.thumbnailUrl || "/og-image.png", width: 1200, height: 630, alt: t.name }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${t.name} | Helmies Studio`,
      description,
      images: [t.thumbnailUrl || "/og-image-twitter.png"],
    },
    robots: t.isPublished ? undefined : { index: false, follow: false },
    alternates: { canonical: url },
  };
}

export default async function TemplateDetailPage({ params, searchParams }) {
  const { slug } = await params;
  const sp = (await searchParams) || {};
  const t = await readTemplate(slug);
  if (!t) notFound();

  // An unpublished template is admin-preview only — everyone else gets the
  // same 404 as a slug that doesn't exist at all (never a "not published
  // yet" leak to a normal visitor). Same gate generateMetadata uses above,
  // so the <title>/meta tags never reveal it either.
  if (!t.isPublished && !(await canViewUnpublished())) notFound();

  // Phase 6: an executable workflow template (one with a published
  // TemplateVersion) replaces the legacy purchase/access flow below with
  // TemplateRunPanel — running it costs credits directly, there is nothing
  // to "unlock" first.
  const publishedVersion = await getPublishedVersion(t.id).catch(() => null);

  const tool = getTool(t.toolType);
  const ToolIcon = tool.icon;
  const oneTime = t.pricingModel === "onetime";
  const price = Number.isFinite(t.oneTimePrice) ? `€${(t.oneTimePrice / 100).toFixed(2)}` : null;
  const singleUse = t.usageLimit === "once";
  const rows = specs(t.config);
  const need = t.config?.inputRequirements;

  const promptText = typeof t.config?.prompt === "string" ? t.config.prompt : "";
  const promptPreview = promptText.length > 240 ? `${promptText.slice(0, 240).trimEnd()}…` : promptText;

  const related = await listTemplates({ category: t.category, limit: 4 })
    .then((r) => (r.templates || []).filter((x) => x.slug !== t.slug).slice(0, 3))
    .catch(() => []);

  return (
    <>
      <a href="#main" className="hs-skip">Skip to content</a>
      <Navbar />

      <main id="main">
        <section className="hs-section hs-section--tight">
          <div className="hs-wrap">
            <p className="hs-hint" style={{ marginBottom: "var(--s-5)" }}>
              <Link href="/templates">Templates</Link>
              <span aria-hidden="true"> / </span>
              <span className="hs-dim">{CATEGORY_LABEL[t.category] || t.category}</span>
            </p>

            {!t.isPublished && (
              <div className="hs-notice hs-notice--caution" role="status" style={{ marginBottom: "var(--s-6)" }}>
                <span>This template is not published. It is not listed in the marketplace and is not indexed.</span>
              </div>
            )}

            <div className="pg-tpl-detail">
              {/* ── Left: the thing itself ─────────────────────────────── */}
              <div className="hs-stack">
                <div className="hs-card hs-card--flush">
                  <div className="pg-tpl__frame">
                    {t.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- next/image would change loading/layout behavior; deferred, out of scope for lint-only stabilization (2026-08-01)
                      <img src={t.thumbnailUrl} alt={t.name} />
                    ) : (
                      <div style={{ width: "100%", height: "100%", display: "grid", placeItems: "center", color: "var(--tx-ghost)" }}>
                        <ToolIcon style={{ width: 40, height: 40 }} />
                      </div>
                    )}
                  </div>
                </div>

                {rows.length > 0 && (
                  <section aria-labelledby="settings-h">
                    <h2 id="settings-h" className="hs-label">Settings it loads</h2>
                    <dl className="pg-tpl-spec">
                      {rows.map(([k, v]) => (
                        <div key={k}>
                          <dt>{k}</dt>
                          <dd>{v}</dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                )}

                {promptPreview && (
                  <section aria-labelledby="brief-h">
                    <h2 id="brief-h" className="hs-label">The brief</h2>
                    <div className="hs-panel-quiet" style={{ padding: "var(--s-4)" }}>
                      <p style={{ fontSize: "var(--t-sm)", lineHeight: 1.7, color: "var(--tx-dim)" }}>
                        {promptPreview}
                      </p>
                      {promptText.length > promptPreview.length && (
                        <p className="hs-hint" style={{ marginTop: "var(--s-3)" }}>
                          Preview. The full brief, including the negative prompt, loads into the
                          studio when you open the template.
                        </p>
                      )}
                    </div>
                  </section>
                )}
              </div>

              {/* ── Right: what it is, what it costs, how to run it ─────── */}
              <div className="hs-stack">
                <header className="pg-head">
                  <span className="hs-eyebrow">{CATEGORY_LABEL[t.category] || t.category}</span>
                  <h1 style={{ fontSize: "var(--t-2xl)" }}>{t.name}</h1>
                  {t.description && <p style={{ fontSize: "var(--t-base)" }}>{t.description}</p>}
                </header>

                <div className="hs-chips">
                  <span className="hs-badge hs-badge--accent">{tool.label} studio</span>
                  <span className="hs-badge">{singleUse ? "Single use" : "Unlimited uses"}</span>
                  {t.isFeatured && <span className="hs-badge">Featured</span>}
                </div>

                {need?.type && (
                  <div className="hs-notice" role="note">
                    <IcInfo className="hs-icon" />
                    <span>
                      <strong>You supply {need.type === "image" ? "an image" : `a ${need.type}`}.</strong>{" "}
                      {need.description || "The template needs your own input to run."}
                      {need.required === false ? " Optional." : ""}
                    </span>
                  </div>
                )}

                {publishedVersion ? (
                  // Phase 6 — executable workflow template: no purchase/
                  // access gate, the quote (server-computed, shown before
                  // any run) and the run itself are the whole story.
                  <div className="hs-card hs-stack">
                    <span className="hs-label">What it costs</span>
                    <TemplateRunPanel slug={t.slug} />
                  </div>
                ) : (
                  <div className="hs-card hs-stack">
                    <span className="hs-label">What it costs</span>

                    {oneTime ? (
                      <div>
                        <p className="pg-plan__amount">{price || "—"}</p>
                        <p className="hs-hint">One payment. It stays on your account.</p>
                      </div>
                    ) : (
                      <div>
                        <p style={{ fontSize: "var(--t-lg)", fontWeight: 600, color: "var(--signal)" }}>
                          Included with a paid plan
                        </p>
                        <p className="hs-hint">
                          Starter, Studio or Pro. A free account can read this page but cannot run
                          the template.
                        </p>
                      </div>
                    )}

                    <hr className="hs-rule" />

                    <p className="hs-hint">
                      Either way the generation itself spends credits at the normal rate for the
                      model this template selects —{" "}
                      <Link href="/pricing" style={{ color: "var(--filament-lit)", textDecoration: "underline", textUnderlineOffset: 2 }}>
                        see the price list
                      </Link>
                      .
                    </p>

                    <TemplateActions
                      slug={t.slug}
                      toolType={t.toolType}
                      pricingModel={t.pricingModel}
                      oneTimePrice={t.oneTimePrice}
                      purchase={typeof sp.purchase === "string" ? sp.purchase : null}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ── More in this category ──────────────────────────────────────── */}
        {related.length > 0 ? (
          <section className="hs-section hs-section--tight" aria-labelledby="related-h">
            <div className="hs-wrap">
              <div className="hs-head">
                <h2 id="related-h">
                  More {(CATEGORY_LABEL[t.category] || t.category).toLowerCase()} templates
                </h2>
              </div>
              <div className="pg-tpl">
                {related.map((r) => <TemplateCard key={r.id} t={cardProps(r)} />)}
              </div>
            </div>
          </section>
        ) : (
          <section className="hs-section--tight">
            <div className="hs-wrap">
              <div className="pg-head__row">
                <Link href="/templates" className="hs-btn hs-btn--outline">
                  <IcLayers className="hs-icon-sm" />
                  Back to all templates
                </Link>
              </div>
            </div>
          </section>
        )}
      </main>

      <Footer />
    </>
  );
}
