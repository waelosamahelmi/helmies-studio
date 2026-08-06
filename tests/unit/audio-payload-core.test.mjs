// Audio generation was 0-for-30 in production. Every assertion below is
// pinned to a REAL response from the live KIE account (2026-08-05) — the
// exact strings are quoted in src/lib/audio-payload-core.mjs's header:
//
//   input:{prompt}            → {"code":500,"msg":"text is required"}
//   input:{text}              → {"code":422,"msg":"voiceId cannot be empty"}
//   input:{text,voiceId}      → {"code":422,"msg":"voiceId cannot be empty"}   ← the trap
//   input:{text,voice}        → {"code":200,"msg":"success"}
//   createTask generate-music → {"code":422,"msg":"…model name…not supported"}
//   POST /api/v1/generate     → {"code":200,"msg":"success"} → real .mp3
import { describe, it, expect } from "vitest";

import {
  AUDIO_FAMILY,
  audioProviderFamily,
  audioSubmitPath,
  audioPollPath,
  formatAudioRequest,
  buildSunoMusicBody,
  resolveSunoEngine,
  resolveElevenLabsVoice,
  resolveGeminiVoice,
  parseSunoPoll,
  isSunoPollBody,
  SUNO_SUBMIT_PATH,
  SUNO_POLL_PATH,
  SUNO_DEFAULT_ENGINE,
  ELEVENLABS_VOICE_IDS,
  GEMINI_VOICE_NAMES,
  buildSunoStyleBody,
  buildSunoLyricsBody,
  buildSunoSoundsBody,
  buildSunoUploadCoverBody,
  buildSunoUploadExtendBody,
  buildSunoAddInstrumentalBody,
  buildSunoAddVocalsBody,
  buildSunoVocalRemovalBody,
  parseSunoLyricsPoll,
  parseSunoStylePoll,
  parseSunoVocalRemovalPoll,
  parseAudioOpPoll,
  SUNO_STYLE_SUBMIT_PATH,
  SUNO_STYLE_POLL_PATH,
  SUNO_LYRICS_SUBMIT_PATH,
  SUNO_LYRICS_POLL_PATH,
  SUNO_SOUNDS_SUBMIT_PATH,
  SUNO_UPLOAD_COVER_PATH,
  SUNO_UPLOAD_EXTEND_PATH,
  SUNO_ADD_INSTRUMENTAL_PATH,
  SUNO_ADD_VOCALS_PATH,
  SUNO_VOCAL_REMOVAL_SUBMIT_PATH,
  SUNO_VOCAL_REMOVAL_POLL_PATH,
  buildSunoReplaceSectionBody,
  buildSunoVoiceValidateBody,
  buildSunoVoiceGenerateBody,
  parseSunoVoiceValidatePoll,
  parseSunoVoiceGeneratePoll,
  SUNO_REPLACE_SECTION_PATH,
  SUNO_VOICE_VALIDATE_PATH,
  SUNO_VOICE_VALIDATE_POLL_PATH,
  SUNO_VOICE_GENERATE_PATH,
  SUNO_VOICE_RECORD_INFO_PATH,
} from "@/lib/audio-payload-core.mjs";

