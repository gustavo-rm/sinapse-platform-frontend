/**
 * The failures the API layer must tell apart, as MSW handlers for a given path and method: each
 * problem type with its status and generated body, and a network failure with no response.
 */
import { type HttpHandler, HttpResponse, http } from 'msw';

import type { ProblemType } from '../../app/core/api/contract/problem-type';
import type { HttpMethod } from '../contract';
import { type ProblemOptions, problemResponse } from './problems';

/** Answers `method path` with a problem of `type`; counts the requests it received. */
export function problemAt(
  method: HttpMethod,
  path: string,
  type: ProblemType,
  options: ProblemOptions = {},
): HttpHandler & { readonly calls: () => number } {
  let calls = 0;
  const handler = http[method](path, () => {
    calls++;
    return problemResponse(type, { instance: path, ...options });
  });
  return Object.assign(handler, { calls: () => calls });
}

/** Fails `method path` at the network level, with no response; counts the requests. */
export function networkFailureAt(
  method: HttpMethod,
  path: string,
): HttpHandler & { readonly calls: () => number } {
  let calls = 0;
  const handler = http[method](path, () => {
    calls++;
    return HttpResponse.error();
  });
  return Object.assign(handler, { calls: () => calls });
}

/** Answers `method path` with a raw body and status; counts the requests. */
export function rawAt(
  method: HttpMethod,
  path: string,
  status: number,
  body: string,
  contentType: string,
): HttpHandler & { readonly calls: () => number } {
  let calls = 0;
  const handler = http[method](path, () => {
    calls++;
    return new HttpResponse(body, { status, headers: { 'Content-Type': contentType } });
  });
  return Object.assign(handler, { calls: () => calls });
}
