/**
 * Success handlers generated from the snapshot: for each operation under the given routes, the
 * lowest 2xx it declares, with a body generated from that response's schema (`fixtures.ts`) or
 * no body when it declares none (the 204s).
 */
import { type HttpHandler, HttpResponse, http } from 'msw';

import type { ApiRoute } from '../../../app/core/api/api-routes';
import { SNAPSHOT_OPERATIONS, type SnapshotEntry } from '../../contract';
import { instanceOf } from '../fixtures';

/** MSW writes path parameters as `:name`; the snapshot as `{name}`. */
export function mswPath(template: string): string {
  return template.replace(/\{([^}]+)\}/g, ':$1');
}

/** The template of a route. */
export function templateOf(route: ApiRoute): string {
  return typeof route === 'string' ? route : route.template;
}

/** The success status and body an operation answers with. */
export function successOf(entry: SnapshotEntry): { status: number; body: unknown } {
  const [status, response] = Object.entries(entry.operation.responses)
    .filter(([code]) => /^2\d\d$/.test(code))
    .sort(([a], [b]) => Number(a) - Number(b))[0];
  const schema = response.content?.['application/json']?.schema;
  return { status: Number(status), body: schema ? instanceOf(schema) : null };
}

/** One success handler per operation of the snapshot under `routes`. */
export function successHandlers(routes: Readonly<Record<string, ApiRoute>>): HttpHandler[] {
  const templates = new Set(Object.values(routes).map(templateOf));
  return SNAPSHOT_OPERATIONS.filter(({ path }) => templates.has(path)).map((entry) => {
    const { status, body } = successOf(entry);
    return http[entry.method](mswPath(entry.path), () =>
      body === null ? new HttpResponse(null, { status }) : HttpResponse.json(body, { status }),
    );
  });
}
