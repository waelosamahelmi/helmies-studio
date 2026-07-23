import { getCurrentUser } from "@/lib/session";
import { checkRateLimit } from "@/lib/security";
import { llmStream } from "@/lib/providers";
import { getAgent } from "@/lib/agents";

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

    const hasLLM = process.env.OPENROUTER_KEY;
    if (!hasLLM) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "token", content: "No LLM configured. Please set OPENROUTER_KEY." })}\n\n`));
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        },
      });
      return new Response(stream, {
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
      });
    }

    const orchestrator = getAgent("orchestrator");
    const systemMsg = {
      role: "system",
      content: `${orchestrator.systemPrompt}\n\nYou are having a conversation with the user. Help them refine their request, ask clarifying questions, and when they're ready, suggest they click "Generate Plan" to proceed. Keep responses helpful and concise.`,
    };

    const allMessages = [systemMsg, ...messages.map(m => ({ role: m.role, content: m.content }))];

    let llmReadable;
    try {
      llmReadable = await llmStream(allMessages, { maxTokens: 2000, temperature: 0.7, model: selectedModel });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }

    const encoder = new TextEncoder();
    const reader = llmReadable.getReader();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split("\n").filter(l => l.startsWith("data: "));
            for (const line of lines) {
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
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}
