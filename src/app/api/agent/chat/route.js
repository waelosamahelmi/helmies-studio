import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { checkRateLimit } from "@/lib/security";
import { llmComplete, getProvider, brandError } from "@/lib/providers";
import { getAgent } from "@/lib/agents";

export async function POST(req) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const rl = await checkRateLimit(user.id, "/api/agent");
    if (!rl.allowed) return NextResponse.json({ error: "Rate limited" }, { status: 429 });

    const body = await req.json().catch(() => ({}));
    const { messages, model } = body;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "Messages required" }, { status: 400 });
    }

    const selectedModel = model || process.env.LLM_MODEL || "qwen/qwen-2.5-72b-instruct";
    const key = process.env.OPENROUTER_KEY;

    if (!key) {
      return new Response(
        `data: ${JSON.stringify({ type: "token", content: "No LLM configured. Set OPENROUTER_KEY in .env" })}\n\ndata: [DONE]\n\n`,
        { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" } }
      );
    }

    const orchestrator = getAgent("orchestrator");
    const systemContent = `${orchestrator.systemPrompt}\n\nYou are having a conversation with the user. Help them refine their request, ask clarifying questions, and when they're ready, suggest they click "Generate Plan" to proceed. Keep responses helpful and concise.`;

    const allMessages = [
      { role: "system", content: systemContent },
      ...messages.map(m => ({ role: m.role, content: m.content })),
    ];

    // Try streaming first; fall back to non-streaming if that fails
    const provider = getProvider("openrouter");
    const streamRes = await fetch(`${provider.baseUrl}/chat/completions`, {
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
      return NextResponse.json({ error: brandError(txt) }, { status: 500 });
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
    return NextResponse.json({ error: e?.message || "Chat failed" }, { status: 500 });
  }
}
