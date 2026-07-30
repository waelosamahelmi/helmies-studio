"use client";

import { useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Navbar from "@/components/Navbar";
import { IconSearch, IconChevron } from "@/components/Icons";
import { useIsMobile } from "@/lib/use-media-query";
import { MobileChipScroller } from "@/components/studio/mobile";

const EASE = [0.32, 0.72, 0, 1];

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
      "We offer four subscription tiers: Free (10 credits/mo), Starter (500 credits/mo at €24/mo), Studio (1,500 credits/mo at €49/mo), and Pro (5,000 credits/mo at €99/mo). Yearly billing saves you 20%. Every plan gives you access to all 70+ models and all 13 studios.",
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

export default function FAQPage() {
  const isMobile = useIsMobile();
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [openItems, setOpenItems] = useState(new Set());

  const filtered = useMemo(() => {
    return FAQS.filter((faq) => {
      if (activeCategory !== "All" && faq.category !== activeCategory) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          faq.question.toLowerCase().includes(q) ||
          faq.answer.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [search, activeCategory]);

  const toggleItem = useCallback((index) => {
    setOpenItems((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  const counts = useMemo(() => {
    const c = {};
    FAQS.forEach((faq) => {
      c[faq.category] = (c[faq.category] || 0) + 1;
    });
    return c;
  }, []);

  return (
    <>
      <Navbar />
      <div className="grain" aria-hidden="true" />

      <motion.div
        className="page"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: EASE }}
      >
        <div className="page__head">
          <div className="eyebrow mb-5">Help Center</div>
          <h1 className="page__title">
            Frequently <em>Asked</em> Questions
          </h1>
          <p className="page__sub">
            Find answers to common questions about Helmies Studio.
          </p>
        </div>

        {/* Search */}
        <div className="v6-faq-search">
          <div className="field" style={{ maxWidth: isMobile ? "100%" : 560, margin: "0 auto" }}>
            <span className="field__icon">
              <IconSearch />
            </span>
            <input
              type="text"
              placeholder="Search FAQ..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={isMobile ? { height: 44, fontSize: 14 } : {}}
            />
          </div>
        </div>

        {/* Category pills */}
        {isMobile ? (
          <div style={{ marginBottom: 16 }}>
            <MobileChipScroller
              items={CATEGORIES.map((cat) => ({ label: `${cat}${cat !== "All" ? ` (${counts[cat] || 0})` : ""}`, value: cat }))}
              selectedValue={activeCategory}
              onSelect={setActiveCategory}
            />
          </div>
        ) : (
        <div className="v6-faq-categories" style={{ justifyContent: "center" }}>
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              className={`pill ${activeCategory === cat ? "pill--active" : ""}`}
              onClick={() => setActiveCategory(cat)}
            >
              {cat}
              {cat !== "All" && (
                <span className="pill__count">{counts[cat] || 0}</span>
              )}
            </button>
          ))}
        </div>
        )}

        {/* FAQ items */}
        <div className="v6-faq">
          {filtered.length === 0 ? (
            <div className="v6-faq-empty">
              <svg
                className="v6-faq-empty-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4.5-4.5" />
              </svg>
              <p>No FAQ items match your search.</p>
            </div>
          ) : (
            filtered.map((faq, i) => {
              const isOpen = openItems.has(i);
              return (
                <motion.div
                  key={i}
                  className={`v6-faq-item ${isOpen ? "v6-faq-item--open" : ""}`}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-20px" }}
                  transition={{ duration: 0.5, ease: EASE, delay: i * 0.03 }}
                >
                  <button
                    className="v6-faq-question"
                    onClick={() => toggleItem(i)}
                    aria-expanded={isOpen}
                  >
                    <span>{faq.question}</span>
                    <svg
                      className="v6-faq-chevron"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        className="v6-faq-answer"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.35, ease: EASE }}
                      >
                        <div className="v6-faq-answer-inner">{faq.answer}</div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })
          )}
        </div>
      </motion.div>
    </>
  );
}
