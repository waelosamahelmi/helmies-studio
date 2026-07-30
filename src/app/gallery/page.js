import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import GalleryClient from "./GalleryClient";

const SITE = process.env.NEXTAUTH_URL || "https://studio.helmies.fi";

export const metadata = {
  title: "Gallery — your generations and running jobs",
  description:
    "Everything you have made in Helmies Studio, newest first, with the model and the credits each run cost. Jobs still running or failed are listed at the top.",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: `${SITE}/gallery`,
    siteName: "Helmies Studio",
    title: "Gallery — your generations and running jobs | Helmies Studio",
    description:
      "Everything you have made, newest first, with the model and the credits each run cost.",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Gallery — Helmies Studio",
    description: "Your generations and the jobs still running.",
    images: ["/og-image-twitter.png"],
  },
  // Private by nature — there is nothing here for a crawler to index, but the
  // outbound links to the studio and the catalog are still worth following.
  robots: { index: false, follow: true },
  alternates: { canonical: `${SITE}/gallery` },
};

export default function GalleryPage() {
  return (
    <>
      <a href="#main" className="hs-skip">Skip to content</a>
      <Navbar />

      <main id="main">
        <section className="hs-section hs-section--tight">
          <div className="hs-wrap">
            <header className="pg-head">
              <span className="hs-eyebrow">Gallery</span>
              <h1>Everything you have made.</h1>
              <p>
                Newest first, with the model that made it and the credits it cost. Anything
                still rendering — or that failed — sits at the top of the page until it
                settles.
              </p>
              <div className="pg-head__row">
                <Link href="/studio" className="hs-btn hs-btn--primary">Open the studio</Link>
                <Link href="/models" className="hs-btn hs-btn--outline">Browse the catalog</Link>
              </div>
            </header>
          </div>
        </section>

        <section className="hs-section--tight" aria-label="Your work">
          <div className="hs-wrap">
            <GalleryClient />
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
