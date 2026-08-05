// ── Admin inputSchema validation (EDITSv1 M3) ──────────────────────────────
// The admin models route lets an operator VIEW and EDIT a ModelPricing
// row's `inputSchema` as JSON. That column drives real behaviour — studio
// controls render from it, validateModelInput gates submits on it, and
// applyRequiredDefaults fills required rendering settings from it — so a
// malformed write here quietly breaks a model for every user. This module
// is the ONE server-side gate: it accepts exactly the shape the rest of
// the app reads ({ fields: { name: { type/required/enum/… } } }, plus the
// verification sweep's optional `providerRequired` list) and rejects
// everything else — non-objects, arrays, functions-shaped junk, absurd
// sizes — with a message the admin UI can show verbatim.
//
// Dependency-free (no prisma, no "@/" alias) so it is unit-testable in
// isolation and importable from anywhere, same convention as
// provider-payload-core.mjs.

export const INPUT_SCHEMA_MAX_BYTES = 64 * 1024;
export const INPUT_SCHEMA_MAX_FIELDS = 100;
export const INPUT_SCHEMA_MAX_ENUM = 100;

// The field attributes the app actually reads (model-catalog-core.mjs's
// mk* constructors write exactly these). Unknown attributes are rejected
// rather than stored: they would sit in the DB masquerading as behaviour.
const FIELD_ATTRS = new Set([
  "type", "required", "enum", "default", "format",
  "minimum", "maximum", "minLength", "maxLength", "minItems", "maxItems",
]);
const FIELD_TYPES = new Set(["string", "number", "boolean", "array", "object"]);
const FIELD_NAME_RE = /^[a-zA-Z0-9_.-]{1,64}$/;

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isScalar(value) {
  return ["string", "number", "boolean"].includes(typeof value);
}

function fail(error) {
  return { ok: false, error };
}

/**
 * Validate an admin-supplied inputSchema value.
 *
 * @param {unknown} value  whatever arrived in the request body (already
 *                         JSON-parsed by the route — functions cannot
 *                         survive JSON, but this is also called with
 *                         programmatic values in tests, so it checks anyway)
 * @returns {{ ok: true, schema: object } | { ok: false, error: string }}
 */
export function validateInputSchema(value) {
  if (typeof value === "string") return fail("Schema must be a JSON object, not a string — paste the object itself.");
  if (typeof value === "function") return fail("Schema must be plain JSON data.");
  if (!value || typeof value !== "object") return fail("Schema must be a JSON object with a `fields` object.");
  if (Array.isArray(value)) return fail("Schema must be an object, not an array.");

  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return fail("Schema must be plain JSON data (no cycles, no functions).");
  }
  if (typeof serialized !== "string") return fail("Schema must be plain JSON data.");
  if (serialized.length > INPUT_SCHEMA_MAX_BYTES) {
    return fail(`Schema is too large (max ${INPUT_SCHEMA_MAX_BYTES / 1024}KB).`);
  }

  for (const key of Object.keys(value)) {
    if (key !== "fields" && key !== "providerRequired") {
      return fail(`Unknown top-level key "${key}" — only \`fields\` and \`providerRequired\` are stored.`);
    }
  }

  const fields = value.fields;
  if (!isPlainObject(fields)) return fail("Schema must carry a `fields` object ({ fields: { name: { … } } }).");
  const names = Object.keys(fields);
  if (names.length > INPUT_SCHEMA_MAX_FIELDS) return fail(`Too many fields (max ${INPUT_SCHEMA_MAX_FIELDS}).`);

  const cleanFields = {};
  for (const name of names) {
    if (!FIELD_NAME_RE.test(name)) {
      return fail(`Field name "${name}" is invalid — letters, digits, "_", "." and "-" only, max 64 chars.`);
    }
    const field = fields[name];
    if (typeof field === "function") return fail(`Field "${name}" must be plain JSON data.`);
    if (!isPlainObject(field)) return fail(`Field "${name}" must be an object ({ type, required, … }).`);

    for (const [attr, attrValue] of Object.entries(field)) {
      if (!FIELD_ATTRS.has(attr)) {
        return fail(`Field "${name}" has unknown attribute "${attr}" — allowed: ${[...FIELD_ATTRS].join(", ")}.`);
      }
      if (typeof attrValue === "function") return fail(`Field "${name}".${attr} must be plain JSON data.`);
    }
    if (field.type !== undefined && !FIELD_TYPES.has(field.type)) {
      return fail(`Field "${name}" has invalid type "${field.type}" — one of: ${[...FIELD_TYPES].join(", ")}.`);
    }
    if (field.required !== undefined && typeof field.required !== "boolean") {
      return fail(`Field "${name}".required must be true or false.`);
    }
    if (field.enum !== undefined) {
      if (!Array.isArray(field.enum) || field.enum.length === 0) {
        return fail(`Field "${name}".enum must be a non-empty array.`);
      }
      if (field.enum.length > INPUT_SCHEMA_MAX_ENUM) {
        return fail(`Field "${name}".enum is too long (max ${INPUT_SCHEMA_MAX_ENUM} values).`);
      }
      if (!field.enum.every(isScalar)) {
        return fail(`Field "${name}".enum may only contain strings, numbers or booleans.`);
      }
    }
    if (field.default !== undefined && !isScalar(field.default)) {
      return fail(`Field "${name}".default must be a string, number or boolean.`);
    }
    if (field.format !== undefined && typeof field.format !== "string") {
      return fail(`Field "${name}".format must be a string.`);
    }
    for (const attr of ["minimum", "maximum", "minLength", "maxLength", "minItems", "maxItems"]) {
      if (field[attr] !== undefined && typeof field[attr] !== "number") {
        return fail(`Field "${name}".${attr} must be a number.`);
      }
    }
    cleanFields[name] = { ...field };
  }

  const schema = { fields: cleanFields };
  if (value.providerRequired !== undefined) {
    if (!Array.isArray(value.providerRequired) || !value.providerRequired.every((n) => typeof n === "string" && n)) {
      return fail("`providerRequired` must be an array of field-name strings.");
    }
    schema.providerRequired = [...value.providerRequired];
  }
  return { ok: true, schema };
}
