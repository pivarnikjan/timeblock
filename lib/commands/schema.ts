/**
 * The part of JSON Schema the commands describe their input with. One
 * description serves three readers: this validator, the OpenAPI document and
 * the MCP tool list — so what a client is told is what is checked.
 */
export interface JsonSchema {
  type?: 'string' | 'integer' | 'number' | 'boolean' | 'array' | 'object';
  description?: string;
  enum?: readonly (string | number)[];
  const?: string | number | boolean;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  items?: JsonSchema;
  minItems?: number;
  maxItems?: number;
  properties?: Record<string, JsonSchema>;
  required?: readonly string[];
  additionalProperties?: boolean;
  /** Alternatives; objects are told apart by a `kind` property with a `const`. */
  anyOf?: readonly JsonSchema[];
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

function typeOf(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number' && Number.isInteger(value)) return 'integer';
  return typeof value;
}

/** What is wrong with `value`, one sentence per problem, each naming where (`changes[2].date`); empty when it fits. */
export function validate(schema: JsonSchema, value: unknown, at = ''): string[] {
  const where = at || 'the input';

  if (schema.anyOf) {
    // Told apart by `kind`, so the problems reported are those of the alternative that was meant.
    const kind = isObject(value) ? value.kind : undefined;
    const kinds = schema.anyOf.map((s) => s.properties?.kind?.const);
    const meant = schema.anyOf[kinds.indexOf(kind as string)];
    if (meant) return validate(meant, value, at);
    return [`${where}: "kind" must be one of ${kinds.map((k) => `"${k}"`).join(', ')}.`];
  }

  if (schema.const !== undefined && value !== schema.const) return [`${where} must be ${JSON.stringify(schema.const)}.`];
  if (schema.enum && !schema.enum.includes(value as string | number)) {
    return [`${where} must be one of ${schema.enum.map((v) => JSON.stringify(v)).join(', ')}.`];
  }

  const actual = typeOf(value);
  if (schema.type && actual !== schema.type && !(schema.type === 'number' && actual === 'integer')) {
    return [`${where} must be ${schema.type === 'integer' || schema.type === 'array' || schema.type === 'object' ? 'an' : 'a'} ${schema.type}.`];
  }

  const problems: string[] = [];
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.trim().length < schema.minLength) problems.push(`${where} must not be empty.`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) problems.push(`${where} must be at most ${schema.maxLength} characters.`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) problems.push(`${where} is not in the expected form${schema.description ? ` (${schema.description})` : ''}.`);
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) problems.push(`${where} must be at least ${schema.minimum}.`);
    if (schema.maximum !== undefined && value > schema.maximum) problems.push(`${where} must be at most ${schema.maximum}.`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) problems.push(`${where} must hold at least ${schema.minItems}.`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) problems.push(`${where} must hold at most ${schema.maxItems}.`);
    if (schema.items) value.forEach((item, i) => problems.push(...validate(schema.items!, item, `${at}[${i}]`)));
  }
  if (isObject(value)) {
    const properties = schema.properties ?? {};
    for (const name of schema.required ?? []) {
      if (value[name] === undefined) problems.push(`${at ? `${at}.` : ''}${name} is required.`);
    }
    for (const [name, child] of Object.entries(value)) {
      const path = at ? `${at}.${name}` : name;
      if (properties[name]) {
        if (child !== undefined) problems.push(...validate(properties[name], child, path));
      } else if (schema.additionalProperties === false) {
        problems.push(`${path} is not a known field (known: ${Object.keys(properties).join(', ')}).`);
      }
    }
  }
  return problems;
}
