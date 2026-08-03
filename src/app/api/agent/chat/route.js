import { getCurrentUser } from "@/lib/session";
import { checkRateLimit } from "@/lib/security";
import { llmComplete, brandError } from "@/lib/providers";
import { apiError } from "@/lib/api-error";

export async function POST(req) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError({ code: "unauthorized" });

    const rl = await checkRateLimit(user.id, "/api/agent");
    if (!rl.allowed) return apiError({ code: "rate_limited", extra: { retryAfter: rl.retryAfter } });

    const body = await req.json().catch(() => ({}));
    const { messages, model } = body;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return apiError({ code: "bad_request", message: "Messages required" });
    }

    const selectedModel = model || process.env.LLM_MODEL || "deepseek/deepseek-v4-flash";
    const key = process.env.OPENROUTER_KEY;

    if (!key) {
      return new Response(
        `data: ${JSON.stringify({ type: "token", content: "No LLM configured. Set OPENROUTER_KEY in .env" })}\n\ndata: [DONE]\n\n`,
        { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" } }
      );
    }

    const systemContent = `You are Helmies Studio's Orchestrator Agent — a friendly, knowledgeable AI assistant inside a creative studio app. You help users plan and create multimedia content (images, video, audio, music, and more).

Your role in chat mode:
- Have a natural conversation with the user to understand their creative needs
- Ask clarifying questions when the request is vague
- Suggest creative ideas and approaches
- When the user is ready to execute, tell them to click "Generate Plan" to proceed
- Keep responses helpful, concise, and conversational — NOT JSON

Available creative tools: image generation, video generation, audio/music, lip sync, recast, cinema, motion, video editing, clipping, marketing campaigns, brand kits, AI avatars, and more.

Do NOT output JSON. Respond in plain text as a helpful assistant.`;

    const allMessages = [
      { role: "system", content: systemContent },
      ...messages.map(m => ({ role: m.role, content: m.content })),
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
      const body = `data: ${JSON.stringify({ type: "token", content: fullText })}\n\ndata: [DONE]\n\n`;
      return new Response(body, {
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
      });
    }

    if (typeof streamRes.body?.getReader !== "function") {
      const raw = await streamRes.text();
      let content = "";
      for (const line of raw.split("\n").filter(l => l.startsWith("data: "))) {
        try {
          const d = JSON.parse(line.slice(6).trim());
          if (d.choices?.[0]?.delta?.content) content += d.choices[0].delta.content;
        } catch {}
      }
      const body = content
        ? `data: ${JSON.stringify({ type: "token", content })}\n\ndata: [DONE]\n\n`
        : `data: ${JSON.stringify({ type: "token", content: raw })}\n\ndata: [DONE]\n\n`;
      return new Response(body, {
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
      });
    }

    const reader = streamRes.body.getReader();
    const decoder = new TextDecoder();
    let cancelled = false;

    const stream = new ReadableStream({
      async start(controller) {
        try {
          while (!cancelled) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            for (const line of chunk.split("\n").filter(l => l.startsWith("data: "))) {
              const data = line.slice(6).trim();
              if (data === "[DONE]") continue;
              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content || "";
                if (content) {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "token", content })}\n\n`));
                }
              } catch {}
            }
          }
        } catch {}
        try {
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch {}
      },
      cancel() { cancelled = true; },
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
    });
  } catch (e) {
    return apiError({ code: "internal", cause: e, context: { route: "agent/chat" } });
  }
}