describe("audioProviderFamily", () => {
  it("classifies the ElevenLabs speech models", () => {
    expect(audioProviderFamily("elevenlabs/text-to-speech-multilingual-v2")).toBe(AUDIO_FAMILY.ELEVENLABS_TTS);
    expect(audioProviderFamily("elevenlabs/text-to-speech-turbo-2-5")).toBe(AUDIO_FAMILY.ELEVENLABS_TTS);
    expect(audioProviderFamily("elevenlabs-text-to-speech-turbo-2.5")).toBe(AUDIO_FAMILY.ELEVENLABS_TTS);
  });

  it("classifies dialogue BEFORE plain speech (it is a different body shape)", () => {
    expect(audioProviderFamily("elevenlabs/text-to-dialogue-v3")).toBe(AUDIO_FAMILY.ELEVENLABS_DIALOGUE);
  });

  it("classifies Google's multi-speaker TTS", () => {
    expect(audioProviderFamily("google/gemini-3-1-flash-tts")).toBe(AUDIO_FAMILY.GEMINI_TTS);
    expect(audioProviderFamily("gemini-2-5-pro-tts")).toBe(AUDIO_FAMILY.GEMINI_TTS);
  });

  it("claims ONLY the from-scratch music composers", () => {
    expect(audioProviderFamily("generate-music")).toBe(AUDIO_FAMILY.SUNO_MUSIC);
    expect(audioProviderFamily("suno-v5")).toBe(AUDIO_FAMILY.SUNO_MUSIC);
    expect(audioProviderFamily("suno-v4.5-plus")).toBe(AUDIO_FAMILY.SUNO_MUSIC);
  });

  it("claims the 8 implementable Suno ops (EDITSv1 M3) under their own families", () => {
    expect(audioProviderFamily("boost-music-style")).toBe(AUDIO_FAMILY.SUNO_STYLE);
    expect(audioProviderFamily("generate-lyrics")).toBe(AUDIO_FAMILY.SUNO_LYRICS);
    expect(audioProviderFamily("generate-sounds")).toBe(AUDIO_FAMILY.SUNO_SOUNDS);
    expect(audioProviderFamily("upload-and-cover-audio")).toBe(AUDIO_FAMILY.SUNO_UPLOAD_COVER);
    expect(audioProviderFamily("upload-and-extend-audio")).toBe(AUDIO_FAMILY.SUNO_UPLOAD_EXTEND);
    expect(audioProviderFamily("add-instrumental")).toBe(AUDIO_FAMILY.SUNO_ADD_INSTRUMENTAL);
    expect(audioProviderFamily("add-vocals")).toBe(AUDIO_FAMILY.SUNO_ADD_VOCALS);
    expect(audioProviderFamily("separate-vocals")).toBe(AUDIO_FAMILY.SUNO_VOCAL_SEPARATION);
    // Vendor-prefixed spellings resolve the same way.
    expect(audioProviderFamily("suno/boost-music-style")).toBe(AUDIO_FAMILY.SUNO_STYLE);
  });

  it("leaves the Suno ops that need a UI concept the studio lacks alone — they keep failing honestly", () => {
    // S2 removed replace-section and suno-voice-generate from this list —
    // the Music timeline's range selector and the voice-clone wizard now
    // supply exactly the context those two lacked (see the S2 describes
    // below). The rest still have no surface and stay unclaimed.
    for (const id of [
      "extend-music", "generate-persona", "generate-mashup",
      "convert-to-wav", "cover-suno", "generate-midi",
    ]) {
      expect(audioProviderFamily(id)).toBeNull();
    }
  });

  it("leaves non-audio and already-working models alone", () => {
    // audio-isolation already works on the generic route with a plain
    // audio_url (live: {"code":500,"msg":"audio_url is required"} → it is
    // reachable and correctly shaped) — remapping it would be a regression.
    expect(audioProviderFamily("elevenlabs/audio-isolation")).toBeNull();
    expect(audioProviderFamily("flux-2/pro-text-to-image")).toBeNull();
    expect(audioProviderFamily("")).toBeNull();
    expect(audioProviderFamily(null)).toBeNull();
  });
});

describe("ElevenLabs TTS body (the shape that was 422-ing)", () => {
  it("sends `text`, never `prompt` — the exact field the provider demanded", () => {
    const { body } = formatAudioRequest("elevenlabs/text-to-speech-multilingual-v2", "Read this aloud.", {});
    expect(body.input.text).toBe("Read this aloud.");
    expect(body.input.prompt).toBeUndefined();
  });

  it("sends the voice as `voice` — `voiceId` is the provider's ERROR wording, not its field", () => {
    const { body } = formatAudioRequest("elevenlabs/text-to-speech-multilingual-v2", "hi", { voice: "bella" });
    expect(body.input.voice).toBe(ELEVENLABS_VOICE_IDS.bella);
    expect(body.input.voiceId).toBeUndefined();
    expect(body.input.voice_id).toBeUndefined();
  });

  it("keeps the market envelope: { model, input } on the default route", () => {
    const req = formatAudioRequest("elevenlabs/text-to-speech-multilingual-v2", "hi", {});
    expect(req.path).toBeNull(); // caller's default createTask path
    expect(req.body.model).toBe("elevenlabs/text-to-speech-multilingual-v2");
    expect(Object.keys(req.body)).toEqual(["model", "input"]);
  });

  it("forwards the delivery controls the studio actually offers", () => {
    const { body } = formatAudioRequest("elevenlabs/text-to-speech-turbo-2-5", "hi", {
      voice: "sam", stability: 0.3, similarity_boost: 0.9, speed: 1.1,
    });
    expect(body.input).toMatchObject({ stability: 0.3, similarity_boost: 0.9, speed: 1.1 });
  });

  it("DROPS fields the model has no idea about instead of posting them", () => {
    // /api/generate/async injects negative_prompt into every payload.
    const { body } = formatAudioRequest("elevenlabs/text-to-speech-multilingual-v2", "hi", {
      negative_prompt: "blurry", aspect_ratio: "16:9", duration: 30, callBackUrl: "https://x/y",
    });
    expect(body.input.negative_prompt).toBeUndefined();
    expect(body.input.aspect_ratio).toBeUndefined();
    expect(body.input.duration).toBeUndefined();
    expect(body.input.callBackUrl).toBeUndefined();
  });

  it("never invents the script — an absent text stays absent", () => {
    const { body } = formatAudioRequest("elevenlabs/text-to-speech-multilingual-v2", "", {});
    expect(body.input.text).toBeUndefined();
    expect("text" in body.input).toBe(false);
  });
});

