/**
 * Whether a value conforms to a schema of the snapshot, for the subset of JSON Schema the snapshot
 * uses. Test-only: it checks that the generated fixtures are valid instances, so that a defect in
 * the generator cannot hide behind a test that passes. Not a validation library and never used
 * by the application, which trusts the generated types (ADR 0002).
 */
import type { JsonSchema } from '../contract';
import { deref } from './fixtures';

const FORMATS: Readonly<Record<string, RegExp>> = {
  'date-time': /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/,
  date: /^\d{4}-\d{2}-\d{2}$/,
  uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
  email: /^[^@\s]+@[^@\s]+$/,
};

/** The paths at which `value` breaks `schema`; empty when it conforms. */
export function violations(value: unknown, schema: JsonSchema, path = '$'): string[] {
  const resolved = deref(schema);
  if (resolved.enum && !resolved.enum.includes(value)) {
    return [`${path}: not in enum`];
  }
  const type = Array.isArray(resolved.type) ? resolved.type[0] : resolved.type;
  switch (type) {
    case 'string': {
      if (typeof value !== 'string') return [`${path}: not a string`];
      const format = resolved.format ? FORMATS[resolved.format] : undefined;
      if (format && !format.test(value)) return [`${path}: not a ${resolved.format}`];
      if (value.length < (resolved.minLength ?? 0)) return [`${path}: too short`];
      if (value.length > (resolved.maxLength ?? Infinity)) return [`${path}: too long`];
      return [];
    }
    case 'integer':
    case 'number': {
      if (typeof value !== 'number') return [`${path}: not a number`];
      if (type === 'integer' && !Number.isInteger(value)) return [`${path}: not an integer`];
      if (value < (resolved.minimum ?? -Infinity)) return [`${path}: below minimum`];
      if (value > (resolved.maximum ?? Infinity)) return [`${path}: above maximum`];
      return [];
    }
    case 'boolean':
      return typeof value === 'boolean' ? [] : [`${path}: not a boolean`];
    case 'array': {
      if (!Array.isArray(value)) return [`${path}: not an array`];
      if (value.length < (resolved.minItems ?? 0)) return [`${path}: too few items`];
      return value.flatMap((item, index) =>
        violations(item, resolved.items ?? {}, `${path}[${index}]`),
      );
    }
    case 'object':
    case undefined: {
      if (resolved.type === undefined && !resolved.properties) return [];
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return [`${path}: not an object`];
      }
      const record = value as Record<string, unknown>;
      const missing = (resolved.required ?? [])
        .filter((name) => !(name in record))
        .map((name) => `${path}.${name}: required`);
      const properties = Object.entries(resolved.properties ?? {}).flatMap(([name, property]) =>
        name in record ? violations(record[name], property, `${path}.${name}`) : [],
      );
      return [...missing, ...properties];
    }
    default:
      return [`${path}: unsupported type ${String(type)}`];
  }
}
