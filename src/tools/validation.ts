/**
 * Strict validation + best-effort coercion of tool-call arguments against a
 * tool's JSON Schema.
 *
 * Pure module: no I/O, no logging, no global state. Open/local models often
 * emit wrong types (`"123"` for a number, `"true"` for a boolean) or omit
 * required fields. Coercion salvages the common, harmless mistakes without a
 * round-trip; whatever is left becomes a model-friendly error the correction
 * loop can act on.
 */

export type JsonSchemaType =
  | 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';

export interface PropertySchema {
  type?: JsonSchemaType;
  enum?: readonly unknown[];
  items?: PropertySchema;
}

export interface ToolParameterSchema {
  type?: string;
  properties?: Record<string, PropertySchema>;
  required?: readonly string[];
  /** When `true` (or a schema), keys outside `properties` are valid — MCP
   *  tools often declare this for free-form arguments. */
  additionalProperties?: boolean | PropertySchema;
  /** Keys matching a regex pattern are valid and validated against its schema. */
  patternProperties?: Record<string, PropertySchema>;
}

export interface ArgError {
  param: string;
  /** Full, model-readable sentence, e.g. `parameter "path" is required`. */
  message: string;
}

export type ArgValidationResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; errors: ArgError[] };

/**
 * Validate and coerce `args` against `schema`. Returns the cleaned argument
 * object on success, or the list of violations on failure.
 */
export function validateAndCoerceArgs(
  schema: ToolParameterSchema | null | undefined,
  args: Record<string, unknown>,
): ArgValidationResult {
  const properties = schema?.properties;
  if (!properties) {
    // Nothing to validate against — accept as-is.
    return { ok: true, value: args };
  }

  const required = schema?.required ?? [];
  const errors: ArgError[] = [];
  const value: Record<string, unknown> = {};

  // Coerce + type-check every supplied argument the schema knows about. A key
  // outside `properties` is resolved via additionalProperties/patternProperties
  // so MCP tools with free-form schemas keep their dynamic args; on a closed
  // schema the key is dropped silently (a hallucinated field is harmless, and
  // rejecting it would trigger needless correction rounds).
  for (const [key, raw] of Object.entries(args)) {
    if (raw == null) continue;

    const prop = key in properties
      ? properties[key]
      : dynamicSchemaFor(key, schema);
    if (prop == null) continue;         // unknown key, closed schema — drop
    if (prop === 'open') {              // additionalProperties: true — keep as-is
      value[key] = raw;
      continue;
    }

    const coerced = coerceValue(raw, prop);
    const violation = checkValue(coerced, prop);
    if (violation) {
      errors.push({ param: key, message: `parameter "${key}" ${violation}` });
      continue;
    }
    value[key] = coerced;
  }

  // Required fields must be present, non-null and well-typed.
  for (const key of required) {
    if (value[key] !== undefined) continue;
    // Skip if this key already failed type-checking — one error per param.
    if (errors.some(e => e.param === key)) continue;
    errors.push({ param: key, message: `parameter "${key}" is required` });
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, value };
}

/** Render validation errors as a single block for a tool-result / re-prompt. */
export function formatArgErrors(toolName: string, errors: ArgError[]): string {
  const lines = errors.map(e => `  - ${e.message}`).join('\n');
  return `Invalid arguments for tool "${toolName}":\n${lines}`;
}

/**
 * Resolves the schema for a key not listed in `properties`. MCP tools may
 * declare `additionalProperties` / `patternProperties`, in which case dynamic
 * keys are valid and must reach the tool. Returns:
 *   - a PropertySchema → validate/coerce the value against it
 *   - 'open'           → keep the value untouched (`additionalProperties: true`)
 *   - null             → drop the key (closed schema, or additionalProperties false)
 */
