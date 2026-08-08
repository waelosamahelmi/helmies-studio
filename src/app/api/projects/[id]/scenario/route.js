import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { authzResponse } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";
import { checkRateLimit } from "@/lib/security";
import { apiError } from "@/lib/api-error";
import { llmComplete } from "@/lib/providers";
import { getOwnedProject, normalizeSettings, kindOf, updateProject } from "@/lib/projects";
import prisma from "@/lib/prisma";

/* P1.6 — write the scenario.
   ────────────────────────────────────────────────────────────────────────
   Not everybody arrives with a screenplay. Given an idea and the cast that
   already exists, this writes one in the form the breakdown reads: scene
   headings, action in the present tense, dialogue under the speaker.

   It returns the draft rather than saving it. A scenario is the spine of
   everything downstream, and silently overwriting one somebody wrote is
   not a thing to do on a button press — the client shows it and asks. */

const SYSTEM = `You are a screenwriter. Write a complete, shootable script from the idea you are given.

FORM — follow it exactly, because a breakdown tool reads this text:
- Open with the title on its own line.
- Every scene starts with a heading on its own line: "SCENE <n> — <LOCATION> — <TIME>".
- Action in the present tense, one beat per line, describing only what a camera can see or a microphone can hear.
- Dialogue: the speaker's name in capitals on its own line, the spoken line under it.
- No camera directions, no shot numbers, no parentheticals about feelings, no commentary about the script itself.

SUBSTANCE:
- Write for the people you are told are in it, by name. Do not invent a different lead.
- Every scene must happen somewhere specific and must change something.
- Keep it to the requested length. A shorter script that is fully shot beats a longer one that is half made.
- Sound matters as much as image: name what is heard.

Reply with the script and nothing else. No preamble, no markdown fences, no notes at the end.`;

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
    const idea = String(body.idea || "").trim();
    if (!idea) return apiError({ code: "invalid_params", message: "Say what it is about." });

    if (!process.env.OPENROUTER_KEY) {
      return apiError({ code: "internal", message: "The writer is unavailable right now.", retryable: true });
    }

    const settings = normalizeSettings(project.data || {});
    const kind = kindOf(settings.kind);

    // The cast that already exists goes in by name and description, so the
    // script is written for the faces that have references on file rather
    // than for strangers who would then have to be built.
    const members = await prisma.studioEntity.findMany({
      where: { projectId: id, userId: user.id },
      select: { kind: true, name: true, description: true },
      take: 24,
    });

    const context = [
      `TITLE: ${project.name}`,
      `FORMAT: a ${kind.label.toLowerCase()}, told in ${kind.unit}s, shot ${settings.aspectRatio}.`,
      body.minutes ? `LENGTH: about ${Math.max(1, Math.min(30, Number(body.minutes) || 3))} minutes on screen.` : "LENGTH: about 3 minutes on screen.",
      members.length
        ? `WHO AND WHERE ALREADY EXIST — write for these, by these names:\n${members
            .map((m) => `- ${m.name} (${m.kind})${m.description ? `: ${m.description.slice(0, 200)}` : ""}`)
            .join("\n")}`
        : null,
      project.brief ? `THERE IS AN EXISTING DRAFT. Rewrite it to the idea below, keeping what works:\n${project.brief.slice(0, 8000)}` : null,
      `THE IDEA:\n${idea.slice(0, 4000)}`,
    ].filter(Boolean).join("\n\n");

    const reply = await llmComplete(
      [{ role: "system", content: SYSTEM }, { role: "user", content: context }],
      { maxTokens: 16000, temperature: 0.8, timeout: 240000, withMeta: true },
    );
    const script = (reply?.content || "").trim();
    if (script.length < 200) {
      return apiError({ code: "internal", message: "The writer did not return a usable script. Try again.", retryable: true });
    }

    // Saving is opt-in. Overwriting a scenario somebody wrote, on a button
    // press, is not a thing to do quietly.
    if (body.save) {
      const saved = await updateProject(user.id, id, { brief: script });
      return NextResponse.json({ script, saved: true, project: saved });
    }
    return NextResponse.json({ script, saved: false, truncated: !!reply?.truncated });
  } catch (e) {
    return authzResponse(e);
  }
}
