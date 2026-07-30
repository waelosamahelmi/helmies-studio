import { readFile } from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";

export async function GET() {
  const source = await readFile(path.join(process.cwd(), "studio-design-concepts.html"), "utf8");
  const document = source
    .replace("sessionStorage.getItem('hs-theme')||'obsidian'", "'universe'")
    .replace("<title>Helmies Studio - Eight Product Directions</title>", "<title>Helmies Command Universe</title>")
    .replace("</style>", `.concept-bar{display:none!important}.app{min-height:0}.theme-universe .uni-shell{height:100dvh}\n</style>`)
    .replace("</body>", `<script src="/studio-universe-runtime.js"></script>\n</body>`);
  return new Response(document, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      "Content-Security-Policy": "default-src 'self' https: data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com data:; img-src 'self' https: data: blob:; media-src 'self' https: data: blob:; connect-src 'self' https:; frame-ancestors 'self'",
    },
  });
}
