import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import LibraryClient from "./LibraryClient";

const SITE = process.env.NEXTAUTH_URL || "https://studio.helmies.fi";

export const metadata = {
  title: "Your template library",
  description:
    "The templates attached to your Helmies Studio account — plan-included and bought outright — with how many uses each has left.",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: `${SITE}/templates/library`,
    siteName: "Helmies Studio",
    title: "Your template library | Helmies Studio",
    description: "Every template on your account, with the uses it has left.",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Your template library — Helmies Studio",
    description: "Every template on your account, with the uses it has left.",
    images: ["/og-image-twitter.png"],
  },
  // Account-scoped. Nothing to index, but the marketplace links are worth following.
  robots: { index: false, follow: true },
  alternates: { canonical: `${SITE}/templates/library` },
};

export default function TemplateLibraryPage() {
  return (
    <>
      <a href="#main" className="hs-skip">Skip to content</a>
      <Navbar />

      <main id="main">
        <section className="hs-section hs-section--tight">
          <div className="hs-wrap">
            <header className="pg-head">
              <span className="hs-eyebrow">Library</span>
              <h1>Templates on this account.</h1>
              <p>
                What your plan unlocked and what you bought, with the uses each one has
                left. Opening a template loads its settings into the studio; the generation
                itself still costs its normal credits.
              </p>
              <div className="pg-head__row">
                <Link href="/templates" className="hs-btn hs-btn--outline">Browse the marketplace</Link>
                <Link href="/studio" className="hs-btn hs-btn--outline">Open the studio</Link>
              </div>
            </header>
          </div>
        </section>

        <section className="hs-section--tight" aria-label="Your templates">
          <div className="hs-wrap">
            <LibraryClient />
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
