/**
 * Response bodies generated from the vendored snapshot — never written by hand. A hand-written
 * fixture encodes what we believe the server returns, which is exactly what a test must not
 * assume.
 *
 * For each schema: a property's own `example` where the snapshot gives one (8 properties in 4
 * schemas: `AvailabilityRequest`, `InviteRequest`, `ProblemDetails`, `RegistrationRequest`); for
 * everything else, a minimal valid instance built from the declared type, format, enum and bounds.
 * Every declared property is filled, required or not: 38 of the 56 schemas mark nothing as
 * required, and an all-absent instance would test nothing. Values are deterministic, so a failure
 * reproduces.
 */
import type { components } from '../../app/core/api/contract/schema';
import { type JsonSchema, SNAPSHOT } from '../contract';

export type Schemas = components['schemas'];
export type SchemaName = keyof Schemas & string;

const SCHEMA_REF = '#/components/schemas/';

/** The fixed values each string format takes. The date is arbitrary and in the past. */
const FORMAT_VALUES: Readonly<Record<string, string>> = {
  'date-time': '2026-01-15T12:00:00Z',
  date: '2026-01-15',
  email: 'pessoa.sintetica@example.com',
  uri: '/',
};

/** The schema a `$ref` points to. */
export function resolveRef(ref: string): JsonSchema {
  if (!ref.startsWith(SCHEMA_REF)) {
    throw new Error(`Unsupported $ref ${ref}`);
  }
  const schema = SNAPSHOT.components.schemas[ref.slice(SCHEMA_REF.length)];
  if (!schema) {
    throw new Error(`Unknown schema ${ref}`);
  }
  return schema;
}

/** A schema with any `$ref` followed. */
export function deref(schema: JsonSchema): JsonSchema {
  return schema.$ref ? deref(resolveRef(schema.$ref)) : schema;
}

/** A deterministic UUID, version 4 in shape, from a sequence number. */
function uuid(sequence: number): string {
  return `00000000-0000-4000-8000-${sequence.toString(16).padStart(12, '0')}`;
}

/** A valid instance of `schema`. `sequence` numbers the identifiers in document order. */
export function instanceOf(schema: JsonSchema, sequence = { next: 1 }): unknown {
  const resolved = deref(schema);
  if (resolved.example !== undefined) {
    return resolved.example;
  }
  if (resolved.enum && resolved.enum.length > 0) {
    return resolved.enum[0];
  }
  const type = Array.isArray(resolved.type) ? resolved.type[0] : resolved.type;
  switch (type) {
    case 'string':
      return stringOf(resolved, sequence);
    case 'integer':
      return resolved.default ?? resolved.minimum ?? 1;
    case 'number':
      return resolved.minimum ?? 0.5;
    case 'boolean':
      return false;
    case 'array':
      return Array.from({ length: Math.max(1, resolved.minItems ?? 0) }, () =>
        instanceOf(resolved.items ?? {}, sequence),
      );
    case 'object':
    case undefined:
      return Object.fromEntries(
        Object.entries(resolved.properties ?? {}).map(([name, property]) => [
          name,
          instanceOf(property, sequence),
        ]),
      );
    default:
      throw new Error(`Unsupported schema type ${String(type)}`);
  }
}

function stringOf(schema: JsonSchema, sequence: { next: number }): string {
  if (schema.format === 'uuid') {
    return uuid(sequence.next++);
  }
  const value = (schema.format && FORMAT_VALUES[schema.format]) ?? 'texto';
  return value.padEnd(schema.minLength ?? 0, 'x').slice(0, schema.maxLength ?? Infinity);
}

/** A generated instance of a named schema of the snapshot, typed by the generated declarations. */
export function fixture<K extends SchemaName>(name: K): Schemas[K] {
  return instanceOf({ $ref: `${SCHEMA_REF}${name}` }) as Schemas[K];
}
