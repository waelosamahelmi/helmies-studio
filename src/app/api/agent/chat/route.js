import { getCurrentUser } from "@/lib/session";
import { checkRateLimit } from "@/lib/security";
import { llmComplete, llmStream, brandError } from "@/lib/providers";
import { hasLlm } from "@/lib/llm-transport.mjs";
import { apiError } from "@/lib/api-error";
import { authzResponse } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";
import { buildChatSystemPrompt, parseQuestionBlock, parseAssetRequestBlock } from "@/lib/agent-chat";
import { appendMessage, resolveOwnedSession } from "@/lib/agent-sessions";
import prisma from "@/lib/prisma";
import { getRunnableModelsForType } from "@/lib/model-catalog";
import { studioCapabilities } from "@/lib/studio-knowledge";
import { buildUserParts, contentText } from "@/lib/agent-multimodal.mjs";
import { runnableProviderModelId, audioKind } from "@/lib/model-catalog-core.mjs";
import { resolveMentionRows } from "@/lib/agents";

// EDITSv1 E3.2 — structured agent chat. The system prompt (src/lib/
// agent-chat.js) enforces: markdown prose, AT MOST ONE clarifying question
// per turn delivered as a trailing ```question fenced block, and a pointer
// to plan review when enough is known. When the client attaches a
// sessionId, both sides of the turn are persisted via appendMessage — the
// newest user message before the LLM call, the full assistant reply after
// the stream ends (kind "question" when it carries a question block).

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
};

const sse = (payload) => `data: ${JSON.stringify(payload)}\n\n`;

// The live pools the MODEL CHOICE questions offer — the SAME gated
// getRunnableModelsForType the planner hint and fallback chains use, so a
// model the chat offers is always one a run can actually execute. The user's
// answer (a bare id) is then pinned onto the plan by
// resolveUserRequestedModels, which re-quotes the real price.
async function chatModelOptions() {
  try {
    const [video, image, audio] = await Promise.all([
      getRunnableModelsForType("video", { limit: 6 }),
      getRunnableModelsForType("image", { limit: 6 }),
      getRunnableModelsForType("audio", { limit: 50 }),
    ]);
    const row = (r) => ({ id: runnableProviderModelId(r), credits: r.creditsCost });
    return {
      video: video.map(row),
      image: image.map(row),
      music: audio.filter((r) => audioKind(r) === "music").slice(0, 6).map(row),
    };
  } catch {
    return {};
  }
}

async function persistAssistantTurn(sessionId, text) {
  if (!sessionId || !text) return;
  // An asset request outranks a question: a turn carrying both is a contract
  // violation the prompt forbids, and the upload card is the one the user
  // has to act on.
  const kind = parseAssetRequestBlock(text) ? "assets" : parseQuestionBlock(text) ? "question" : "text";
  await appendMessage(sessionId, { role: "assistant", kind, content: text }).catch(() => {});
}

/* What the user already has, so the assistant never asks for it twice.
   ────────────────────────────────────────────────────────────────────────
   Asking somebody to re-upload a face they filed last week reads as not
   listening, and it is worse than rude: a second character built from the
   same photographs is a second identity, and the two drift apart across a
   film. The counts matter as much as the names — a character on file with
   NO reference images is exactly the case where the assistant SHOULD ask. */
async function chatInventory(userId) {
  try {
    const [entities, brandKits, voiceProfiles] = await Promise.all([
      prisma.studioEntity.findMany({
        where: { userId, status: { in: ["ready", "locked"] } },
        select: { name: true, kind: true, references: true },
        orderBy: { updatedAt: "desc" },
        take: 20,
      }),
      prisma.brandKit.findMany({
        where: { userId, isActive: true },
        select: { name: true, visualReferences: true, primaryColors: true },
        orderBy: { updatedAt: "desc" },
        take: 4,
      }),
      prisma.voiceProfile.findMany({
        where: { userId },
        select: { name: true, status: true },
        orderBy: { updatedAt: "desc" },
        take: 8,
      }),
    ]);
    const refs = (row) => (Array.isArray(row.references) ? row.references : []);
    return {
      entities: entities.map((e) => ({
        name: e.name,
        kind: e.kind,
        references: refs(e).filter((r) => r?.kind !== "voice").length,
        hasVoice: refs(e).some((r) => r?.kind === "voice"),
      })),
      brandKits: brandKits.map((b) => ({
        name: b.name,
        hasLogo: (Array.isArray(b.visualReferences) ? b.visualReferences : []).some((r) => r?.role === "logo"),
        colors: (Array.isArray(b.primaryColors) ? b.primaryColors : []).slice(0, 3).join(" "),
      })),
      voiceProfiles: voiceProfiles.map((v) => ({ name: v.name, status: v.status })),
    };
  } catch {
    // An inventory we cannot read must not take the chat down with it. The
    // assistant then asks for everything, which is merely annoying.
    return {};
  }
}

