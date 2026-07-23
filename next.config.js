/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
  allowedDevOrigins: ["172.20.10.4", "172.20.10.5", "172.20.10.6"],
  async rewrites() {
    return [
      {
        source: "/agent/:path*",
        destination: "http://localhost:3080/:path*",
      },
    ];
  },
};

module.exports = nextConfig;