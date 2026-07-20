import { NextResponse } from "next/server";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const url = searchParams.get("url");

    if (!url) {
      return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
    }

    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
    }

    if (!["http:", "https:"].includes(parsed.protocol)) {
      return NextResponse.json({ error: "Invalid protocol" }, { status: 400 });
    }

    const range = req.headers.get("range");
    const upstreamHeaders = { "User-Agent": "HelmiesStudio/1.0" };
    if (range) upstreamHeaders["Range"] = range;

    const res = await fetch(url, {
      signal: AbortSignal.timeout(30000),
      headers: upstreamHeaders,
    });

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
    };
    if (contentLength) headers["Content-Length"] = contentLength;
    if (contentRange) headers["Content-Range"] = contentRange;

    return new Response(res.body, { status: res.status, headers });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