describe("voice resolution", () => {
  it("translates every studio voice slug to a provider-accepted identifier", () => {
    // Live 422: "Invalid voice parameter: rachel. Please refer to the
    // documentation for the list of supported voices."
    for (const slug of ["rachel", "domi", "bella", "elli", "antoni", "josh", "arnold", "sam"]) {
      expect(resolveElevenLabsVoice({ voice: slug })).toBe(ELEVENLABS_VOICE_IDS[slug]);
      expect(resolveElevenLabsVoice({ voice: slug })).not.toBe(slug);
      expect(resolveGeminiVoice({ voice: slug })).toBe(GEMINI_VOICE_NAMES[slug]);
    }
  });

  it("passes an unknown value straight through (a real provider voice id)", () => {
    expect(resolveElevenLabsVoice({ voice: "EkK5I93UQWFDigLMpZcX" })).toBe("EkK5I93UQWFDigLMpZcX");
    expect(resolveGeminiVoice({ voice: "Fenrir" })).toBe("Fenrir");
  });

  it("accepts the voice under any of the names callers use", () => {
    expect(resolveElevenLabsVoice({ voice_id: "sam" })).toBe(ELEVENLABS_VOICE_IDS.sam);
    expect(resolveElevenLabsVoice({ voiceId: "sam" })).toBe(ELEVENLABS_VOICE_IDS.sam);
    expect(resolveGeminiVoice({ voice_name: "sam" })).toBe(GEMINI_VOICE_NAMES.sam);
  });

  it("fills a default when none was picked — both providers hard-reject an empty voice", () => {
    // "voiceId cannot be empty" / "The voice_name parameter cannot be empty"
    expect(resolveElevenLabsVoice({})).toBe(ELEVENLABS_VOICE_IDS.rachel);
    expect(resolveGeminiVoice({})).toBe(GEMINI_VOICE_NAMES.rachel);
  });
});

describe("ElevenLabs dialogue body", () => {
  it("wraps a plain studio submit into a single turn", () => {
    const { body } = formatAudioRequest("elevenlabs/text-to-dialogue-v3", "Two lines.", { voice: "josh" });
    expect(body.input.dialogue).toEqual([{ text: "Two lines.", voice: ELEVENLABS_VOICE_IDS.josh }]);
    expect(body.input.text).toBeUndefined();
  });

  it("keeps caller-built turns and resolves each turn's own voice", () => {
    const { body } = formatAudioRequest("elevenlabs/text-to-dialogue-v3", "ignored", {
      dialogue: [{ text: "A", voice: "bella" }, { text: "B", voiceId: "arnold" }],
      stability: 0.5,
    });
    expect(body.input.dialogue).toEqual([
      { text: "A", voice: ELEVENLABS_VOICE_IDS.bella },
      { text: "B", voice: ELEVENLABS_VOICE_IDS.arnold },
    ]);
    expect(body.input.stability).toBe(0.5);
  });
});

describe("Google TTS body", () => {
  it("builds the speakers/dialogue_turns pair the model demands", () => {
    // Live 422s: "The speakers parameter cannot be empty" for a `prompt`
    // payload; a 200 + real .wav for this shape.
    const { body } = formatAudioRequest("google/gemini-3-1-flash-tts", "Testing one two three.", { voice: "arnold" });
    expect(body.input.speakers).toEqual([{ speaker_id: "Speaker 1", voice_name: GEMINI_VOICE_NAMES.arnold }]);
    expect(body.input.dialogue_turns).toEqual([{ speaker_id: "Speaker 1", text: "Testing one two three." }]);
    expect(body.input.prompt).toBeUndefined();
  });

  it("never invents a script", () => {
    const { body } = formatAudioRequest("google/gemini-3-1-flash-tts", "", {});
    expect(body.input.dialogue_turns).toBeUndefined();
  });

  it("keeps a caller's own multi-speaker cast untouched", () => {
    const speakers = [{ speaker_id: "S1", voice_name: "Fenrir" }, { speaker_id: "S2", voice_name: "Puck" }];
    const dialogue_turns = [{ speaker_id: "S1", text: "A" }, { speaker_id: "S2", text: "B" }];
    const { body } = formatAudioRequest("google/gemini-3-1-flash-tts", "x", { speakers, dialogue_turns });
    expect(body.input.speakers).toBe(speakers);
    expect(body.input.dialogue_turns).toBe(dialogue_turns);
  });
});

