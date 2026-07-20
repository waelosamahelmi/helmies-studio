import "@/styles/globals.css";
import AnnouncementBar from "@/components/AnnouncementBar";

export const metadata = {
  metadataBase: new URL("https://studio.helmies.fi"),
  title: {
    default: "Helmies Studio — 200+ AI Models for Image, Video & Lip-Sync",
    template: "%s | Helmies Studio",
  },
  description:
    "Generate images with Flux & Midjourney. Animate with Sora 2 & Kling. 200+ AI models, one subscription, no content filters. Start free.",
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
    title: "Helmies Studio — 200+ AI Models for Image, Video & Lip-Sync",
    description:
      "Generate images with Flux & Midjourney. Animate with Sora 2 & Kling. 200+ AI models, one subscription, no filters.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Helmies Studio — 200+ AI Models",
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Helmies Studio — 200+ AI Models",
    description:
      "Flux, Midjourney, Sora 2, Kling, Veo, 200+ AI models in one creative studio. No filters. Start free.",
    images: ["/og-image.png"],
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
  themeColor: "#FF1B6B",
  viewport: {
    width: "device-width",
    initialScale: 1,
    maximumScale: 5,
    themeColor: "#FF1B6B",
  },
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

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/ico.svg" type="image/svg+xml" />
        <link rel="icon" href="/favicon-32x32.png" sizes="32x32" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#FF1B6B" />
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
                "AI creative suite with 200+ models for image generation, video creation, and lip-sync.",
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
      <body
        className="min-h-screen w-full antialiased"
        style={{ background: "#0A0A0F", color: "#F2F2F7" }}
      >
        <AnnouncementBar />
        {children}
      </body>
    </html>
  );
}
