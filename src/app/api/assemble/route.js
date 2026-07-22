import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { assembleVideos } from "@/lib/video-assembly";

export async function POST(req) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { urls, transition, transitionDuration } = await req.json();
    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return NextResponse.json({ error: "At least one video URL required" }, { status: 400 });
    }

    const outputUrl = await assembleVideos(urls, { transition, transitionDuration });
    return NextResponse.json({ success: true, url: outputUrl });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
