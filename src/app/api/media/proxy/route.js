import { NextResponse } from "next/server";
import { validateOutboundUrl, isAllowedHostAsync } from "@/lib/net-allowlist";

const MAX_REDIRECTS = 3;

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const url = searchParams.get("url");

    // Known provider hosts pass outright; any other host must resolve to a
    // public address. This keeps already-stored provider CDN URLs working
    // while still refusing localhost, the private LAN and cloud metadata.
    const check = await validateOutboundUrl(url);
    if (!check.ok) {
      return NextResponse.json({ error: check.error }, { status: check.status });
    }
    const parsed = check.parsed;

    const range = req.headers.get("range");
    const upstreamHeaders = { "User-Agent": "HelmiesStudio/1.0" };
    if (range) upstreamHeaders["Range"] = range;

    // Follow redirects manually so an allowed host cannot bounce us to an
    // internal address (169.254.169.254, localhost, 10.0.0.0/8 …).
    let target = parsed.toString();
    let res;
    for (let hop = 0; ; hop++) {
      res = await fetch(target, {
        signal: AbortSignal.timeout(30000),
        headers: upstreamHeaders,
        redirect: "manual",
      });

      if (res.status < 300 || res.status >= 400) break;

      const location = res.headers.get("location");
      if (!location) break;
      if (hop >= MAX_REDIRECTS) {
        return NextResponse.json({ error: "Too many redirects" }, { status: 502 });
      }

      let next;
      try {
        next = new URL(location, target);
      } catch {
        return NextResponse.json({ error: "Invalid redirect target" }, { status: 502 });
      }
      if (next.protocol !== "http:" && next.protocol !== "https:") {
        return NextResponse.json({ error: "Invalid redirect protocol" }, { status: 403 });
      }
      if (!(await isAllowedHostAsync(next.hostname))) {
        return NextResponse.json({ error: "Redirect host not allowed" }, { status: 403 });
      }
      target = next.toString();
    }

    if (!res.ok) {
      return NextResponse.json({ error: `Upstream returned ${res.status}` }, { status: res.status });
    }

    const contentType = res.headers.get("content-type") || "application/octet-stream";
    const contentLength = res.headers.get("content-length");
    const contentRange = res.headers.get("content-range");

    const headers = {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "Access-Control-Allow-Origin": "*",
      "Accept-Ranges": "bytes",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
    };
    if (contentLength) headers["Content-Length"] = contentLength;
    if (contentRange) headers["Content-Range"] = contentRange;

    return new Response(res.body, { status: res.status, headers });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
