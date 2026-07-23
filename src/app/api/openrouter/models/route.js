import { NextResponse } from "next/server";

export async function GET() {
  try {
    const key = process.env.OPENROUTER_KEY;
    if (!key) {
      return NextResponse.json({ models: getDefaultModels() });
    }

    const res = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
      next: { revalidate: 3600 },
    });

    if (!res.ok) {
      return NextResponse.json({ models: getDefaultModels() });
    }

    const data = await res.json();
    const models = (data.data || [])
      .filter(m => m.id && !m.id.includes(":"))
      .map(m => ({
        id: m.id,
        name: m.name || m.id,
        provider: m.architecture?.provider || m.id.split("/")[0] || "openrouter",
        contextLength: m.context_length || null,
        pricing: m.pricing || null,
        description: m.description || "",
      }))
      .sort((a, b) => (b.pricing?.prompt ? parseFloat(b.pricing.prompt) : 0) - (a.pricing?.prompt ? parseFloat(a.pricing.prompt) : 0))
      .slice(0, 100);

    return NextResponse.json({ models: models.length > 0 ? models : getDefaultModels() });
  } catch {
    return NextResponse.json({ models: getDefaultModels() });
  }
}

function getDefaultModels() {
  return [
    { id: "qwen/qwen-2.5-72b-instruct", name: "Qwen 2.5 72B", provider: "Qwen", contextLength: 131072 },
    { id: "openai/gpt-4o", name: "GPT-4o", provider: "OpenAI", contextLength: 128000 },
    { id: "openai/gpt-4o-mini", name: "GPT-4o Mini", provider: "OpenAI", contextLength: 128000 },
    { id: "anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet", provider: "Anthropic", contextLength: 200000 },
    { id: "anthropic/claude-3-haiku", name: "Claude 3 Haiku", provider: "Anthropic", contextLength: 200000 },
    { id: "google/gemini-2.0-flash-001", name: "Gemini 2.0 Flash", provider: "Google", contextLength: 1048576 },
    { id: "google/gemini-2.0-pro-001", name: "Gemini 2.0 Pro", provider: "Google", contextLength: 1048576 },
    { id: "mistralai/mistral-large-2411", name: "Mistral Large", provider: "Mistral", contextLength: 131072 },
    { id: "cohere/command-r-plus-08-2024", name: "Command R+", provider: "Cohere", contextLength: 128000 },
    { id: "meta-llama/llama-3.3-70b-instruct", name: "Llama 3.3 70B", provider: "Meta", contextLength: 131072 },
    { id: "deepseek/deepseek-chat", name: "DeepSeek V3", provider: "DeepSeek", contextLength: 65536 },
    { id: "qwen/qwen-2-72b-instruct", name: "Qwen 2 72B", provider: "Qwen", contextLength: 32768 },
  ];
}
