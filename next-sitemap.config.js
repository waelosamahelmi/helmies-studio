/** @type {import('next-sitemap').IConfig} */
module.exports = {
  siteUrl: "https://studio.helmies.fi",
  generateRobotsTxt: true,
  sitemapSize: 7000,
  exclude: ["/api/*", "/admin/*", "/studio/*", "/settings/*"],
  robotsTxtOptions: {
    additionalSitemaps: [],
    policies: [
      { userAgent: "*", allow: "/" },
      { userAgent: "*", disallow: ["/api/", "/admin/", "/studio/", "/settings/"] },
    ],
  },
};
