import {
  HttpClient,
  type HttpResourceOptions,
  type HttpResourceRef,
  httpResource,
} from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';

import { ApiRoutes, routeTemplateOf } from './api-routes';
import { type WireParams, toWireBody, toWireParams } from './wire';

/** What every request asks for: JSON, or the RFC 7807 body of a failure. */
export const ACCEPT = 'application/json, application/problem+json';

/** The client-side timeout of a request, in milliseconds. */
export const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * `GET /api/v1/me/data-export` assembles the account's whole LGPD package on demand, so it gets
 * longer. The value is this client's choice: the backend states no duration for the export.
 */
export const DATA_EXPORT_TIMEOUT_MS = 120_000;

/** The timeout for a request to `url`. */
export function timeoutFor(url: string): number {
  return routeTemplateOf(url) === ApiRoutes.dataRights.dataExport
    ? DATA_EXPORT_TIMEOUT_MS
    : DEFAULT_TIMEOUT_MS;
}

/** A read, as `ApiClient.read` takes it. */
export interface ApiReadRequest {
  /** A path from `ApiRoutes`, relative, never absolute. */
  readonly url: string;
  readonly params?: WireParams;
}

/** Options of an imperative request. */
export interface ApiRequestOptions {
  readonly params?: WireParams;
}

/**
 * The API client, and the only class in this repository that holds `HttpClient` (`CLAUDE.md` R1).
 * A thin wrapper: it adds what every request needs and nothing a screen should decide.
 *
 * - paths come from `ApiRoutes`, relative: same origin is a premise, and the session cookie is
 *   `SameSite=Strict; Path=/api/v1`;
 * - `withCredentials: true`, so the session cookie travels; no token is read, kept or sent;
 * - `Accept: application/json, application/problem+json`;
 * - instants serialised with their offset, local dates and times untouched (`wire.ts`);
 * - a 30 s timeout, 120 s for the data export.
 *
 * Every failure reaches the caller as an `ApiFailure` (`api-problem.ts`), converted by the
 * interceptor chain registered in `app.config.ts`. No cache: the read models are already shaped
 * for the screen, and a cache would be a decision with an ADR.
 */
@Injectable({ providedIn: 'root' })
export class ApiClient {
  private readonly http = inject(HttpClient);

  /**
   * A reactive read, built on `httpResource`: it re-runs when the signals `request` reads change,
   * and is idle while `request` returns `undefined`. Call it in an injection context (a field
   * initialiser of a component or service), or pass `options.injector`. Its `error()` is an
   * `ApiFailure`; `apiFailureOf` reads it.
   */
  read<T>(
    request: () => ApiReadRequest | undefined,
    options?: HttpResourceOptions<T, unknown>,
  ): HttpResourceRef<T | undefined> {
    return httpResource<T>(
      () => {
        const read = request();
        return read === undefined
          ? undefined
          : {
              url: read.url,
              method: 'GET',
              params: toWireParams(read.params),
              headers: { Accept: ACCEPT },
              withCredentials: true,
              timeout: timeoutFor(read.url),
            };
      },
      options as HttpResourceOptions<T, unknown>,
    );
  }

  /** A one-off read, for what is not bound to a screen's signals (polling a generation job). */
  get<T>(url: string, options?: ApiRequestOptions): Observable<T> {
    return this.http.get<T>(url, this.options(url, options));
  }

  post<T>(url: string, body?: unknown, options?: ApiRequestOptions): Observable<T> {
    return this.http.post<T>(url, toWireBody(body ?? null), this.options(url, options));
  }

  patch<T>(url: string, body: unknown, options?: ApiRequestOptions): Observable<T> {
    return this.http.patch<T>(url, toWireBody(body), this.options(url, options));
  }

  delete<T = void>(url: string, options?: ApiRequestOptions): Observable<T> {
    return this.http.delete<T>(url, this.options(url, options));
  }

  private options(url: string, options: ApiRequestOptions | undefined) {
    return {
      params: toWireParams(options?.params),
      headers: { Accept: ACCEPT },
      withCredentials: true,
      timeout: timeoutFor(url),
    };
  }
}
