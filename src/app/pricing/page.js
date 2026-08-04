import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PricingPlans, { PricingFaq } from "./PricingClient";
import { CREDIT_COSTS } from "@/lib/plan-constants";

const SITE = process.env.NEXTAUTH_URL || "https://studio.helmies.fi";

export const metadata = {
  title: "Pricing — plans, credits and what a run costs",
  description:
    "Helmies Studio pricing in credits. Plans from €0 to €99/mo with 100–10,000 credits a cycle, one-off top-up packs from €9, and the credit cost of every kind of run.",
  keywords: [
    "AI studio pricing",
    "AI image generator pricing",
    "AI video generator cost",
    "AI credits",
    "Helmies Studio pricing",
    "AI subscription plans",
  ],
  openGraph: {
    type: "website",
    locale: "en_US",
    url: `${SITE}/pricing`,
    siteName: "Helmies Studio",
    title: "Pricing — plans, credits and what a run costs | Helmies Studio",
    description:
      "Plans from €0 to €99/mo with 100–10,000 credits a cycle, one-off top-up packs from €9, and the credit cost of every kind of run.",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Pricing — Helmies Studio",
    description: "Plans, one-off credit packs, and the credit cost of every kind of run.",
    images: ["/og-image-twitter.png"],
  },
  alternates: { canonical: `${SITE}/pricing` },
};

/* Baseline cost per kind of run, straight from CREDIT_COSTS. Ordered cheapest
   first so the table reads as a price list, which is what it is. */
const RUNS = [
  { key: "image", label: "Image", note: "One still from a text brief", href: "/studio/image" },
  { key: "i2i", label: "Image edit", note: "Re-render a still you supply", href: "/studio/image" },
  { key: "influencer", label: "Persona shot", note: "A character that holds across frames", href: "/studio/influencer" },
  { key: "cinema", label: "Cinema frame", note: "A still with lens and light direction", href: "/studio/cinema" },
  { key: "audio", label: "Audio", note: "Speech, music or a sound bed", href: "/studio/audio" },
  { key: "clipping", label: "Clipping", note: "Cut the moments out of a long video", href: "/studio/clipping" },
  { key: "lipsync", label: "Lip sync", note: "Match a performance to a voice track", href: "/studio/lipsync" },
  { key: "motion", label: "Motion", note: "Animate a still or restyle motion", href: "/studio/vibe-motion" },
  { key: "v2v", label: "Video → video", note: "Restyle footage you supply", href: "/studio/video-edit" },
  { key: "video", label: "Video", note: "Motion from a text brief", href: "/studio/video" },
  { key: "i2v", label: "Image → video", note: "Motion from a still you supply", href: "/studio/video" },
  { key: "recast", label: "Recast", note: "Place an identity into another scene", href: "/studio/body-swap" },
  { key: "marketing", label: "Marketing", note: "A campaign deliverable set", href: "/studio/marketing" },
];

const FAQ = [
  {
    q: "What is a credit?",
    a: "Credits are the only unit of spend in the studio. Every model in the catalog carries a credit price, and the studio quotes the exact cost of a run before you start it. There is no second currency and no per-model subscription.",
  },
  {
    q: "Do credits expire?",
    a: "No. A plan adds its credits to your balance on every billing cycle and a top-up pack adds to the same balance. Nothing is reset at the end of a month, so an unused cycle carries forward.",
  },
  {
    q: "Plan or pack — which do I want?",
    a: "A plan bills on a cycle, adds credits every cycle, and unlocks the templates marked as plan-included. A pack is one payment for a fixed number of credits and carries no template access. Packs are the cheaper per credit at the top end; plans are cheaper per credit at every tier above Starter.",
  },
  {
    q: "What happens when the balance runs out?",
    a: "The run is blocked before it starts. You are never charged for a generation you cannot afford, and you are never billed for a failed one — credits held for a job that fails are returned to the balance.",
  },
  {
    q: "Which models does a plan include?",
    a: "All of them. Every plan, Free included, reaches the whole catalog. Plans differ only in how many credits arrive each cycle. The catalog page lists the credit price of each model.",
  },
  {
    q: "Can I cancel?",
    a: "Yes. Open the billing portal from this page or from your account settings and cancel there. Credits already on your balance stay, including the ones the last cycle added.",
  },
];

export default function PricingPage() {
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  return (
    <>
      <a href="#main" className="hs-skip">Skip to content</a>
      <Navbar />

      <main id="main">
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <section className="hs-section hs-section--tight">
          <div className="hs-wrap">
            <header className="pg-head">
              <span className="hs-eyebrow">Pricing</span>
              <h1>One balance. Every model has a price on it.</h1>
              <p>
                You buy credits, either on a cycle or as a one-off pack, and spend them
                across the whole catalog. The cost of a run is quoted before it starts and
                returned to the balance if it fails.
              </p>
            </header>
          </div>
        </section>

        {/* ── Plans and packs ────────────────────────────────────────────── */}
        <section className="hs-section--tight">
          <div className="hs-wrap">
            <PricingPlans />
          </div>
        </section>

        {/* ── What a run costs ───────────────────────────────────────────── */}
        <section className="hs-section hs-section--tight" aria-labelledby="runs-h">
          <div className="hs-wrap">
            <div className="hs-head">
              <h2 id="runs-h">What a run costs</h2>
              <p>
                Baselines, in credits. The exact price depends on the model, the resolution
                and the duration you choose — the catalog lists each model, and the studio
                quotes the run before you spend.
              </p>
            </div>

            <div className="hs-table-wrap">
              <table className="hs-table">
                <caption className="hs-sr">Baseline credit cost of each kind of run</caption>
                <thead>
                  <tr>
                    <th scope="col">Run</th>
                    <th scope="col" className="hs-num">Credits</th>
                    <th scope="col">What it produces</th>
                  </tr>
                </thead>
                <tbody>
                  {RUNS.map((r) => (
                    <tr key={r.key}>
                      <th scope="row" data-label="Run">
                        <Link href={r.href}>{r.label}</Link>
                      </th>
                      <td data-label="Credits" className="hs-num" style={{ color: "var(--filament-lit)", fontWeight: 600 }}>
                        {CREDIT_COSTS[r.key]?.default ?? "—"}
                      </td>
                      <td data-label="Produces">{r.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="hs-hint" style={{ marginTop: "var(--s-4)" }}>
              <Link href="/models" style={{ color: "var(--filament-lit)", textDecoration: "underline", textUnderlineOffset: 3 }}>
                See the per-model prices in the catalog
              </Link>
            </p>
          </div>
        </section>

        {/* ── FAQ ────────────────────────────────────────────────────────── */}
        <section className="hs-section hs-section--tight" aria-labelledby="faq-h">
          <div className="hs-wrap hs-wrap--narrow">
            <div className="hs-head">
              <h2 id="faq-h">Questions people actually ask</h2>
            </div>
            <PricingFaq items={FAQ} />

            <div className="pg-head__row" style={{ marginTop: "var(--s-8)" }}>
              <Link href="/login?new=1" className="hs-btn hs-btn--primary hs-btn--lg">
                Start with 100 free credits
              </Link>
              <Link href="/contact" className="hs-btn hs-btn--outline hs-btn--lg">
                Ask about volume
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }}
      />
    </>
  );
}
