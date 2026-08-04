import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import {
  assembleVideos, resolveLocalMediaPath, MAX_CLIPS, VALID_ASSEMBLY_TRANSITIONS,
} from "@/lib/video-assembly";
import { validateOutboundUrl } from "@/lib/net-allowlist";
import { authzResponse } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";
import { apiError } from "@/lib/api-error";

// E4.4: accepts BOTH body shapes —
//   { urls: [...], transition?, transitionDuration? }            (legacy)
//   { clips: [{url, inSec?, outSec?}], transitions?, transitionDuration? }
// Per-clip trims are re-encoded segments; fade/dissolve boundaries render
// through xfade; hard cut stays the default. Every assembly is a fresh
// output file — originals are never touched.
export async function POST(req) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError({ code: "unauthorized" });
    verifyOrigin(req);

    const body = await req.json();

    let clips;
    let transitions;
    if (Array.isArray(body.urls)) {
      clips = body.urls.map((url) => ({ url }));
      transitions =
        body.transition && body.transition !== "cut"
          ? Array(Math.max(0, clips.length - 1)).fill(body.transition)
          : [];
    } else if (Array.isArray(body.clips)) {
      clips = body.clips.map((c) => (typeof c === "string" ? { url: c } : c));
      transitions = Array.isArray(body.transitions) ? body.transitions : [];
    } else {
      return apiError({ code: "bad_request", message: "At least one video URL required" });
    }

    if (clips.length === 0) {
      return apiError({ code: "bad_request", message: "At least one video URL required" });
    }
    if (clips.length > MAX_CLIPS) {
      return apiError({ code: "bad_request", message: `Too many clips (max ${MAX_CLIPS})` });
    }

    const details = [];
    clips.forEach((clip, i) => {
      if (!clip || typeof clip.url !== "string" || !clip.url) {
        details.push(`clips[${i}]: url required`);
        return;
      }
      const start = clip.inSec == null ? null : Number(clip.inSec);
      const end = clip.outSec == null ? null : Number(clip.outSec);
      if (start != null && (!Number.isFinite(start) || start < 0)) details.push(`clips[${i}]: invalid inSec`);
      if (end != null && (!Number.isFinite(end) || end <= (start ?? 0))) details.push(`clips[${i}]: invalid outSec`);
    });
    transitions.forEach((t, i) => {
      if (!VALID_ASSEMBLY_TRANSITIONS.includes(t)) details.push(`transitions[${i}]: must be one of ${VALID_ASSEMBLY_TRANSITIONS.join(", ")}`);
    });
    if (details.length) {
      return apiError({ code: "invalid_params", message: "Some clips or transitions aren't valid.", details });
    }

    // SSRF guard — same host allowlist the media proxy uses. Our own stored
    // media ("/api/media/local/...") resolves to disk and never leaves the
    // machine, so it is exempt from the outbound check.
    for (const clip of clips) {
      if (resolveLocalMediaPath(clip.url)) continue;
      const check = await validateOutboundUrl(clip.url, { allowSelf: true });
      if (!check.ok) {
        return apiError({ status: check.status, code: "bad_request", message: check.error });
      }
    }

    const outputUrl = await assembleVideos(
      { clips, transitions },
      { transitionDuration: body.transitionDuration },
    );
    return NextResponse.json({ success: true, url: outputUrl });
  } catch (e) {
    if (/No videos|Too many clips|Invalid trim|Invalid transition|needs a url/.test(e.message)) {
      return apiError({ code: "bad_request", message: e.message });
    }
    return authzResponse(e);
  }
}
