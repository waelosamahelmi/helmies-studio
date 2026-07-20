import "@/styles/globals.css";
import AnnouncementBar from "@/components/AnnouncementBar";

export const metadata = {
  metadataBase: new URL("https://studio.helmies.fi"),
  title: {
    default: "Helmies Studio, 200+ AI Models for Image, Video & Lip-Sync",
    template: "%s · Helmies Studio",
  },
  description: "Helmies Studio, 200+ AI models for image, video & lip-sync. Flux, Midjourney, Sora 2, Kling, Veo. One subscription, no content filters. Start free.",
  keywords: ["AI image generator", "AI video generator", "AI lip sync", "Flux AI", "Midjourney", "Sora 2", "Kling AI", "Veo 3", "AI creative suite", "Helmies Studio"],
  openGraph: {
    type: "website",
    locale: "en_US",
              url: "https://studio.helmies.fi",
    siteName: "Helmies Studio",
    title: "Helmies Studio, 200+ AI Models for Image, Video & Lip-Sync",
    description: "Generate images with Flux & Midjourney. Animate with Sora 2 & Kling. 200+ AI models, one subscription, no filters.",
    images: [{ url: "/helmies-logo-light.svg", width: 435, height: 64 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Helmies Studio, 200+ AI Models",
    description: "Flux, Midjourney, Sora 2, Kling, Veo, 200+ AI models in one creative studio. Start free.",
    images: ["/helmies-logo-light.svg"],
  },
  icons: {
    icon: [{ url: "/ico.svg", type: "image/svg+xml" }],
    apple: [{ url: "/ico.svg", type: "image/svg+xml" }],
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
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
              description: "AI creative suite with 200+ models for image generation, video creation, and lip-sync.",
              offers: { "@type": "AggregateOffer", lowPrice: "0", highPrice: "99", priceCurrency: "USD", offerCount: "4" },
              author: { "@type": "Organization", name: "Helmies Oy", url: "https://helmies.fi" },
            }),
          }}
        />
      </head>
      <body className="min-h-screen w-full antialiased" style={{ background: "#0A0A0F", color: "#F2F2F7" }}>
        <AnnouncementBar />
        {children}
      </body>
    </html>
  );
}