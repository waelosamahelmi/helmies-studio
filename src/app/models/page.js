import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import ModelsClient from "./ModelsClient";

const SITE = process.env.NEXTAUTH_URL || "https://studio.helmies.fi";

export const metadata = {
  title: "Model catalog — every model and what it costs",
  description:
    "The full Helmies Studio model catalog: image, video, image-to-video, video-to-video, lip sync and audio models with their credit price, supported aspect ratios, resolutions and durations.",
  keywords: [
    "AI model catalog",
    "AI image models",
    "AI video models",
    "Flux",
    "Midjourney",
    "Sora 2",
    "Kling AI",
    "Veo 3",
    "Wan 2.7",
    "AI model pricing",
  ],
  openGraph: {
    type: "website",
    locale: "en_US",
    url: `${SITE}/models`,
    siteName: "Helmies Studio",
    title: "Model catalog — every model and what it costs | Helmies Studio",
    description:
      "Image, video, image-to-video, lip sync and audio models with their credit price, aspect ratios, resolutions and durations.",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Model catalog — Helmies Studio",
    description: "Every model in the studio, with its credit price and capabilities.",
    images: ["/og-image-twitter.png"],
  },
  alternates: { canonical: `${SITE}/models` },
};

export default function ModelsPage() {
  return (
    <>
      <a href="#main" className="hs-skip">Skip to content</a>
      <Navbar />

      <main id="main">
        <section className="hs-section hs-section--tight">
          <div className="hs-wrap">
            <header className="pg-head">
              <span className="hs-eyebrow">Catalog</span>
              <h1>Every model on the floor, with its price.</h1>
              <p>
                One catalog, one balance. Each card shows what the model does, who runs it,
                what it costs per run in credits, and the sizes and durations it accepts.
                Pick one and it opens in the studio that drives it.
              </p>
              <div className="pg-head__row">
                <Link href="/studio" className="hs-btn hs-btn--primary">Open the studio</Link>
                <Link href="/pricing" className="hs-btn hs-btn--outline">See what credits cost</Link>
              </div>
            </header>
          </div>
        </section>

        <section className="hs-section--tight" aria-label="Model catalog">
          <div className="hs-wrap">
            <ModelsClient />
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
