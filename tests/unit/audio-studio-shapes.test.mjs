/* What the audio and perform studios decide BEFORE they submit — each case is
   a surface that offered something it could not run (audit 2026-09-21). */
import { describe, expect, it } from "vitest";
import {
  voiceFieldFor, audioToolShape, performInput, performancePrompt, NEUTRAL_PERFORMANCE,
  billableAudioSeconds, decodeTextOutput,
  buildSunoVoiceValidateBody, buildSunoVoiceGenerateBody, buildSunoReplaceSectionBody,
} from "../../src/lib/audio-payload-core.mjs";
import { audioKind, schemaForModel, validateModelInput, GEMINI_TTS_VOICES } from "../../src/lib/model-catalog-core.mjs";

const withSchema = (id, capability = "audio") => ({ id, capability, schema: schemaForModel(id, capability) });

describe("the voice picker reads the model's own schema", () => {
  it("Gemini TTS: the field is voice_name and the cast is its 30-name enum", () => {
    const v = voiceFieldFor(withSchema("google/gemini-3-1-flash-tts", "text-to-speech"));
    expect(v.field).toBe("voice_name");
    expect(v.options).toEqual(GEMINI_TTS_VOICES);
    expect(v.default).toBe("Charon");
  });
  it("a model that takes `voice` with no enum gets no cast of its own (the stock one applies)", () => {
    expect(voiceFieldFor({ schema: { fields: { prompt: {}, voice: { type: "string" } } } })).toMatchObject({ field: "voice", options: null });
    expect(voiceFieldFor({ schema: { fields: { voice_id: { type: "string" } } } }).field).toBe("voice_id");
  });
  it("a schema with no voice field has no voice to choose; no schema at all is unknown, not hidden", () => {
    expect(voiceFieldFor({ schema: { fields: { prompt: {} } } })).toBeNull();
    expect(voiceFieldFor({})).toEqual({ field: "voice", options: null });
  });
});

describe("Audio Tools shapes its form to the utility", () => {
  it("stem separation takes a track and NO prompt", () => {
    expect(audioToolShape("separate-vocals")).toMatchObject({ needsTrack: true, prompt: "none", op: true, output: "audio" });
  });
  it("lyrics and style-boost give back TEXT and need no track", () => {
    for (const id of ["generate-lyrics", "boost-music-style"]) {
      expect(audioToolShape(id)).toMatchObject({ output: "text", needsTrack: false, prompt: "required" });
    }
  });
  it("ops the Music timeline also offers are built by its opParams, not a second shape", () => {
    for (const id of ["add-vocals", "add-instrumental", "upload-and-cover-audio", "upload-and-extend-audio", "separate-vocals"]) {
      expect(audioToolShape(id).op, id).toBe(true);
    }
  });
  it("replace-section (needs a timeline window) and the voice-clone steps (a wizard) are not listed here", () => {
    for (const id of ["replace-section", "suno-voice-validate", "suno-voice-generate"]) {
      expect(audioToolShape(id).listed, id).toBe(false);
    }
  });
  it("decodes a text result, and only one of ours", () => {
    expect(decodeTextOutput("data:text/plain;charset=utf-8,Verse%20one%0AVerse%20two")).toBe("Verse one\nVerse two");
    expect(decodeTextOutput("https://cdn/a.mp3")).toBeNull();
    expect(decodeTextOutput("data:text/plain;charset=utf-8,%E0%A4%A")).toBeNull();
  });
});

describe("gemini-omni-audio builds a voice; it is not a utility", () => {
  it("is filed with voice cloning, so Audio Tools (a prompt and a track) never offers it", () => {
    expect(audioKind({ modelId: "gemini-omni-audio", capability: "audio" })).toBe("voice-clone");
    expect(audioKind({ modelId: "separate-vocals", capability: "audio" })).toBe("enhancement");
    expect(audioKind({ modelId: "generate-music", capability: "audio" })).toBe("music");
  });
});

