/**
 * The vendored OpenAPI snapshot, for tests: the source of the route-equality test and of the MSW
 * fixtures. Never imported by application code, which knows the contract only through the
 * generated types.
 */
import snapshot from '../app/core/api/contract/openapi.json';

/** The JSON Schema subset the snapshot uses. */
export interface JsonSchema {
  readonly type?: string | readonly string[];
  readonly format?: string;
  readonly enum?: readonly unknown[];
  readonly example?: unknown;
  readonly pattern?: string;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly minItems?: number;
  readonly uniqueItems?: boolean;
  readonly default?: unknown;
  readonly additionalProperties?: JsonSchema | boolean;
  readonly required?: readonly string[];
  readonly properties?: Readonly<Record<string, JsonSchema>>;
  readonly items?: JsonSchema;
  readonly $ref?: string;
  readonly description?: string;
}

export interface SnapshotResponse {
  readonly description?: string;
  readonly content?: Readonly<Record<string, { readonly schema?: JsonSchema }>>;
}

export interface SnapshotOperation {
  readonly operationId: string;
  readonly tags?: readonly string[];
  readonly responses: Readonly<Record<string, SnapshotResponse>>;
}

export const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'patch'] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

export interface SnapshotDocument {
  readonly openapi: string;
  readonly paths: Readonly<Record<string, Partial<Record<HttpMethod, SnapshotOperation>>>>;
  readonly components: { readonly schemas: Readonly<Record<string, JsonSchema>> };
}

export const SNAPSHOT = snapshot as unknown as SnapshotDocument;

/** One operation of the snapshot, with its path and method. */
export interface SnapshotEntry {
  readonly path: string;
  readonly method: HttpMethod;
  readonly operation: SnapshotOperation;
}

/** Every operation of the snapshot, in document order. */
export const SNAPSHOT_OPERATIONS: readonly SnapshotEntry[] = Object.entries(SNAPSHOT.paths).flatMap(
  ([path, item]) =>
    HTTP_METHODS.flatMap((method) => {
      const operation = item[method];
      return operation ? [{ path, method, operation }] : [];
    }),
);
