/**
 * The MSW server of the unit tests: every operation's success path, plus whatever a test adds
 * with `server.use(...)`. An unhandled request fails the test.
 */
import { setupServer } from 'msw/node';

import { handlers } from './handlers';

export const server = setupServer(...handlers);

/** Starts the server for the current spec file and resets added handlers after each test. */
export function useMswServer(): typeof server {
  beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());
  return server;
}