describe("Suno music route", () => {
  it("routes music to its own path — the market route rejects the model outright", () => {
    expect(audioSubmitPath("generate-music")).toBe(SUNO_SUBMIT_PATH);
    expect(audioSubmitPath("suno-v4.5")).toBe(SUNO_SUBMIT_PATH);
    expect(audioSubmitPath("elevenlabs/text-to-speech-turbo-2-5")).toBeNull();
    expect(audioSubmitPath("flux-2/pro-text-to-image")).toBeNull();
  });

  it("polls music on its own record-info path, everything else on the default", () => {
    expect(audioPollPath("generate-music", "abc123")).toBe(`${SUNO_POLL_PATH}?taskId=abc123`);
    expect(audioPollPath("flux-2/pro-text-to-image", "abc123")).toBeNull();
    expect(audioPollPath(null, "abc123")).toBeNull();
  });

  it("posts a FLAT body whose `model` is the engine selector, not the slug", () => {
    const req = formatAudioRequest("generate-music", "a calm lofi piano loop", {});
    expect(req.path).toBe(SUNO_SUBMIT_PATH);
    expect(req.body.model).toBe(SUNO_DEFAULT_ENGINE);
    expect(req.body.prompt).toBe("a calm lofi piano loop");
    expect(req.body.input).toBeUndefined();
    expect(req.body.customMode).toBe(false);
    expect(req.body.instrumental).toBe(false);
  });

  it("reads the engine off a version-pinned catalog id", () => {
    expect(resolveSunoEngine("suno-v4")).toBe("V4");
    expect(resolveSunoEngine("suno-v4.5")).toBe("V4_5");
    expect(resolveSunoEngine("suno-v4-5-plus")).toBe("V4_5PLUS");
    expect(resolveSunoEngine("suno-v4.5-all")).toBe("V4_5ALL");
    expect(resolveSunoEngine("suno-v5")).toBe("V5");
    expect(resolveSunoEngine("suno-v5.5")).toBe("V5_5");
    expect(resolveSunoEngine("generate-music")).toBe(SUNO_DEFAULT_ENGINE);
    expect(resolveSunoEngine("generate-music", { engine: "v4_5" })).toBe("V4_5");
  });

  it("camelCases the studio's snake_case music params", () => {
    const body = buildSunoMusicBody("generate-music", "hopeful theme", {
      style: "lofi, piano", title: "Paper Rain", negative_tags: "heavy metal", vocal_gender: "f",
    });
    expect(body.negativeTags).toBe("heavy metal");
    expect(body.vocalGender).toBe("f");
    expect(body.negative_tags).toBeUndefined();
    expect(body.vocal_gender).toBeUndefined();
  });

  it("turns custom mode on exactly when a custom-only field survived the mapping", () => {
    expect(buildSunoMusicBody("generate-music", "x", {}).customMode).toBe(false);
    expect(buildSunoMusicBody("generate-music", "x", { style: "lofi" }).customMode).toBe(true);
    expect(buildSunoMusicBody("generate-music", "x", { title: "T" }).customMode).toBe(true);
    // Dropped for this engine (see below) → it must not switch the mode.
    expect(buildSunoMusicBody("suno-v5", "x", { duration: 60 }).customMode).toBe(false);
    expect(buildSunoMusicBody("generate-music", "x", { style: "lofi", custom_mode: false }).customMode).toBe(false);
  });

  it("forwards duration ONLY where the provider accepts it", () => {
    // Live 422: "duration is only supported when customMode is true and
    // model is V5_5".
    const v55 = buildSunoMusicBody("generate-music", "x", { duration: 60 });
    expect(v55.model).toBe("V5_5");
    expect(v55.duration).toBe(60);
    expect(v55.customMode).toBe(true);

    const v5 = buildSunoMusicBody("suno-v5", "x", { duration: 60 });
    expect(v5.duration).toBeUndefined();
  });

  it("drops junk the studio pipeline adds, and never invents a brief", () => {
    const body = buildSunoMusicBody("generate-music", "", { negative_prompt: "blurry", aspect_ratio: "16:9" });
    expect(body.negative_prompt).toBeUndefined();
    expect(body.aspect_ratio).toBeUndefined();
    expect(body.prompt).toBeUndefined();
  });

  it("passes a boolean instrumental through and coerces the string form", () => {
    expect(buildSunoMusicBody("generate-music", "x", { instrumental: true }).instrumental).toBe(true);
    expect(buildSunoMusicBody("generate-music", "x", { instrumental: "true" }).instrumental).toBe(true);
    expect(buildSunoMusicBody("generate-music", "x", { instrumental: false }).instrumental).toBe(false);
  });
});

describe("Suno poll parsing (the failure branch included)", () => {
  const success = {
    taskId: "t1",
    status: "SUCCESS",
    response: { sunoData: [{ id: "a", audioUrl: "https://cdn/x.mp3", streamAudioUrl: "https://cdn/stream" }] },
  };

  it("recognises the music envelope by shape, not by model id", () => {
    expect(isSunoPollBody(success)).toBe(true);
    expect(isSunoPollBody({ state: "success", resultJson: "{}" })).toBe(false);
    expect(isSunoPollBody(null)).toBe(false);
  });

  it("returns the finished track", () => {
    expect(parseSunoPoll(success)).toEqual({ status: "success", outputs: ["https://cdn/x.mp3"], error: undefined });
  });

  it("stays pending while the audio url is still empty", () => {
    // Real intermediate body: audioUrl "" with a stream url already present.
    const partial = { status: "FIRST_SUCCESS", response: { sunoData: [{ audioUrl: "", streamAudioUrl: "https://cdn/s" }] } };
    expect(parseSunoPoll(partial).status).toBe("pending");
    expect(parseSunoPoll({ status: "PENDING", response: null }).status).toBe("pending");
  });

  it("fails terminally on every provider failure status", () => {
    for (const status of ["CREATE_TASK_FAILED", "GENERATE_AUDIO_FAILED", "CALLBACK_EXCEPTION", "SENSITIVE_WORD_ERROR"]) {
      const parsed = parseSunoPoll({ status, response: null, errorMessage: null, errorCode: null });
      expect(parsed.status).toBe("failed");
      expect(parsed.error).toBe(status);
    }
  });

  it("prefers the provider's own message when it gives one", () => {
    const parsed = parseSunoPoll({ status: "GENERATE_AUDIO_FAILED", errorMessage: "upstream refused" });
    expect(parsed.error).toBe("upstream refused");
  });

  it("declines a body that is not the music envelope, so the generic parser still runs", () => {
    expect(parseSunoPoll({ state: "success", resultJson: '{"resultUrls":["https://x/y.png"]}' })).toBeNull();
  });
});

