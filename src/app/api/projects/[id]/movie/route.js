import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { authzResponse } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";
import { checkRateLimit } from "@/lib/security";
import { apiError } from "@/lib/api-error";
import { assembleVideos, resolveLocalMediaPath, MAX_CLIPS, VALID_ASSEMBLY_TRANSITIONS } from "@/lib/video-assembly";
import { validateOutboundUrl } from "@/lib/net-allowlist";
import { getOwnedProject, collectMovieClips, setProjectMovie, normalizeSettings } from "@/lib/projects";

/* P1.3 — the whole thing, in one file.
   ────────────────────────────────────────────────────────────────────────
   Each scene already assembles its own shots; this assembles the scenes,
   in the order they were added. It is ffmpeg on media that is already
   paid for — no model runs, so it costs nothing and is safe to redo.

   GET reports what could be built and what is missing, so the button can
   say why it is disabled instead of just being grey. */

export async function GET(req, { params }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError({ code: "unauthorized" });

    const { id } = await params;
    const project = await getOwnedProject(user.id, id);
    if (!project) return apiError({ code: "not_found", message: "Project not found" });

    const { clips, missing, scenes } = await collectMovieClips(user.id, id);
    const settings = normalizeSettings(project.data || {});
    return NextResponse.json({
      movieUrl: settings.movieUrl || null,
      builtAt: settings.movieBuiltAt || null,
      clips: clips.length,
      scenes: scenes.length,
      missing,
      ready: clips.length > 0 && missing.length === 0,
    });
  } catch (e) {
    return authzResponse(e);
  }
}

export async function POST(req, { params }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError({ code: "unauthorized" });
    verifyOrigin(req);

    const rl = await checkRateLimit(user.id, "/api/projects");
    if (!rl.allowed) return apiError({ code: "rate_limited", extra: { retryAfter: rl.retryAfter } });

    const { id } = await params;
    const project = await getOwnedProject(user.id, id);
    if (!project) return apiError({ code: "not_found", message: "Project not found" });

    const body = await req.json().catch(() => ({}));
    const transition = body.transition || "cut";
    if (!["cut", ...VALID_ASSEMBLY_TRANSITIONS].includes(transition)) {
      return apiError({ code: "invalid_params", message: "Unknown transition." });
    }

    const { clips, missing, scenes } = await collectMovieClips(user.id, id);

    if (!scenes.length) {
      return apiError({ code: "invalid_params", message: "This project has no scenes yet." });
    }
    // Refuse rather than quietly omit — a cut with a scene missing looks
    // finished, and that is the expensive kind of wrong.
    if (missing.length) {
      return apiError({
        code: "invalid_params",
        message: `Nothing has been rendered for ${missing.length === 1 ? "this scene" : "these scenes"} yet: ${missing.join(", ")}.`,
      });
    }
    if (clips.length > MAX_CLIPS) {
      return apiError({
        code: "invalid_params",
        message: `That is ${clips.length} clips — more than the ${MAX_CLIPS} one assembly can join. Assemble the scenes individually first, and this will join those instead.`,
      });
    }

    // Same SSRF guard the standalone assembler uses. Our own stored media
    // resolves to disk and never leaves the machine.
    for (const url of clips) {
      if (resolveLocalMediaPath(url)) continue;
      const check = await validateOutboundUrl(url, { allowSelf: true });
      if (!check.ok) return apiError({ status: check.status, code: "bad_request", message: check.error });
    }

    const transitions = transition === "cut" ? [] : Array(Math.max(0, clips.length - 1)).fill(transition);
    const url = await assembleVideos(
      { clips: clips.map((u) => ({ url: u })), transitions },
      { transitionDuration: body.transitionDuration },
    );

    await setProjectMovie(user.id, id, url, { clips: clips.length, scenes: scenes.length, transition });

    return NextResponse.json({ success: true, url, clips: clips.length, scenes: scenes.length });
  } catch (e) {
    if (e?.message && /assembl|ffmpeg|clip/i.test(e.message)) {
      return apiError({ code: "internal", title: "Assembly failed", message: e.message, retryable: true });
    }
    return authzResponse(e);
  }
}
