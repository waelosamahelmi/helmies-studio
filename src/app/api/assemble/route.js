import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { assembleVideos, MAX_CLIPS } from "@/lib/video-assembly";
import { validateOutboundUrl } from "@/lib/net-allowlist";
import { authzResponse } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";

export async function POST(req) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    verifyOrigin(req);

    const { urls, transition, transitionDuration } = await req.json();
    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return NextResponse.json({ error: "At least one video URL required" }, { status: 400 });
    }
    if (urls.length > MAX_CLIPS) {
      return NextResponse.json({ error: `Too many clips (max ${MAX_CLIPS})` }, { status: 400 });
    }

    // SSRF guard — same host allowlist the media proxy uses.
    for (const url of urls) {
      const check = await validateOutboundUrl(url, { allowSelf: true });
      if (!check.ok) {
        return NextResponse.json({ error: check.error }, { status: check.status });
      }
    }

    const outputUrl = await assembleVideos(urls, { transition, transitionDuration });
    return NextResponse.json({ success: true, url: outputUrl });
  } catch (e) {
    return authzResponse(e);
  }
}
