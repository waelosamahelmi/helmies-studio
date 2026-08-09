import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { authzResponse } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";
import { checkRateLimit } from "@/lib/security";
import { apiError } from "@/lib/api-error";
import { llmComplete } from "@/lib/providers";
import { audioPart } from "@/lib/agent-multimodal.mjs";
import { TRANSCRIBE_LLM } from "@/lib/llm-models.mjs";
import { log } from "@/lib/log";

// Speech to text — what somebody said, as the words they said.
//
// There is no separate transcription vendor here on purpose. The models the
// agent already thinks with take audio directly (see llm-models.mjs: the
// Gemini rows list "audio" among their input modalities), so a voice note is
// one ordinary completion with an input_audio part. One provider, one key,
// one bill, and the same model that will answer the question is the one that
// heard it.
//
// Costs no credits. It is a fraction of a cent of LLM time, and charging for
// pressing a microphone button would make people type instead.

const MAX_BYTES = 25 * 1024 * 1024;
const FORMATS = { "audio/webm": "webm", "audio/mp4": "mp4", "audio/mpeg": "mp3", "audio/wav": "wav", "audio/x-wav": "wav", "audio/ogg": "ogg" };

export async function POST(req) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError({ code: "unauthorized" });
    verifyOrigin(req);

    const rl = await checkRateLimit(user.id, "/api/agent");
    if (!rl.allowed) return apiError({ code: "rate_limited", extra: { retryAfter: rl.retryAfter } });

    const form = await req.formData();
    const file = form.get("audio");
    if (!file || typeof file.arrayBuffer !== "function") {
      return apiError({ code: "bad_request", message: "No audio provided." });
    }

    const mime = String(file.type || "").toLowerCase().split(";")[0].trim();
    const format = FORMATS[mime];
    if (!format) {
      return apiError({ status: 415, code: "unsupported_setting", message: "That audio format is not supported." });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    if (!buf.length) return apiError({ code: "bad_request", message: "That recording was empty." });
    if (buf.length > MAX_BYTES) {
      return apiError({ status: 413, code: "bad_request", message: "That recording is too long." });
    }

    /* The instruction matters more than it looks. Left to itself a model
       hands back "The speaker says that they would like…" — a description of
       the recording rather than its words — and that description then goes
       into the conversation as if the user had typed it. */
    const text = await llmComplete(
      [
        {
          role: "system",
          content: [
            "You transcribe speech for a creative studio. Reply with the words that were spoken and NOTHING else.",
            "No preamble, no quotation marks, no speaker labels, no description of the recording, no commentary on audio quality.",
            "Keep the speaker's own language. Punctuate naturally. Spell names of models, brands and people as best you can.",
            "If the audio contains no discernible speech, reply with exactly: (no speech)",
          ].join(" "),
        },
        { role: "user", content: [{ type: "text", text: "Transcribe this." }, audioPart(buf.toString("base64"), format)] },
      ],
      { model: TRANSCRIBE_LLM, needs: ["audio"], temperature: 0, maxTokens: 1200, timeout: 90000 },
    );

    const said = String(text || "").trim();
    if (!said || said === "(no speech)") {
      return NextResponse.json({ text: "", empty: true });
    }
    return NextResponse.json({ text: said });
  } catch (e) {
    try { log.error("agent_transcribe_failed", { error: e?.message }); } catch { /* never mask the response */ }
    return authzResponse(e);
  }
}
