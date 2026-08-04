// E4.4: the constrained op vocabulary for natural-language timeline edits
// (/api/director/timeline-chat). The LLM may ONLY answer in these ops, and
// every op is validated server-side against the pipeline's real clip count —
// including how earlier ops in the same list change that count — before
// anything reaches the client. Plain module: no imports, unit-testable in
// isolation (tests/unit/api-director-timeline-chat.test.mjs).

export const TIMELINE_OPS = ["trim", "reorder", "remove", "split"];

const MAX_OPS = 50;

export function validateTimelineOps(ops, clipCount) {
  if (!Array.isArray(ops)) return { ok: false, errors: ["ops must be an array"] };
  if (ops.length === 0) return { ok: false, errors: ["ops is empty — nothing to change"] };
  if (ops.length > MAX_OPS) return { ok: false, errors: [`too many ops (max ${MAX_OPS})`] };

  let count = Number.isInteger(clipCount) ? clipCount : 0;
  const errors = [];

  ops.forEach((op, n) => {
    if (!op || typeof op !== "object" || !TIMELINE_OPS.includes(op.op)) {
      errors.push(`ops[${n}]: unknown op`);
      return;
    }
    const inRange = (v) => Number.isInteger(v) && v >= 0 && v < count;

    switch (op.op) {
      case "remove": {
        if (!inRange(op.index)) errors.push(`ops[${n}]: index out of range`);
        else if (count <= 1) errors.push(`ops[${n}]: cannot remove the last clip`);
        else count -= 1;
        break;
      }
      case "trim": {
        if (!inRange(op.index)) { errors.push(`ops[${n}]: index out of range`); break; }
        const hasIn = op.inSec != null;
        const hasOut = op.outSec != null;
        if (!hasIn && !hasOut) { errors.push(`ops[${n}]: trim needs inSec and/or outSec`); break; }
        const start = hasIn ? Number(op.inSec) : 0;
        if (hasIn && (!Number.isFinite(start) || start < 0)) errors.push(`ops[${n}]: invalid inSec`);
        if (hasOut) {
          const end = Number(op.outSec);
          if (!Number.isFinite(end) || end <= start) errors.push(`ops[${n}]: invalid outSec`);
        }
        break;
      }
      case "reorder": {
        if (!inRange(op.from)) errors.push(`ops[${n}]: invalid from`);
        if (!inRange(op.to)) errors.push(`ops[${n}]: invalid to`);
        break;
      }
      case "split": {
        if (!inRange(op.index)) { errors.push(`ops[${n}]: index out of range`); break; }
        const at = Number(op.atSec);
        if (!Number.isFinite(at) || at <= 0) errors.push(`ops[${n}]: invalid atSec`);
        else count += 1;
        break;
      }
    }
  });

  return errors.length ? { ok: false, errors } : { ok: true };
}
