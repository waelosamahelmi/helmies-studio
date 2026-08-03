// Content-Security-Policy.
// 'unsafe-inline' is required for script-src: src/app/layout.js ships inline
// <script> blocks and Next injects its own inline bootstrap. A nonce would
// require refactoring layout.js, so this is intentional — the policy still
// blocks framing, plugins, base-tag hijacking and arbitrary object embeds.
// 'unsafe-eval' is required by React Refresh in `next dev` only — production
// builds get the tighter policy.
const isDev = process.env.NODE_ENV !== "production";

const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https:",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
  allowedDevOrigins: ["172.20.10.4", "172.20.10.5", "172.20.10.6"],
  // Phase 8 Task B3 (OWASP ZAP baseline scan) — genuine finding: Next.js
  // defaults this to true, sending "X-Powered-By: Next.js" on every
  // response. Free reconnaissance for an attacker (confirms the framework,
  // narrows which known CVEs to try) for zero product benefit; disabling it
  // changes no behavior a real client relies on.
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: CSP },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          // Phase 8 Task B3 — genuine, low-risk finding fixed here: COOP
          // isolates this origin's browsing context from a cross-origin
          // opener/openee (blocks the classic window.opener/
          // reverse-tabnabbing leak and related cross-window snooping)
          // with no functional cost — this app never needs a same-origin
          // window to reach into an opened cross-origin one or vice versa.
          //
          // Deliberately NOT setting Cross-Origin-Resource-Policy or
          // Cross-Origin-Embedder-Policy globally here even though ZAP
          // flagged both: src/app/api/media/proxy/route.js already sends
          // its own explicit `Access-Control-Allow-Origin: "*"` — a
          // deliberate existing choice to let generated media be fetched
          // cross-origin (e.g. into a <canvas> from a different origin
          // without tainting it) — a blanket CORP: same-origin here would
          // silently fight that route's own real intent, and COEP:
          // require-corp would make the browser refuse to load any
          // cross-origin image/video that doesn't itself send a CORP
          // header, which is most of what this app actually renders (KIE/
          // Alibaba/S3-hosted generated media, none of which we control
          // the response headers for). Both would regress real product
          // behavior, not close a real gap — see
          // docs/runbook-security-scan.md's triage table for the full
          // reasoning and what a correct, route-scoped fix would need.
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