// Authoritative resolution of a model the user names in chat (2026-08-06):
// the user's answer must be EXACT, because the plan pins the exact id and
// shows its real price. So when the user names a model outside the offered
// list, the route resolves it against the SAME pools the plan pins from and
// hands the assistant the authoritative result — an exact-match id, the
// closest id-tail match, or null (nothing found) — so the assistant confirms
// the real id + price or asks the user to pick an offered id, and never
// invents a translation that the pin would then disagree with.
// NOTE: this shares resolveMentionRows' matching so chat and pin can never
// disagree about which model "Seedance 2.0" means.
async function resolveChatModelMention(messages) {
  try {
    const text = (Array.isArray(messages) ? messages : [])
      .filter((m) => m?.role === "user" && typeof m.content === "string")
      .map((m) => m.content)
      .join("\n");
    if (!text) return null;
    const frags = [...text.matchAll(/([a-z][a-z0-9.\-]*?)(?:\s*(?:v\.?)?(\d+(?:\.\d+)*))/gi)].map((m) => m[0].trim());
    if (!frags.length) return null;

    const pools = {
      video: () => getRunnableModelsForType("video", { limit: 500 }).catch(() => []),
      image: () => getRunnableModelsForType("image", { limit: 500 }).catch(() => []),
      music: () => getRunnableModelsForType("audio", { limit: 500 }).catch(() => []).then((rows) => rows.filter((r) => audioKind(r) === "music")),
    };
    for (const frag of frags) {
      for (const [kind, load] of Object.entries(pools)) {
        const rows = await load();
        const hits = await resolveMentionRows(frag, rows);
        if (!hits.length) continue;
        const unique = [...new Map(hits.map((h) => [h.row.modelId, h.row])).values()];
        // Exact (rank 2) always wins; a single id-tail match (rank 1) is
        // unambiguous too. Multiple rank-1 rows = ambiguous → null (the
        // assistant must ask).
        const exact = unique.filter((row) => runnableProviderModelId(row) === frag
          || String(row.modelId).toLowerCase() === frag.toLowerCase());
        const chosen = exact.length === 1 ? exact[0] : unique.length === 1 ? unique[0] : null;
        if (!chosen) continue;
        return {
          kind,
          modelId: runnableProviderModelId(chosen),
          credits: chosen.creditsCost,
          exact: exact.length === 1,
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}

export async function POST(req) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError({ code: "unauthorized" });
    verifyOrigin(req);

    const rl = await checkRateLimit(user.id, "/api/agent");
    if (!rl.allowed) return apiError({ code: "rate_limited", extra: { retryAfter: rl.retryAfter } });

    const body = await req.json().catch(() => ({}));
    const { messages, model } = body;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return apiError({ code: "bad_request", message: "Messages required" });
    }

    const session = await resolveOwnedSession(user.id, body.sessionId);
    const sessionId = session?.id || null;

    // The client sends the full history; only the FINAL user message is new.
    const last = messages[messages.length - 1];
    if (sessionId && last?.role === "user" && typeof last.content === "string" && last.content.trim()) {
      // The transcript records WHAT WAS ATTACHED, not just what was typed —
      // a resumed session that shows the sentence but not the photograph
      // reads as though the user never sent one.
      const noted = Array.isArray(body.attachments) && body.attachments.length
        ? `${last.content}

[Attached: ${body.attachments.map((a) => a?.name || a?.url).filter(Boolean).join(", ")}]`
        : last.content;
      await appendMessage(sessionId, { role: "user", kind: "text", content: noted }).catch(() => {});
    }

    /* No hardcoded fallback id here. This line used to end in
       "deepseek/deepseek-v4-flash" — the studio's PREVIOUS default, which
       llm-models.mjs records as text-only ("cannot see or hear"). Leaving
       the model undefined lets resolveModelFor fall through to
       LLM_PROVIDER.defaultModel, which honours LLM_MODEL only when the
       registry knows the id and otherwise uses DEFAULT_LLM. An unvalidated
       env string is a guess about modality, and guessing is the bug. */
    const selectedModel = model || undefined;

    if (!hasLlm()) {
      const fallbackText = "No LLM configured. Set KIE_KEY or OPENROUTER_KEY in .env";
      await persistAssistantTurn(sessionId, fallbackText);
      return new Response(sse({ type: "token", content: fallbackText }) + "data: [DONE]\n\n", {
        headers: SSE_HEADERS,
      });
    }

    // If the user just named a model, resolve it authoritatively (exact id +
    // real price) so the assistant's confirmation and the plan's pin can
    // never disagree.
    const resolved = await resolveChatModelMention(messages);
    const [modelOptions, inventory, capabilities] = await Promise.all([
      chatModelOptions(), chatInventory(user.id), studioCapabilities(),
    ]);
    const systemPrompt = buildChatSystemPrompt({ modelOptions, inventory }) + capabilities +
      (resolved
        ? `\n\n<resolved-model>\nThe user's most recent model mention resolves to:\n- kind: ${resolved.kind}\n- exact id: ${resolved.modelId}\n- price: ${resolved.credits} cr\n${resolved.exact ? "This is an exact catalog match." : "This is the closest available model — confirm it with the user before proceeding."}\n</resolved-model>`
        : "");

    /* Attachments become CONTENT PARTS on the newest user turn.
       ────────────────────────────────────────────────────────────────────
       The attach button has existed for a long time and never did anything:
       the client sent the urls, no server code read them, and the model was
       handed a plain string. It then answered about the picture anyway,
       from the filename and the sentence around it, and nothing said it had
       not looked. Sending them as parts is the whole fix — and the model is
       then resolved against what the parts NEED (see resolveModelFor below),
       because a blind model receiving image parts is the same silence with
       extra steps. */
    const attachments = Array.isArray(body.attachments) ? body.attachments : [];
    const baseUrl = process.env.NEXTAUTH_URL || "https://studio.helmies.fi";
    const mapped = messages.map((m, i) => {
      const isLast = i === messages.length - 1;
      if (!isLast || m.role !== "user" || !attachments.length) {
        return { role: m.role, content: m.content };
      }
      return { role: m.role, content: buildUserParts(contentText(m.content) || m.content, attachments, { baseUrl }) };
    });

    const allMessages = [
      { role: "system", content: systemPrompt },
      ...mapped,
    ];

    /* The model has to be able to take what we are about to send it.
       ────────────────────────────────────────────────────────────────────
       buildUserParts above may have just turned this turn into image parts.
       A text-only model carrying an image is answered with a 404 upstream —
       which arrived here as a 500 and told the user nothing. llmStream
       resolves the model against the modalities actually present in the
       messages, picks the provider (llm-transport.mjs: KIE first, OpenRouter
       second, so one empty balance no longer silences the agent), and throws
       an already-branded error with the raw upstream text as its cause. */
    let upstream;
    try {
      upstream = await llmStream(allMessages, { model: selectedModel, temperature: 0.7, maxTokens: 2000 });
    } catch (e) {
      return apiError({
        status: 500,
        code: "internal",
        message: brandError(e?.message),
        cause: e,
        context: { route: "agent/chat" },
      });
    }

    const encoder = new TextEncoder();

    if (typeof upstream?.getReader !== "function") {
      const fullText = await llmComplete(allMessages, { maxTokens: 2000, temperature: 0.7, model: selectedModel });
      await persistAssistantTurn(sessionId, fullText);
      return new Response(sse({ type: "token", content: fullText }) + "data: [DONE]\n\n", {
        headers: SSE_HEADERS,
      });
    }

    const reader = upstream.getReader();
    const decoder = new TextDecoder();
    let cancelled = false;

    const stream = new ReadableStream({
      async start(controller) {
        let full = "";
        // One SSE line → the token it carries (forwarded to the client) or "".
        const takeToken = (line) => {
          const data = line.slice(6).trim();
          if (data === "[DONE]") return "";
          try {
            const content = JSON.parse(data).choices?.[0]?.delta?.content || "";
            if (content) controller.enqueue(encoder.encode(sse({ type: "token", content })));
            return content;
          } catch { return ""; }
        };
        // A network read ends wherever the packet did, not where a line did.
        // Splitting each read on "\n" alone dropped any event that straddled
        // two reads — a silently missing piece of the reply. The unfinished
        // tail is carried into the next read instead.
        let carry = "";
        try {
          while (!cancelled) {
            const { done, value } = await reader.read();
            if (done) break;
            const lines = (carry + decoder.decode(value, { stream: true })).split("\n");
            carry = lines.pop() ?? "";
            for (const line of lines.filter((l) => l.startsWith("data: "))) {
              full += takeToken(line);
            }
          }
          // A final event with no trailing newline is still an event.
          if (!cancelled && carry.startsWith("data: ")) full += takeToken(carry);
        } catch {}
        // Persist the complete assistant turn (even a partial one the user
        // cancelled — that's what they saw) before closing the stream.
        await persistAssistantTurn(sessionId, full);
        try {
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch {}
      },
      cancel() { cancelled = true; },
    });

    return new Response(stream, { headers: SSE_HEADERS });
  } catch (e) {
    return authzResponse(e);
  }
}
