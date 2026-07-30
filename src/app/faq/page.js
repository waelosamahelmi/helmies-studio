"use client";

/* ══════════════════════════════════════════════════════════════════════════
   FAQ
   ──────────────────────────────────────────────────────────────────────────
   Search + category filter over one flat list, rendered as a .pg-faq
   accordion. Answers that quote plan sizes read them from plan-constants,
   so the FAQ cannot drift from what the checkout actually sells.
   ══════════════════════════════════════════════════════════════════════════ */

import { useMemo, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { IcSearch, IcChevron, IcClose } from "@/components/studio/kit/Icons";
import { SUBSCRIPTION_CREDITS } from "@/lib/plan-constants";

const NF = new Intl.NumberFormat("en-US");
const n = (v) => NF.format(v);

const CATEGORIES = ["All", "General", "Credits & Pricing", "Generation", "Technical", "Account"];

const FAQS = [
  // General
  {
    category: "General",
    question: "What is Helmies Studio?",
    answer:
      "Helmies Studio is an all-in-one AI creative platform that gives you access to 70+ state-of-the-art generative AI models across image, video, audio, lip sync, and more. One subscription unlocks every studio with no filters or hidden limits.",
  },
  {
    category: "General",
    question: "How does AI generation work?",
    answer:
      "You describe what you want — a text prompt, an image, a video clip — and our AI models turn that into original content. Different models specialize in different tasks: some are best for photorealistic images, others for cinematic video, and others for music or voice. You choose the model and we handle the rest.",
  },
  {
    category: "General",
    question: "What can I create with Helmies Studio?",
    answer:
      "You can generate images, videos, music, sound effects, lip-synced talking head videos, body-swap / face-recast scenes, cinematic motion graphics, marketing UGC ads, and more. There are 13 specialized studios, each tuned for a specific creative workflow.",
  },
  // Credits & Pricing
  {
    category: "Credits & Pricing",
    question: "How do credits work?",
    answer:
      "Credits are the currency of Helmies Studio. Each generation costs credits based on the model and resolution you use. Subscription plans include a monthly credit allowance, and you can also purchase one-off credit top-up packs that never expire. Your credit balance is visible in the navigation bar whenever you're signed in.",
  },
  {
    category: "Credits & Pricing",
    question: "What subscription plans are available?",
    answer:
      `We offer four subscription tiers: Free (${n(SUBSCRIPTION_CREDITS.free)} credits/mo), Starter (${n(SUBSCRIPTION_CREDITS.starter)} credits/mo at €24/mo), Studio (${n(SUBSCRIPTION_CREDITS.studio)} credits/mo at €49/mo), and Pro (${n(SUBSCRIPTION_CREDITS.pro)} credits/mo at €99/mo). Yearly billing saves you 20%. Every plan gives you access to all 70+ models and all 13 studios.`,
  },
  {
    category: "Credits & Pricing",
    question: "Can I get a refund?",
    answer:
      "Subscription payments are generally non-refundable, but we review refund requests on a case-by-case basis. If you believe there was an error in billing or you were charged after cancellation, please contact us within 14 days. Credit top-up packs are non-refundable once credits have been consumed.",
  },
  // Generation
  {
    category: "Generation",
    question: "What AI models do you use?",
    answer:
      "Helmies Studio integrates with leading AI providers to offer models including Flux, Midjourney, GPT-4o, Seedream, Sora 2, Kling v3, Veo 3, Runway, Wan 2.6, and many more. Our model catalog is updated regularly as new models become available. Visit the Models page for the full catalog.",
  },
  {
    category: "Generation",
    question: "How long does generation take?",
    answer:
      "Image generations typically complete in 3–15 seconds. Video generations take longer — anywhere from 30 seconds to a few minutes depending on the model, resolution, and duration. Audio and lip sync are usually under 30 seconds. You can continue using the platform while your generations process.",
  },
  {
    category: "Generation",
    question: "What resolutions are supported?",
    answer:
      "Resolution support varies by model. Standard resolution is available on all plans. HD resolution is available on Starter and above. 4K downloads are available on Studio and Pro plans. Some models natively support 1080p, 2K, or 4K output.",
  },
  {
    category: "Generation",
    question: "Can I use generated content commercially?",
    answer:
      "Yes. Content you generate with Helmies Studio belongs to you, and you may use it for commercial purposes including marketing, social media, client work, and products. We recommend reviewing the specific terms of any third-party model providers for edge cases, but generally: if you created it, you own it.",
  },
  // Technical
  {
    category: "Technical",
    question: "What file formats are supported?",
    answer:
      "For output: PNG and JPEG for images; MP4 and WebM for video; MP3, WAV, and OGG for audio. For upload/input: most common image, video, and audio formats are supported, including JPG, PNG, WebP, MP4, MOV, WebM, MP3, WAV, and FLAC.",
  },
  {
    category: "Technical",
    question: "Are there file size limits?",
    answer:
      "Yes. Upload limits vary by studio and model. In general, images should be under 20MB, videos under 500MB, and audio under 50MB. The platform will validate your uploads and let you know if a file exceeds the limit before generation begins.",
  },
  {
    category: "Technical",
    question: "Is my data private?",
    answer:
      "Yes. Your uploaded content and generation prompts are transmitted securely (TLS/HTTPS) to our servers and to our AI providers for processing. We do not use your content to train AI models. Generated outputs are stored privately in your account. See our Privacy Policy for full details.",
  },
  {
    category: "Technical",
    question: "What happens to my uploads?",
    answer:
      "Files you upload for generation (reference images, video clips, audio) are temporarily processed and then automatically deleted from our servers after generation completes. Your generated outputs are stored in your account gallery until you choose to delete them.",
  },
  // Account
  {
    category: "Account",
    question: "How do I cancel my subscription?",
    answer:
      "You can cancel anytime from your Billing settings page. Your subscription will remain active until the end of the current billing period, and you won't be charged again. There are no cancellation fees or long-term contracts.",
  },
  {
    category: "Account",
    question: "Can I switch plans?",
    answer:
      "Yes, you can upgrade or downgrade your subscription at any time from your Billing settings. When upgrading, you get immediate access to the higher tier and the price difference is prorated. When downgrading, the change takes effect at the end of your current billing period.",
  },
  {
    category: "Account",
    question: "How do I get support?",
    answer:
      "You can reach us through the Contact page, or email us directly at hello@helmies.fi. Pro plan subscribers get priority support. We typically respond within 24 hours on business days. For billing-specific questions, use the Billing subject when contacting us.",
  },
];

const COUNTS = FAQS.reduce((acc, f) => ({ ...acc, [f.category]: (acc[f.category] || 0) + 1 }), {});

const SCHEMA = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map((f) => ({
    "@type": "Question",
    name: f.question,
    acceptedAnswer: { "@type": "Answer", text: f.answer },
  })),
};

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export default function FaqPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [open, setOpen] = useState(() => new Set());

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return FAQS.filter((f) => {
      if (category !== "All" && f.category !== category) return false;
      if (!q) return true;
      return f.question.toLowerCase().includes(q) || f.answer.toLowerCase().includes(q);
    });
  }, [query, category]);

  const toggle = (key) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const filtering = query.trim() !== "" || category !== "All";

  return (
    <>
      <a className="hs-skip" href="#main">Skip to content</a>
      <Navbar />

      <main id="main" className="hs-wrap hs-wrap--narrow hs-section--tight">
        <header className="hs-head">
          <span className="hs-eyebrow">Help</span>
          <h1 style={{ fontSize: "var(--t-2xl)" }}>Frequently asked questions</h1>
          <p>
            How credits, models, files and billing actually work. If your question is not
            here, <Link href="/contact" style={{ color: "var(--filament-lit)", textDecoration: "underline", textUnderlineOffset: 3 }}>write to us</Link>.
          </p>
        </header>

        <div className="hs-stack" style={{ marginBottom: "var(--s-6)" }}>
          <div className="hs-field">
            <label className="hs-label" htmlFor="faq-search">Search</label>
            <div style={{ position: "relative" }}>
              <IcSearch
                className="hs-icon-sm"
                style={{
                  position: "absolute", left: "var(--s-3)", top: "50%",
                  transform: "translateY(-50%)", color: "var(--tx-mute)", pointerEvents: "none",
                }}
              />
              <input
                id="faq-search"
                className="hs-input"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="credits, resolution, refund…"
                autoComplete="off"
                style={{ paddingLeft: "var(--s-8)" }}
              />
            </div>
          </div>

          <div className="hs-chips" role="group" aria-label="Filter by category">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                className="hs-chip"
                aria-pressed={category === c}
                onClick={() => setCategory(c)}
              >
                {c}
                {c !== "All" && <span className="hs-mute">{COUNTS[c] || 0}</span>}
              </button>
            ))}
          </div>
        </div>

        <p className="hs-hint" role="status" style={{ marginBottom: "var(--s-3)" }}>
          <span className="hs-mono">{filtered.length}</span> of <span className="hs-mono">{FAQS.length}</span> questions
        </p>

        {filtered.length === 0 ? (
          <div className="hs-empty">
            <span className="hs-empty__mark"><IcSearch /></span>
            <h2 style={{ fontSize: "var(--t-lg)", fontWeight: 600 }}>Nothing matches that</h2>
            <p>Clear the filters to see all {FAQS.length} questions, or ask us directly.</p>
            <div className="hs-row">
              <button
                type="button"
                className="hs-btn"
                onClick={() => { setQuery(""); setCategory("All"); }}
              >
                <IcClose className="hs-icon-sm" />
                Clear filters
              </button>
              <Link href="/contact" className="hs-btn hs-btn--primary">Ask us</Link>
            </div>
          </div>
        ) : (
          <div className="pg-faq">
            {filtered.map((f) => {
              const id = slug(f.question);
              const isOpen = open.has(id);
              return (
                <div key={id} className="pg-faq__item">
                  <h2 style={{ margin: 0 }}>
                    <button
                      type="button"
                      className="pg-faq__q"
                      aria-expanded={isOpen}
                      aria-controls={`faq-a-${id}`}
                      id={`faq-q-${id}`}
                      onClick={() => toggle(id)}
                    >
                      <span>{f.question}</span>
                      <IcChevron />
                    </button>
                  </h2>
                  {isOpen && (
                    <div className="pg-faq__a" id={`faq-a-${id}`} role="region" aria-labelledby={`faq-q-${id}`}>
                      {f.answer}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {filtering && filtered.length > 0 && (
          <button
            type="button"
            className="hs-btn hs-btn--ghost hs-btn--sm"
            style={{ marginTop: "var(--s-5)" }}
            onClick={() => { setQuery(""); setCategory("All"); }}
          >
            <IcClose className="hs-icon-sm" />
            Clear filters
          </button>
        )}
      </main>

      <Footer />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(SCHEMA) }}
      />
    </>
  );
}