// ── EDITSv1 M3 — Suno-suite operations ─────────────────────────────────────
// Shapes pinned to docs/model-audit/audio-music.md's per-op "Doc says" lines.
describe("Suno op submit routing", () => {
  it("routes each op to its own dedicated path", () => {
    expect(audioSubmitPath("boost-music-style")).toBe(SUNO_STYLE_SUBMIT_PATH);
    expect(audioSubmitPath("generate-lyrics")).toBe(SUNO_LYRICS_SUBMIT_PATH);
    expect(audioSubmitPath("generate-sounds")).toBe(SUNO_SOUNDS_SUBMIT_PATH);
    expect(audioSubmitPath("upload-and-cover-audio")).toBe(SUNO_UPLOAD_COVER_PATH);
    expect(audioSubmitPath("upload-and-extend-audio")).toBe(SUNO_UPLOAD_EXTEND_PATH);
    expect(audioSubmitPath("add-instrumental")).toBe(SUNO_ADD_INSTRUMENTAL_PATH);
    expect(audioSubmitPath("add-vocals")).toBe(SUNO_ADD_VOCALS_PATH);
    expect(audioSubmitPath("separate-vocals")).toBe(SUNO_VOCAL_REMOVAL_SUBMIT_PATH);
  });

  it("polls the /generate/* transformer ops at the shared music record-info, and the rest at their own", () => {
    for (const id of ["generate-sounds", "upload-and-cover-audio", "upload-and-extend-audio", "add-instrumental", "add-vocals"]) {
      expect(audioPollPath(id, "t-1")).toBe(`${SUNO_POLL_PATH}?taskId=t-1`);
    }
    expect(audioPollPath("boost-music-style", "t-2")).toBe(`${SUNO_STYLE_POLL_PATH}?taskId=t-2`);
    expect(audioPollPath("generate-lyrics", "t-3")).toBe(`${SUNO_LYRICS_POLL_PATH}?taskId=t-3`);
    expect(audioPollPath("separate-vocals", "t-4")).toBe(`${SUNO_VOCAL_REMOVAL_POLL_PATH}?taskId=t-4`);
  });
});

describe("boost-music-style — content, not prompt (audit root cause #4)", () => {
  it("maps the studio prompt onto the doc's one required field `content`", () => {
    const req = formatAudioRequest("boost-music-style", "dreamy synthwave with heavy bass", {});
    expect(req.path).toBe("/api/v1/style/generate");
    expect(req.body).toEqual({ content: "dreamy synthwave with heavy bass" });
  });

  it("never invents content — an empty submit stays empty for the provider's own validator", () => {
    expect(buildSunoStyleBody("", {})).toEqual({});
  });
});

describe("generate-lyrics — its own /lyrics path (field name already matched)", () => {
  it("posts { prompt } to /api/v1/lyrics", () => {
    const req = formatAudioRequest("generate-lyrics", "a song about the sea", {});
    expect(req.path).toBe("/api/v1/lyrics");
    expect(req.body).toEqual({ prompt: "a song about the sea" });
    expect(buildSunoLyricsBody("x", { negative_prompt: "injected" })).toEqual({ prompt: "x" });
  });
});

describe("generate-sounds — /generate/sounds with the V5|V5_5 engine enum", () => {
  it("defaults the newest engine and forwards the optional sound settings camelCased", () => {
    const body = buildSunoSoundsBody("generate-sounds", "rain on a tin roof", {
      sound_loop: true, sound_tempo: "slow", sound_key: "C minor", grab_lyrics: false,
    });
    expect(body).toEqual({
      model: SUNO_DEFAULT_ENGINE,
      prompt: "rain on a tin roof",
      soundLoop: true, soundTempo: "slow", soundKey: "C minor", grabLyrics: false,
    });
  });

  it("collapses an engine outside the doc's V5|V5_5 enum to the default", () => {
    expect(buildSunoSoundsBody("generate-sounds", "x", { engine: "V4" }).model).toBe(SUNO_DEFAULT_ENGINE);
    expect(buildSunoSoundsBody("generate-sounds", "x", { engine: "V5" }).model).toBe("V5");
  });
});

