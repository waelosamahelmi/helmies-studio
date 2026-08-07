import "@/styles/system.css";
import "@/styles/studio.css";
import "@/styles/pages.css";
import Providers from "@/components/Providers";

export const metadata = {
  metadataBase: new URL("https://studio.helmies.fi"),
  title: {
    default: "Helmies Studio — 130+ AI Models for Image, Video & Lip-Sync",
    template: "%s | Helmies Studio",
  },
  description:
    "Generate images with Flux & Midjourney. Animate with Sora 2 & Kling. 130+ AI models, one subscription, no content filters. Start free.",
  keywords: [
    "AI image generator",
    "AI video generator",
    "AI lip sync",
    "Flux AI",
    "Midjourney",
    "Sora 2",
    "Kling AI",
    "Veo 3",
    "AI creative suite",
    "Helmies Studio",
    "no filter AI",
    "AI content creation",
  ],
  authors: [{ name: "Helmies Oy", url: "https://helmies.fi" }],
  creator: "Helmies Oy",
  publisher: "Helmies Oy",
  formatDetection: { telephone: false, email: false, address: false },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://studio.helmies.fi",
    siteName: "Helmies Studio",
    title: "Helmies Studio — 130+ AI Models for Image, Video & Lip-Sync",
    description:
      "Generate images with Flux & Midjourney. Animate with Sora 2 & Kling. 130+ AI models, one subscription, no filters.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Helmies Studio — 130+ AI Models",
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Helmies Studio — 130+ AI Models",
    description:
      "Flux, Midjourney, Sora 2, Kling, Veo, 130+ AI models in one creative studio. No filters. Start free.",
    images: ["/og-image-twitter.png"],
    creator: "@helmies",
  },
  icons: {
    icon: [
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-48x48.png", sizes: "48x48", type: "image/png" },
      { url: "/ico.svg", type: "image/svg+xml" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
    other: [
      { url: "/favicon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/favicon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
  },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Helmies Studio",
  },
  other: {
    "mobile-web-app-capable": "yes",
    "msapplication-TileColor": "#FF1B6B",
    "msapplication-config": "none",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  // Pinch-zoom stays available — blocking it fails WCAG 1.4.4 and makes the
  // canvas and timeline tools unusable for anyone who needs to magnify.
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
  // S3: the browser chrome tint follows the OS preference. (It cannot follow
  // the in-app toggle — this is static metadata — but matching the system is
  // right for the no-choice majority and harmless for the rest.)
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F4F4F7" },
    { media: "(prefers-color-scheme: dark)", color: "#08080C" },
  ],
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* S3 light mode — theme init, FIRST thing in <head> so it runs
            before any paint. Reads the stored choice ("helmies.theme"),
            falls back to prefers-color-scheme, and stamps
            document.documentElement.dataset.theme, which the
            [data-theme="light"] token block in system.css keys off.
            Synchronous inline script = zero flash; the CSP already carries
            script-src 'unsafe-inline' for this file's ld+json blocks (see
            next.config.js). suppressHydrationWarning on <html> above covers
            the attribute React never renders. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              '(function(){var t;try{t=localStorage.getItem("helmies.theme")}catch(e){}if(t!=="light"&&t!=="dark"){t=window.matchMedia&&window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"}document.documentElement.dataset.theme=t})()',
          }}
        />
        <link rel="icon" href="/ico.svg" type="image/svg+xml" />
        <link rel="icon" href="/favicon-32x32.png" sizes="32x32" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="msapplication-TileColor" content="#FF1B6B" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              name: "Helmies Studio",
              url: "https://studio.helmies.fi",
              applicationCategory: "MultimediaApplication",
              operatingSystem: "Web",
              description:
                "AI creative suite with 130+ models for image generation, video creation, and lip-sync.",
              offers: {
                "@type": "AggregateOffer",
                lowPrice: "0",
                highPrice: "99",
                priceCurrency: "EUR",
                offerCount: "4",
              },
              author: {
                "@type": "Organization",
                name: "Helmies Oy",
                url: "https://helmies.fi",
              },
            }),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebSite",
              name: "Helmies Studio",
              url: "https://studio.helmies.fi",
              potentialAction: {
                "@type": "SearchAction",
                target: "https://studio.helmies.fi/search?q={search_term_string}",
                "query-input": "required name=search_term_string",
              },
            }),
          }}
        />
      </head>
      <body className="min-h-screen w-full antialiased">
        {/* EDITSv1 E8.2: AnnouncementBar used to be rendered right here, in
            the page tree, where the studio shell covered it on every
            /studio route. It is now mounted inside Providers alongside
            OfflineBanner — see that component's header. */}
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
