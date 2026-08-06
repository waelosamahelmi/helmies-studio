// EDITSv1 Phase E3 Task E3.2 — the structured chat contract.
//
// Client-safe (no prisma/auth imports): the same parser runs in the chat
// route (to persist a turn with the right kind) and in the browser feed (to
// render the QuestionCard), so the two can never disagree about what counts
// as a question.
//
// The contract: the assistant asks AT MOST ONE clarifying question per
// turn, and when it does, the reply ENDS with a fenced block
//
//   ```question
//   {"question":"…","options":["…","…"],"allowCustom":true}
//   ```
//
// The UI parses the LAST such block; everything before it is ordinary
// markdown prose.

const QUESTION_BLOCK_RE = /```question\s*\n([\s\S]*?)```/g;

// A9 — the auto-plan signal. When the assistant judges it has enough to
// plan, it ends its reply with a fenced block
//
//   ```plan-ready
//   {"brief":"<the complete distilled production brief>"}
//   ```
//
// The client, on seeing it, calls the plan endpoint automatically — no
// button press. Parsed with the same last-block-wins discipline as the
// question block, and the same client/server sharing guarantee.
const PLAN_READY_BLOCK_RE = /```plan-ready\s*\n?([\s\S]*?)```/g;

// Parses the LAST ```plan-ready block. Returns { brief } (brief may be ""
// when the model omitted or malformed the JSON — the SIGNAL still counts,
// and the caller falls back to the conversation as the brief source) or
// null when no block is present.
export function parsePlanReadyBlock(text) {
  if (!text || typeof text !== "string") return null;
  let match = null;
  for (const m of text.matchAll(PLAN_READY_BLOCK_RE)) match = m;
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1].trim());
    const brief = typeof parsed?.brief === "string" ? parsed.brief.trim() : "";
    return { brief };
  } catch {
    return { brief: "" };
  }
}

// The prose around the plan-ready block (rendered as markdown; the block
// itself is never shown to the user).
export function stripPlanReadyBlock(text) {
  if (!text || typeof text !== "string") return text || "";
  const matches = [...text.matchAll(PLAN_READY_BLOCK_RE)];
  if (!matches.length) return text;
  const last = matches[matches.length - 1];
  return (text.slice(0, last.index) + text.slice(last.index + last[0].length)).trim();
}

// Parses the LAST ```question block out of `text`. Returns
// { question, options, allowCustom } or null when there is no
// (well-formed) block — malformed JSON degrades to plain prose, never an
// exception.
export function parseQuestionBlock(text) {
  if (!text || typeof text !== "string") return null;
  let match = null;
  for (const m of text.matchAll(QUESTION_BLOCK_RE)) match = m;
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1].trim());
    if (!parsed || typeof parsed.question !== "string" || !parsed.question.trim()) return null;
    const options = Array.isArray(parsed.options)
      ? parsed.options.filter((o) => typeof o === "string" && o.trim()).map((o) => o.trim()).slice(0, 6)
      : [];
    return {
      question: parsed.question.trim(),
      options,
      allowCustom: parsed.allowCustom !== false,
    };
  } catch {
    return null;
  }
}

// The prose around the LAST question block (the part rendered as markdown
// above the QuestionCard).
export function stripQuestionBlock(text) {
  if (!text || typeof text !== "string") return text || "";
  const matches = [...text.matchAll(QUESTION_BLOCK_RE)];
  if (!matches.length) return text;
  const last = matches[matches.length - 1];
  return (text.slice(0, last.index) + text.slice(last.index + last[0].length)).trim();
}

// The chat system prompt (rewritten per E3.2). No provider names, ever.
// `modelOptions` carries the LIVE runnable pools (id + credits) built
// server-side by the chat route — the user must be able to CHOOSE the
// generation models (with prices) before the plan is built, never be
// silently forced onto one.
export function buildChatSystemPrompt({ modelOptions = {} } = {}) {
  const list = (rows) => (Array.isArray(rows) && rows.length
    ? rows.map((r) => `${r.id} (${r.credits} cr)`).join(", ")
    : "none available");
  const modelChoiceText = `
MODEL CHOICE — the user picks the generation models BEFORE the plan. This takes precedence over other clarifying questions:
- If this production will generate VIDEO and the user has not yet chosen a video model, ask ONE question this turn: "Which video model should generate the clips?" — the question TEXT lists the options with their prices; the question's options array carries the bare model ids VERBATIM (the user's answer becomes the model used in the plan, so ids must be exact — prices go in the question text, never inside an option string).
- When the video model is settled, ask the same question for IMAGE (only if the production actually generates images — e.g. a still, a character sheet, a scene reference), then for MUSIC/AUDIO (only if it generates music or voiceover) — ONE question per turn, in that order, then signal plan-ready. Never invent or assume a model for a kind the user has not chosen.
- If the user names a model that is NOT in the offered list (e.g. "Seedance 2.0"): NEVER guess or translate it yourself. State plainly that it is not in the offered list and ask them to pick one of the offered ids — the id they choose is what the plan will actually use, so it must be exact. If a <resolved-model> block is present in your system context, you may read it, but you must not invent ids.
- Accept whatever the user answers — an offered id, "cheapest" / "you pick" (then use the first offered option). Never re-ask the same kind.
Video models: ${list(modelOptions.video)}
Image models: ${list(modelOptions.image)}
Music models: ${list(modelOptions.music)}
`;
  return `You are Helmies Studio's Orchestrator Agent — a friendly, expert creative producer inside a creative studio app. You help users shape multimedia productions (images, video, audio, music, marketing content and more) before anything is generated or charged.
${modelChoiceText}

How to reply:
- Write in Markdown: short paragraphs, **bold** for key choices, bullet lists where they help. Never output raw HTML.
- Ask AT MOST ONE clarifying question per turn — the single most useful one. When you ask it, END your reply with a fenced code block tagged question containing exactly one JSON object:

\`\`\`question
{"question":"What aspect ratio should the film use?","options":["16:9 widescreen","9:16 vertical","1:1 square"],"allowCustom":true}
\`\`\`

  Give 2-4 short options. Put nothing after that block. If you are not asking a question this turn, do not include the block at all.
- Ask AT MOST 2-3 questions in the WHOLE conversation, and only ones whose answer genuinely changes the production (format, length, tone — not trivia). Do not interrogate. Prefer sensible assumptions you state briefly.
- The moment you know enough to plan — including when the user says "ok", "go ahead", or answers your last question — STOP asking and END your reply with a fenced code block tagged plan-ready containing one JSON object with the complete distilled production brief:

\`\`\`plan-ready
{"brief":"A 30-second vertical launch film for a linen bedding brand: 3 cinematic shots of softly lit bedrooms, calm narration, warm ambient music."}
\`\`\`

  The brief must capture EVERYTHING agreed in the conversation (subject, format, length, tone, any scripts or copy). Put nothing after that block. The studio then builds the full costed plan automatically and shows it for review — nothing runs and nothing is charged until the user approves it.
- Keep replies concise and concrete. Do not output plan JSON in chat, and never mention internal model vendors or backend services.`;
}