describe("upload-and-cover-audio — the Dropzone's audio_url becomes the doc's uploadUrl", () => {
  it("builds the generate-music shape plus uploadUrl, without generate-only duration", () => {
    const req = formatAudioRequest("upload-and-cover-audio", "make it orchestral", {
      audio_url: "https://cdn.example/track.mp3",
      style: "orchestral",
      title: "Covered",
      instrumental: false,
      duration: 120,
    });
    expect(req.path).toBe("/api/v1/generate/upload-cover");
    expect(req.body.uploadUrl).toBe("https://cdn.example/track.mp3");
    expect(req.body.prompt).toBe("make it orchestral");
    expect(req.body.style).toBe("orchestral");
    expect(req.body.title).toBe("Covered");
    expect(req.body.customMode).toBe(true);
    expect(req.body.instrumental).toBe(false);
    expect(req.body.duration).toBeUndefined(); // cover keeps its source's length
    expect(req.body.model).toBe(SUNO_DEFAULT_ENGINE);
  });
});

describe("upload-and-extend-audio — defaultParamFlag keyed off continueAt", () => {
  it("a bare upload extends with provider defaults (defaultParamFlag false, nothing else)", () => {
    const body = buildSunoUploadExtendBody("upload-and-extend-audio", "ignored in default mode", {
      audio_url: "https://cdn.example/track.mp3",
    });
    expect(body).toEqual({
      model: SUNO_DEFAULT_ENGINE,
      uploadUrl: "https://cdn.example/track.mp3",
      defaultParamFlag: false,
      // Live-verified 2026-08-06: the provider 422s ("instrumental cannot
      // be null") when the key is omitted, even in default-param mode.
      instrumental: false,
    });
  });

  it("a supplied continue_at switches to custom mode and carries prompt/style/title", () => {
    const body = buildSunoUploadExtendBody("upload-and-extend-audio", "carry the chorus onward", {
      audio_url: "https://cdn.example/track.mp3",
      continue_at: 45,
      style: "synthpop",
      title: "Extended",
    });
    expect(body.defaultParamFlag).toBe(true);
    expect(body.continueAt).toBe(45);
    expect(body.prompt).toBe("carry the chorus onward");
    expect(body.style).toBe("synthpop");
    expect(body.title).toBe("Extended");
  });
});

describe("add-instrumental / add-vocals — uploadUrl + the doc-required text fields", () => {
  it("add-instrumental sends uploadUrl/title/tags/negativeTags (style is the canonical spelling of tags)", () => {
    const req = formatAudioRequest("add-instrumental", "unused", {
      audio_url: "https://cdn.example/vocals.mp3",
      title: "Backing",
      style: "lofi hiphop",
      negative_tags: "metal",
    });
    expect(req.path).toBe("/api/v1/generate/add-instrumental");
    expect(req.body).toEqual({
      uploadUrl: "https://cdn.example/vocals.mp3",
      title: "Backing",
      tags: "lofi hiphop",
      negativeTags: "metal",
    });
  });

  it("add-vocals sends prompt/title/style/negativeTags/uploadUrl", () => {
    const req = formatAudioRequest("add-vocals", "soulful vocals about rain", {
      audio_url: "https://cdn.example/instrumental.mp3",
      title: "Voiced",
      style: "soul",
      negative_tags: "screamo",
    });
    expect(req.path).toBe("/api/v1/generate/add-vocals");
    expect(req.body).toEqual({
      uploadUrl: "https://cdn.example/instrumental.mp3",
      prompt: "soulful vocals about rain",
      title: "Voiced",
      style: "soul",
      negativeTags: "screamo",
    });
  });

  it("a doc-required field the caller omitted stays absent — the provider's validator answers honestly", () => {
    const body = buildSunoAddInstrumentalBody("x", { audio_url: "https://cdn.example/a.mp3" });
    expect(body.title).toBeUndefined();
    expect(body.tags).toBeUndefined();
  });
});

describe("separate-vocals — camelCase audioUrl (the casing was the bug) + priced type modes", () => {
  it("sends audioUrl from the Dropzone's audio_url and defaults the cheapest type", () => {
    const req = formatAudioRequest("separate-vocals", "unused", { audio_url: "https://cdn.example/song.mp3" });
    expect(req.path).toBe("/api/v1/vocal-removal/generate");
    expect(req.body).toEqual({ audioUrl: "https://cdn.example/song.mp3", type: "separate_vocal" });
  });

  it("forwards a prior generation's taskId/audioId and a valid type; an unknown type collapses to the default", () => {
    const body = buildSunoVocalRemovalBody("x", { task_id: "t-9", audio_id: "a-9", type: "split_stem" });
    expect(body).toEqual({ taskId: "t-9", audioId: "a-9", type: "split_stem" });
    expect(buildSunoVocalRemovalBody("x", { type: "bogus" }).type).toBe("separate_vocal");
  });
});