function dynamicSchemaFor(
  key: string,
  schema: ToolParameterSchema | null | undefined,
): PropertySchema | 'open' | null {
  if (schema?.patternProperties) {
    for (const [pattern, sub] of Object.entries(schema.patternProperties)) {
      if (matchesPattern(pattern, key)) return sub;
    }
  }
  const extra = schema?.additionalProperties;
  if (extra === true) return 'open';
  if (extra && typeof extra === 'object') return extra;
  return null; // false or absent — closed schema
}

function matchesPattern(pattern: string, key: string): boolean {
  try {
    return new RegExp(pattern).test(key);
  } catch {
    return false; // malformed pattern in a tool schema — ignore it
  }
}

// --- coercion -------------------------------------------------------------

function coerceValue(raw: unknown, prop: PropertySchema): unknown {
  switch (prop.type) {
    case 'number':
    case 'integer':
      return coerceToNumber(raw);
    case 'boolean':
      return coerceToBoolean(raw);
    case 'string':
      return coerceToString(raw);
    case 'array':
      return coerceToArray(raw, prop.items);
    case 'object':
      return coerceToObject(raw);
    default:
      return raw;
  }
}

function coerceToNumber(raw: unknown): unknown {
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string' && raw.trim() !== '') {
    const n = Number(raw);
    if (!Number.isNaN(n)) return n;
  }
  return raw;
}

function coerceToBoolean(raw: unknown): unknown {
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'string') {
    const s = raw.trim().toLowerCase();
    if (s === 'true') return true;
    if (s === 'false') return false;
  }
  return raw;
}

function coerceToString(raw: unknown): unknown {
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw);
  return raw;
}

function coerceToArray(raw: unknown, items?: PropertySchema): unknown {
  let arr: unknown[];
  if (Array.isArray(raw)) {
    arr = raw;
  } else if (typeof raw === 'string') {
    const parsed = tryParseJson(raw);
    arr = Array.isArray(parsed) ? parsed : [raw];
  } else {
    // A lone scalar where a list is expected — wrap it.
    arr = [raw];
  }
  return items ? arr.map(el => coerceValue(el, items)) : arr;
}

function coerceToObject(raw: unknown): unknown {
  if (typeof raw === 'string') {
    const parsed = tryParseJson(raw);
    if (isPlainObject(parsed)) return parsed;
  }
  return raw;
}

function tryParseJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}

// --- type checking --------------------------------------------------------

function checkValue(value: unknown, prop: PropertySchema): string | null {
  // `enum` constrains the value irrespective of declared type.
  if (prop.enum && !prop.enum.includes(value)) {
    const allowed = prop.enum.map(v => JSON.stringify(v)).join(', ');
    return `must be one of: ${allowed}`;
  }

  switch (prop.type) {
    case 'string':
      return typeof value === 'string' ? null : expected('string', value);
    case 'number':
      return typeof value === 'number' && !Number.isNaN(value)
        ? null : expected('number', value);
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value)
        ? null : expected('integer', value);
    case 'boolean':
      return typeof value === 'boolean' ? null : expected('boolean', value);
    case 'array': {
      if (!Array.isArray(value)) return expected('array', value);
      if (prop.items) {
        for (let i = 0; i < value.length; i++) {
          const itemViolation = checkValue(value[i], prop.items);
          if (itemViolation) return `item ${i} ${itemViolation}`;
        }
      }
      return null;
    }
    case 'object':
      return isPlainObject(value) ? null : expected('object', value);
    default:
      return null;
  }
}

function expected(type: string, value: unknown): string {
  return `must be ${withArticle(type)}, got ${describe(value)}`;
}

function withArticle(type: string): string {
  return /^[aeiou]/.test(type) ? `an ${type}` : `a ${type}`;
}

function describe(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';
  const t = typeof value;
  if (t === 'string') {
    const s = value as string;
    const shown = s.length > 40 ? `${s.slice(0, 40)}…` : s;
    return `string ${JSON.stringify(shown)}`;
  }
  if (t === 'number' || t === 'boolean') return `${t} ${String(value)}`;
  if (t === 'object') return 'an object';
  return t;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
