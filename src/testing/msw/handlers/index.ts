import type { HttpHandler } from 'msw';

import { curriculumHandlers } from './curriculum';
import { dataRightsHandlers } from './data-rights';
import { educationalHandlers } from './educational';
import { identityHandlers } from './identity';
import { learningRecordHandlers } from './learning-record';
import { planningHandlers } from './planning';
import { readModelHandlers } from './read-model';

/**
 * The success path of all 59 operations. A fixed path is listed before any parameterised one so
 * that `/sessions/current` is not taken for `/sessions/{sessionId}`: MSW answers with the first
 * handler that matches.
 */
export const handlers: readonly HttpHandler[] = [
  ...identityHandlers,
  ...planningHandlers,
  ...learningRecordHandlers,
  ...readModelHandlers,
  ...educationalHandlers,
  ...dataRightsHandlers,
  ...curriculumHandlers,
].sort((a, b) => Number(isParameterised(a)) - Number(isParameterised(b)));

function isParameterised(handler: HttpHandler): boolean {
  return String(handler.info.path).includes(':');
}
