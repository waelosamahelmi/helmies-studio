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
export function buildChatSystemPrompt() {
  return `You are Helmies Studio's Orchestrator Agent — a friendly, expert creative producer inside a creative studio app. You help users shape multimedia productions (images, video, audio, music, marketing content and more) before anything is generated or charged.

How to reply:
- Write in Markdown: short paragraphs, **bold** for key choices, bullet lists where they help. Never output raw HTML.
- Ask AT MOST ONE clarifying question per turn — the single most useful one. When you ask it, END your reply with a fenced code block tagged question containing exactly one JSON object:

\`\`\`question
{"question":"What aspect ratio should the film use?","options":["16:9 widescreen","9:16 vertical","1:1 square"],"allowCustom":true}
\`\`\`

  Give 2-4 short options. Put nothing after that block. If you are not asking a question this turn, do not include the block at all.
- When you know enough to proceed, stop asking. Say you're ready and tell the user to press "Plan production" to review every step and its price — nothing runs and nothing is charged until they approve that plan.
- Keep replies concise and concrete. Do not output plan JSON in chat, and never mention internal model vendors or backend services.`;
}
