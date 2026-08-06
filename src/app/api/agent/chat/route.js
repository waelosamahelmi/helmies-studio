import { getCurrentUser } from "@/lib/session";
import { checkRateLimit } from "@/lib/security";
import { llmComplete, brandError } from "@/lib/providers";
import { apiError } from "@/lib/api-error";
import { authzResponse } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";
import { buildChatSystemPrompt, parseQuestionBlock } from "@/lib/agent-chat";
import { appendMessage, resolveOwnedSession } from "@/lib/agent-sessions";
import { getRunnableModelsForType } from "@/lib/model-catalog";
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
  const kind = parseQuestionBlock(text) ? "question" : "text";
  await appendMessage(sessionId, { role: "assistant", kind, content: text }).catch(() => {});
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
      await appendMessage(sessionId, { role: "user", kind: "text", content: last.content }).catch(() => {});
    }

    const selectedModel = model || process.env.LLM_MODEL || "deepseek/deepseek-v4-flash";
    const key = process.env.OPENROUTER_KEY;

    if (!key) {
      const fallbackText = "No LLM configured. Set OPENROUTER_KEY in .env";
      await persistAssistantTurn(sessionId, fallbackText);
      return new Response(sse({ type: "token", content: fallbackText }) + "data: [DONE]\n\n", {
        headers: SSE_HEADERS,
      });
    }

    // If the user just named a model, resolve it authoritatively (exact id +
    // real price) so the assistant's confirmation and the plan's pin can
    // never disagree.
    const resolved = await resolveChatModelMention(messages);
    const systemPrompt = buildChatSystemPrompt({ modelOptions: await chatModelOptions() }) +
      (resolved
        ? `\n\n<resolved-model>\nThe user's most recent model mention resolves to:\n- kind: ${resolved.kind}\n- exact id: ${resolved.modelId}\n- price: ${resolved.credits} cr\n${resolved.exact ? "This is an exact catalog match." : "This is the closest available model — confirm it with the user before proceeding."}\n</resolved-model>`
        : "");

    const allMessages = [
      { role: "system", content: systemPrompt },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    // OpenRouter exposes an OpenAI-compatible /chat/completions endpoint.
    // KIE is async task-only (media generation) and has no chat endpoint.
    const streamRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
        "HTTP-Referer": process.env.NEXTAUTH_URL || "https://studio.helmies.fi",
        "X-Title": "Helmies Studio",
      },
      body: JSON.stringify({
        model: selectedModel,
        messages: allMessages,
        temperature: 0.7,
        max_tokens: 2000,
        stream: true,
      }),
    });

    if (!streamRes.ok) {
      const txt = await streamRes.text().catch(() => "");
      // brandError keeps the message provider-name-free; the raw upstream
      // text goes only to the server-side log.
      return apiError({
        status: 500,
        code: "internal",
        message: brandError(txt),
        cause: new Error(txt || `Upstream LLM responded ${streamRes.status}`),
        context: { route: "agent/chat", upstreamStatus: streamRes.status },
      });
    }

    const encoder = new TextEncoder();

    if (typeof ReadableStream === "undefined") {
      const fullText = await llmComplete(allMessages, { maxTokens: 2000, temperature: 0.7, model: selectedModel });
      await persistAssistantTurn(sessionId, fullText);
      return new Response(sse({ type: "token", content: fullText }) + "data: [DONE]\n\n", {
        headers: SSE_HEADERS,
      });
    }

    if (typeof streamRes.body?.getReader !== "function") {
      const raw = await streamRes.text();
      let content = "";
      for (const line of raw.split("\n").filter((l) => l.startsWith("data: "))) {
        try {
          const d = JSON.parse(line.slice(6).trim());
          if (d.choices?.[0]?.delta?.content) content += d.choices[0].delta.content;
        } catch {}
      }
      const text = content || raw;
      await persistAssistantTurn(sessionId, text);
      return new Response(sse({ type: "token", content: text }) + "data: [DONE]\n\n", {
        headers: SSE_HEADERS,
      });
    }

    const reader = streamRes.body.getReader();
    const decoder = new TextDecoder();
    let cancelled = false;

    const stream = new ReadableStream({
      async start(controller) {
        let full = "";
        try {
          while (!cancelled) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            for (const line of chunk.split("\n").filter((l) => l.startsWith("data: "))) {
              const data = line.slice(6).trim();
              if (data === "[DONE]") continue;
              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content || "";
                if (content) {
                  full += content;
                  controller.enqueue(encoder.encode(sse({ type: "token", content })));
                }
              } catch {}
            }
          }
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
