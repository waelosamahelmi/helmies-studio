import { NextResponse } from "next/server";

const KIE_LLM_MODELS = [
  { id: "google/gemini-2.5-flash-openai", name: "Gemini 2.5 Flash", provider: "Google", contextLength: 1048576 },
  { id: "google/gemini-3-flash", name: "Gemini 3 Flash", provider: "Google", contextLength: 1048576 },
  { id: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro", provider: "Google", contextLength: 1048576 },
  { id: "google/gemini-3-1-pro", name: "Gemini 3.1 Pro", provider: "Google", contextLength: 1048576 },
];

export async function GET() {
  try {
    return NextResponse.json({ models: KIE_LLM_MODELS });
  } catch (e) {
    return NextResponse.json({ models: KIE_LLM_MODELS });
  }
}
