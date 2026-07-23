import { getCurrentUser } from "@/lib/session";
import { checkRateLimit } from "@/lib/security";
import { getProvider } from "@/lib/providers";
import { getAgent } from "@/lib/agents";
import { brandError } from "@/lib/providers";

export async function POST(req) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return new Response("Unauthorized", { status: 401 });

    const rl = await checkRateLimit(user.id, "/api/agent");
    if (!rl.allowed) return new Response("Rate limited", { status: 429 });

    const { messages, model } = await req.json();
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response("Messages required", { status: 400 });
    }

    const selectedModel = model || process.env.LLM_MODEL || "qwen/qwen-2.5-72b-instruct";
    const key = process.env.OPENROUTER_KEY;

    if (!key) {
      const encoder = new TextEncoder();
      const staticStream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "token", content: "No LLM configured. Set OPENROUTER_KEY in .env" })}\n\n`));
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        },
      });
      return new Response(staticStream, {
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
      });
    }

    const orchestrator = getAgent("orchestrator");
    const systemContent = `${orchestrator.systemPrompt}\n\nYou are having a conversation with the user. Help them refine their request, ask clarifying questions, and when they're ready, suggest they click "Generate Plan" to proceed. Keep responses helpful and concise.`;

    const allMessages = [
      { role: "system", content: systemContent },
      ...messages.map(m => ({ role: m.role, content: m.content })),
    ];

    const provider = getProvider("openrouter");
    const res = await fetch(`${provider.baseUrl}/chat/completions`, {
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

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return new Response(JSON.stringify({ error: brandError(txt) }), { status: 500 });
    }

    const encoder = new TextEncoder();

    if (typeof res.body?.getReader !== "function") {
      const body = await res.text();
      let content = "";
      for (const line of body.split("\n").filter(l => l.startsWith("data: "))) {
        try {
          const d = JSON.parse(line.slice(6).trim());
          if (d.choices?.[0]?.delta?.content) content += d.choices[0].delta.content;
        } catch {}
      }
      const fallbackStream = new ReadableStream({
        start(controller) {
          const chunks = content.match(/.{1,50}/g) || [content];
          for (const chunk of chunks) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "token", content: chunk })}\n\n`));
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        },
      });
      return new Response(fallbackStream, {
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
      });
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = "";

    const stream = new ReadableStream({
      async start(controller) {
        try {
          while (true) {
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
                  fullContent += content;
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "token", content })}\n\n`));
                }
              } catch {}
            }
          }
        } catch {}
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message || "Chat failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
