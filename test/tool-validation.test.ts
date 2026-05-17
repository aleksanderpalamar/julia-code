import { describe, it, expect } from 'vitest';
import {
  validateAndCoerceArgs,
  formatArgErrors,
  type ToolParameterSchema,
} from '../src/tools/validation.js';

const readSchema: ToolParameterSchema = {
  type: 'object',
  properties: {
    path: { type: 'string' },
    offset: { type: 'number' },
    limit: { type: 'number' },
  },
  required: ['path'],
};

const sessionsSchema: ToolParameterSchema = {
  type: 'object',
  properties: {
    action: { type: 'string', enum: ['list', 'messages', 'count'] },
    session_id: { type: 'string' },
  },
  required: ['action'],
};

const editSchema: ToolParameterSchema = {
  type: 'object',
  properties: {
    path: { type: 'string' },
    old_string: { type: 'string' },
    new_string: { type: 'string' },
    replace_all: { type: 'boolean' },
  },
  required: ['path', 'old_string', 'new_string'],
};

const subagentSchema: ToolParameterSchema = {
  type: 'object',
  properties: {
    action: { type: 'string' },
    tasks: { type: 'array', items: { type: 'string' } },
  },
  required: ['action'],
};

describe('validateAndCoerceArgs — happy path', () => {
  it('passes well-formed args through unchanged', () => {
    const result = validateAndCoerceArgs(readSchema, { path: 'src/a.ts', offset: 10 });
    expect(result).toEqual({ ok: true, value: { path: 'src/a.ts', offset: 10 } });
  });

  it('accepts any args when the schema has no properties', () => {
    const result = validateAndCoerceArgs(null, { whatever: 1 });
    expect(result).toEqual({ ok: true, value: { whatever: 1 } });
  });

  it('omits optional fields that were not supplied', () => {
    const result = validateAndCoerceArgs(readSchema, { path: 'x.ts' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual({ path: 'x.ts' });
  });
});

describe('validateAndCoerceArgs — required fields', () => {
  it('fails when a required field is missing', () => {
    const result = validateAndCoerceArgs(readSchema, { offset: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({
        param: 'path',
        message: 'parameter "path" is required',
      });
    }
  });

  it('reports every missing required field', () => {
    const result = validateAndCoerceArgs(editSchema, { path: 'x.ts' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.map(e => e.param).sort()).toEqual(['new_string', 'old_string']);
    }
  });

  it('treats a null required field as missing', () => {
    const result = validateAndCoerceArgs(readSchema, { path: null });
    expect(result.ok).toBe(false);
  });
});

describe('validateAndCoerceArgs — coercion', () => {
  it('coerces a numeric string to a number', () => {
    const result = validateAndCoerceArgs(readSchema, { path: 'x.ts', offset: '42' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.offset).toBe(42);
  });

  it('coerces "true"/"false" strings to booleans', () => {
    const a = validateAndCoerceArgs(editSchema, {
      path: 'x', old_string: 'a', new_string: 'b', replace_all: 'true',
    });
    expect(a.ok && a.value.replace_all).toBe(true);

    const b = validateAndCoerceArgs(editSchema, {
      path: 'x', old_string: 'a', new_string: 'b', replace_all: 'false',
    });
    expect(b.ok).toBe(true);
    if (b.ok) expect(b.value.replace_all).toBe(false);
  });

  it('coerces a number to a string for string-typed fields', () => {
    const result = validateAndCoerceArgs(readSchema, { path: 123 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.path).toBe('123');
  });

  it('wraps a lone scalar into a single-element array', () => {
    const result = validateAndCoerceArgs(subagentSchema, { action: 'spawn_many', tasks: 'do X' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.tasks).toEqual(['do X']);
  });

  it('parses a JSON-array string into an array', () => {
    const result = validateAndCoerceArgs(subagentSchema, {
      action: 'spawn_many', tasks: '["a","b"]',
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.tasks).toEqual(['a', 'b']);
  });
});

describe('validateAndCoerceArgs — type errors', () => {
  it('fails on a non-numeric string for a number field', () => {
    const result = validateAndCoerceArgs(readSchema, { path: 'x.ts', offset: 'abc' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0].message).toBe(
        'parameter "offset" must be a number, got string "abc"',
      );
    }
  });

  it('fails on a wrong-typed array item', () => {
    const result = validateAndCoerceArgs(subagentSchema, {
      action: 'spawn_many', tasks: [{ nested: true }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0].param).toBe('tasks');
  });
});

describe('validateAndCoerceArgs — enum', () => {
  it('accepts a valid enum value', () => {
    const result = validateAndCoerceArgs(sessionsSchema, { action: 'list' });
    expect(result.ok).toBe(true);
  });

  it('rejects a value outside the enum', () => {
    const result = validateAndCoerceArgs(sessionsSchema, { action: 'destroy' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0].message).toBe(
        'parameter "action" must be one of: "list", "messages", "count"',
      );
    }
  });
});

describe('validateAndCoerceArgs — unknown properties', () => {
  it('drops unknown properties and still succeeds', () => {
    const result = validateAndCoerceArgs(readSchema, { path: 'x.ts', bogus: 'nope' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual({ path: 'x.ts' });
  });
});

describe('validateAndCoerceArgs — additionalProperties / patternProperties', () => {
  const openSchema: ToolParameterSchema = {
    type: 'object',
    properties: { name: { type: 'string' } },
    required: ['name'],
    additionalProperties: true,
  };

  const typedExtraSchema: ToolParameterSchema = {
    type: 'object',
    properties: { name: { type: 'string' } },
    required: ['name'],
    additionalProperties: { type: 'number' },
  };

  const patternSchema: ToolParameterSchema = {
    type: 'object',
    properties: { name: { type: 'string' } },
    required: ['name'],
    patternProperties: { '^x-': { type: 'string' } },
  };

  it('keeps dynamic keys untouched when additionalProperties is true', () => {
    const result = validateAndCoerceArgs(openSchema, {
      name: 'a', extra: '5', nested: { k: 1 },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ name: 'a', extra: '5', nested: { k: 1 } });
    }
  });

  it('coerces dynamic keys against the additionalProperties schema', () => {
    const result = validateAndCoerceArgs(typedExtraSchema, { name: 'a', count: '7' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.count).toBe(7);
  });

  it('rejects a dynamic key that violates the additionalProperties schema', () => {
    const result = validateAndCoerceArgs(typedExtraSchema, { name: 'a', count: 'abc' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0].param).toBe('count');
  });

  it('validates keys matching patternProperties and drops the rest', () => {
    const result = validateAndCoerceArgs(patternSchema, {
      name: 'a', 'x-trace': 'id-1', other: 'gone',
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual({ name: 'a', 'x-trace': 'id-1' });
  });

  it('still drops unknown keys on a closed schema', () => {
    const closed: ToolParameterSchema = {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
    };
    const result = validateAndCoerceArgs(closed, { name: 'a', bogus: 1 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual({ name: 'a' });
  });
});

describe('formatArgErrors', () => {
  it('renders a readable multi-line block', () => {
    const result = validateAndCoerceArgs(editSchema, { path: 'x.ts' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const text = formatArgErrors('edit', result.errors);
      expect(text).toContain('Invalid arguments for tool "edit":');
      expect(text).toContain('  - parameter "old_string" is required');
      expect(text).toContain('  - parameter "new_string" is required');
    }
  });
});
