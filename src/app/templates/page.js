import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import TemplatesClient from "./TemplatesClient";

const SITE = process.env.NEXTAUTH_URL || "https://studio.helmies.fi";

export const metadata = {
  title: "Templates — pre-built briefs for the studio",
  description:
    "Ready-made Helmies Studio setups: the model, the prompt, the aspect ratio and the resolution already chosen. Most are included with a paid plan; a few are one-off purchases.",
  keywords: [
    "AI templates",
    "AI prompt templates",
    "AI image templates",
    "AI video templates",
    "AI marketing templates",
    "Helmies Studio templates",
  ],
  openGraph: {
    type: "website",
    locale: "en_US",
    url: `${SITE}/templates`,
    siteName: "Helmies Studio",
    title: "Templates — pre-built briefs for the studio | Helmies Studio",
    description:
      "The model, the prompt, the aspect ratio and the resolution already chosen. Open one and it loads straight into the studio.",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Templates — Helmies Studio",
    description: "Pre-built briefs that load straight into the studio.",
    images: ["/og-image-twitter.png"],
  },
  alternates: { canonical: `${SITE}/templates` },
};

export default function TemplatesPage() {
  return (
    <>
      <a href="#main" className="hs-skip">Skip to content</a>
      <Navbar />

      <main id="main">
        <section className="hs-section hs-section--tight">
          <div className="hs-wrap">
            <header className="pg-head">
              <span className="hs-eyebrow">Templates</span>
              <h1>Someone already did the setup.</h1>
              <p>
                A template is a saved brief: the model, the prompt, the negative prompt, the
                aspect ratio and the resolution, all chosen. Open one and the studio loads
                with those settings — then you change whatever you want. The run still costs
                its normal credits.
              </p>
              <div className="pg-head__row">
                <Link href="/templates/library" className="hs-btn hs-btn--outline">Your library</Link>
                <Link href="/pricing" className="hs-btn hs-btn--outline">What a plan includes</Link>
              </div>
            </header>
          </div>
        </section>

        <section className="hs-section--tight" aria-label="Template marketplace">
          <div className="hs-wrap">
            <TemplatesClient />
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