describe("the stub schemas — a priced row is validated against its schema at quote time", () => {
  const REC = "https://cdn/rec.mp3";

  it("the voice wizard's step 1 sends no prompt, and is no longer refused for lacking one", () => {
    const schema = schemaForModel("suno-voice-validate", "audio");
    expect(schema.fields.prompt).toBeUndefined();
    const sent = { audio_url: REC, vocal_start_s: 0, vocal_end_s: 12 };
    expect(validateModelInput(schema, sent)).toEqual([]);
    expect(buildSunoVoiceValidateBody("", sent)).toEqual({ voiceUrl: REC, vocalStartS: 0, vocalEndS: 12 });
    expect(validateModelInput(schema, { vocal_start_s: 0, vocal_end_s: 12 }).map((e) => e.field)).toEqual(["audio_url"]);
  });

  it("step 3 needs the validate task and the read phrase", () => {
    const schema = schemaForModel("suno-voice-generate", "audio");
    const sent = { task_id: "t-1", audio_url: REC, voice_name: "Aino" };
    expect(validateModelInput(schema, sent)).toEqual([]);
    expect(buildSunoVoiceGenerateBody("", sent)).toEqual({ taskId: "t-1", verifyUrl: REC, voiceName: "Aino" });
    expect(validateModelInput(schema, { audio_url: REC }).map((e) => e.field)).toEqual(["task_id"]);
  });

  it("replace-section declares the window its route cannot run without", () => {
    const schema = schemaForModel("replace-section", "audio");
    const sent = { audio_url: REC, prompt: "quieter", infill_start_s: 10, infill_end_s: 30, style: "ambient", title: "Anthem" };
    expect(validateModelInput(schema, sent)).toEqual([]);
    expect(buildSunoReplaceSectionBody("replace-section", "", sent)).toMatchObject({ uploadUrl: REC, infillStartS: 10, infillEndS: 30, tags: "ambient", title: "Anthem", prompt: "quieter" });
    expect(validateModelInput(schema, { audio_url: REC, prompt: "x" }).map((e) => e.field).sort()).toEqual(["infill_end_s", "infill_start_s"]);
  });
});

describe("Lip Sync and Avatar are split by what a model takes", () => {
  const avatar = (id) => withSchema(id, "avatar-video");

  it("a still made to speak is Avatar's: kling avatars, infinitalk, the wan speech avatar", () => {
    for (const id of ["kling/ai-avatar-pro", "kling/ai-avatar-standard", "infinitalk/from-audio", "wan/2-2-a14b-speech-to-video-turbo"]) {
      expect(performInput(avatar(id)), id).toBe("still");
    }
  });
  it("a clip re-synced to a voice is Lip Sync's: volcengine", () => {
    expect(performInput(avatar("volcengine/video-to-video-lip-sync"))).toBe("clip");
  });
  it("a model with no audio input is not a speaking model at all (the two detection utilities)", () => {
    expect(performInput({ schema: { fields: { image_url: {} } } })).toBeNull();
    expect(performInput({})).toBeNull();
    expect(performInput({ schema: { fields: { image_url: {}, video_url: {}, audio_url: {} } } })).toBe("either");
  });

  it("a model that REQUIRES a prompt gets the neutral direction when none was written", () => {
    const infinitalk = avatar("infinitalk/from-audio");
    expect(infinitalk.schema.fields.prompt.required).toBe(true);
    expect(performancePrompt(infinitalk, "  ")).toBe(NEUTRAL_PERFORMANCE);
    expect(performancePrompt(infinitalk, " small nods ")).toBe("small nods");
    // A model with no prompt field is sent none.
    expect(performancePrompt(avatar("volcengine/video-to-video-lip-sync"), "")).toBe("");
  });

  it("the billed length is the voice's, rounded up; unknown is undefined, never zero", () => {
    expect(billableAudioSeconds(12.2)).toBe(13);
    expect(billableAudioSeconds(8)).toBe(8);
    expect(billableAudioSeconds(0)).toBeUndefined();
    expect(billableAudioSeconds(NaN)).toBeUndefined();
  });
});