describe("Suno op poll parsing (model-keyed, checked before the shape-detected music branch)", () => {
  it("lyrics: SUCCESS with lyricsData becomes text data: URIs; empty stays pending", () => {
    const done = parseSunoLyricsPoll({
      status: "SUCCESS",
      response: { lyricsData: [{ text: "Verse one\nline two", title: "A" }, { text: "Alt take", title: "B" }] },
    });
    expect(done.status).toBe("success");
    expect(done.outputs).toHaveLength(2);
    expect(done.outputs[0]).toBe(`data:text/plain;charset=utf-8,${encodeURIComponent("Verse one\nline two")}`);
    expect(parseSunoLyricsPoll({ status: "PENDING" }).status).toBe("pending");
    expect(parseSunoLyricsPoll({ status: "CREATE_TASK_FAILED" }).status).toBe("failed");
  });

  it("style boost: the boosted style text at response.result completes the task", () => {
    const done = parseSunoStylePoll({ status: "SUCCESS", response: { result: "dreamy synthwave, heavy bass, retro" } });
    expect(done.status).toBe("success");
    expect(done.outputs).toEqual([`data:text/plain;charset=utf-8,${encodeURIComponent("dreamy synthwave, heavy bass, retro")}`]);
    expect(parseSunoStylePoll({ status: "PENDING" }).status).toBe("pending");
    expect(parseSunoStylePoll({ successFlag: 2, errorMessage: "no" }).status).toBe("failed");
  });

  it("vocal removal: successFlag 1 collects stem URLs but never echoes the origin input back", () => {
    const done = parseSunoVocalRemovalPoll({
      successFlag: 1,
      response: {
        originUrl: "https://cdn.example/input.mp3",
        vocalUrl: "https://cdn.example/vocal.mp3",
        instrumentalUrl: "https://cdn.example/instrumental.mp3",
      },
    });
    expect(done.status).toBe("success");
    expect(done.outputs).toEqual(["https://cdn.example/vocal.mp3", "https://cdn.example/instrumental.mp3"]);
    expect(parseSunoVocalRemovalPoll({ successFlag: 0 }).status).toBe("pending");
    expect(parseSunoVocalRemovalPoll({ successFlag: 2, errorMessage: "bad file" })).toMatchObject({ status: "failed", error: "bad file" });
  });

  it("parseAudioOpPoll claims ONLY the three own-envelope ops — sunoData transformers fall through to parseSunoPoll", () => {
    const lyricsBody = { status: "SUCCESS", response: { lyricsData: [{ text: "hi" }] } };
    expect(parseAudioOpPoll(lyricsBody, "generate-lyrics").status).toBe("success");
    expect(parseAudioOpPoll(lyricsBody, "upload-and-cover-audio")).toBeNull();
    expect(parseAudioOpPoll(lyricsBody, "generate-music")).toBeNull();
    // The trap this ordering prevents: a lyrics SUCCESS body has no sunoData,
    // so the shape-detected music parser would claim it and report pending forever.
    expect(parseSunoPoll(lyricsBody).status).toBe("pending");
  });
});

// ── S2: replace-section + the voice-clone wizard's two paid steps ──────────
describe("S2 Suno ops — replace-section", () => {
  it("routes replace-section to its own path and polls the music record-info (sunoData transformer)", () => {
    expect(audioProviderFamily("replace-section")).toBe(AUDIO_FAMILY.SUNO_REPLACE_SECTION);
    expect(audioSubmitPath("replace-section")).toBe(SUNO_REPLACE_SECTION_PATH);
    expect(audioPollPath("replace-section", "t-1")).toBe(`${SUNO_POLL_PATH}?taskId=t-1`);
    // sunoData envelope → the shape-detected music parser handles it.
    expect(parseAudioOpPoll({ status: "SUCCESS" }, "replace-section")).toBeNull();
  });

  it("fresh-upload branch: uploadUrl + engine model + the infill window from the timeline range", () => {
    const body = buildSunoReplaceSectionBody("replace-section", "new bridge, half-time feel", {
      audio_url: "https://app.example/api/media/local/track.mp3",
      infillStartS: 12.5,
      infillEndS: 31.2,
      tags: "synthwave",
      title: "Night Drive",
      fullLyrics: "verse one...",
    });
    expect(body.uploadUrl).toBe("https://app.example/api/media/local/track.mp3");
    expect(body.model).toBe(SUNO_DEFAULT_ENGINE);
    expect(body.infillStartS).toBe(12.5);
    expect(body.infillEndS).toBe(31.2);
    expect(body.prompt).toBe("new bridge, half-time feel");
    expect(body.tags).toBe("synthwave");
    expect(body.title).toBe("Night Drive");
    expect(body.fullLyrics).toBe("verse one...");
    // The upload branch never carries the existing-track pair.
    expect(body.taskId).toBeUndefined();
    expect(body.audioId).toBeUndefined();
  });

  it("existing-track branch: taskId+audioId wins over uploadUrl and drops the engine selector", () => {
    const body = buildSunoReplaceSectionBody("replace-section", "p", {
      taskId: "task-9", audioId: "audio-9", audio_url: "https://x/y.mp3", infill_start_s: 6, infill_end_s: 20,
    });
    expect(body).toMatchObject({ taskId: "task-9", audioId: "audio-9", infillStartS: 6, infillEndS: 20 });
    expect(body.uploadUrl).toBeUndefined();
    expect(body.model).toBeUndefined();
  });

  it("style is accepted as the canonical spelling of tags", () => {
    expect(buildSunoReplaceSectionBody("replace-section", "p", { style: "lo-fi" }).tags).toBe("lo-fi");
  });
});

