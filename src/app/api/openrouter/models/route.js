import { NextResponse } from "next/server";

const KIE_LLM_MODELS = [
  { id: "google/gemini-3.6-flash", name: "Gemini 3.6 Flash", provider: "Google", contextLength: 1048576 },
  { id: "google/gemini-3-flash", name: "Gemini 3 Flash", provider: "Google", contextLength: 1048576 },
  { id: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro", provider: "Google", contextLength: 1048576 },
  { id: "x-ai/grok-4.5", name: "Grok 4.5", provider: "xAI", contextLength: 500000 },
  { id: "anthropic/claude-sonnet-5", name: "Claude Sonnet 5", provider: "Anthropic", contextLength: 1000000 },
];

export async function GET() {
  try {
    return NextResponse.json({ models: KIE_LLM_MODELS });
  } catch (e) {
    return NextResponse.json({ models: KIE_LLM_MODELS });
  }
}