describe("S2 Suno voice-clone steps", () => {
  it("routes both steps to the /voice namespace with their own pollers", () => {
    expect(audioProviderFamily("suno-voice-validate")).toBe(AUDIO_FAMILY.SUNO_VOICE_VALIDATE);
    expect(audioProviderFamily("suno-voice-generate")).toBe(AUDIO_FAMILY.SUNO_VOICE_GENERATE);
    expect(audioSubmitPath("suno-voice-validate")).toBe(SUNO_VOICE_VALIDATE_PATH);
    expect(audioSubmitPath("suno-voice-generate")).toBe(SUNO_VOICE_GENERATE_PATH);
    expect(audioPollPath("suno-voice-validate", "t-1")).toBe(`${SUNO_VOICE_VALIDATE_POLL_PATH}?taskId=t-1`);
    expect(audioPollPath("suno-voice-generate", "t-2")).toBe(`${SUNO_VOICE_RECORD_INFO_PATH}?taskId=t-2`);
    // The vendor-prefixed spelling is tolerated like everywhere else.
    expect(audioProviderFamily("suno/suno-voice-validate")).toBe(AUDIO_FAMILY.SUNO_VOICE_VALIDATE);
  });

  it("validate body: voiceUrl from the studio's canonical audio_url, plus the vocal window", () => {
    const body = buildSunoVoiceValidateBody("", {
      audio_url: "https://app.example/api/media/local/rec.mp3",
      vocalStartS: 2, vocalEndS: 14, language: "en",
    });
    expect(body).toEqual({
      voiceUrl: "https://app.example/api/media/local/rec.mp3",
      vocalStartS: 2, vocalEndS: 14, language: "en",
    });
    // Rule 1: nothing invented — an absent recording stays absent.
    expect(buildSunoVoiceValidateBody("", {}).voiceUrl).toBeUndefined();
  });

  it("generate body: taskId + verifyUrl + optional identity fields, nothing else", () => {
    const body = buildSunoVoiceGenerateBody("", {
      taskId: "task-7",
      verifyUrl: "https://app.example/api/media/local/phrase.mp3",
      voiceName: "My narrator",
      description: "calm, low",
      stray_field: "dropped",
    });
    expect(body).toEqual({
      taskId: "task-7",
      verifyUrl: "https://app.example/api/media/local/phrase.mp3",
      voiceName: "My narrator",
      description: "calm, low",
    });
    // audio_url doubles as verifyUrl when the wizard submits the recording that way.
    expect(buildSunoVoiceGenerateBody("", { taskId: "t", audio_url: "https://x/v.mp3" }).verifyUrl).toBe("https://x/v.mp3");
  });

  it("validate poll: the phrase arrives as a text data: URI; failures are terminal, silence is pending", () => {
    const done = parseSunoVoiceValidatePoll({ status: "SUCCESS", response: { phrase: "The quick brown fox" } });
    expect(done.status).toBe("success");
    expect(done.outputs).toEqual([`data:text/plain;charset=utf-8,${encodeURIComponent("The quick brown fox")}`]);
    expect(parseSunoVoiceValidatePoll({ status: "PENDING" }).status).toBe("pending");
    expect(parseSunoVoiceValidatePoll({ status: "CREATE_TASK_FAILED" })).toMatchObject({ status: "failed" });
    expect(parseSunoVoiceValidatePoll({ successFlag: 2, errorMessage: "bad recording" })).toMatchObject({ status: "failed", error: "bad recording" });
  });

  it("generate poll: the reusable voiceId arrives as a text data: URI", () => {
    const done = parseSunoVoiceGeneratePoll({ status: "SUCCESS", response: { voiceId: "voice_abc123" } });
    expect(done.status).toBe("success");
    expect(done.outputs).toEqual([`data:text/plain;charset=utf-8,${encodeURIComponent("voice_abc123")}`]);
    expect(parseSunoVoiceGeneratePoll({ status: "PENDING" }).status).toBe("pending");
    expect(parseSunoVoiceGeneratePoll({ status: "GENERATE_AUDIO_FAILED" })).toMatchObject({ status: "failed" });
  });

  it("parseAudioOpPoll claims both voice steps (their envelopes are not sunoData)", () => {
    const body = { status: "SUCCESS", response: { voiceId: "v-1", phrase: "read me" } };
    expect(parseAudioOpPoll(body, "suno-voice-validate").status).toBe("success");
    expect(parseAudioOpPoll(body, "suno-voice-generate").status).toBe("success");
    expect(parseAudioOpPoll(body, "generate-music")).toBeNull();
  });

  it("formatAudioRequest dispatches all three new families", () => {
    expect(formatAudioRequest("replace-section", "p", { audio_url: "https://x/a.mp3" }).path).toBe(SUNO_REPLACE_SECTION_PATH);
    expect(formatAudioRequest("suno-voice-validate", "", { audio_url: "https://x/a.mp3" }).path).toBe(SUNO_VOICE_VALIDATE_PATH);
    expect(formatAudioRequest("suno-voice-generate", "", { taskId: "t" }).path).toBe(SUNO_VOICE_GENERATE_PATH);
  });
});
