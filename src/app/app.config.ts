import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';

import { correlationIdInterceptor } from './core/api/interceptors/correlation-id.interceptor';
import { networkRetryInterceptor } from './core/api/interceptors/network-retry.interceptor';
import { problemDetailInterceptor } from './core/api/interceptors/problem-detail.interceptor';
import { rateLimitInterceptor } from './core/api/interceptors/rate-limit.interceptor';
import { sessionExpiryInterceptor } from './core/api/interceptors/session-expiry.interceptor';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    // The order is the contract of the API layer (FE-3). Angular runs the request side of these
    // top to bottom and the response side bottom to top, so on a failure they act in this
    // sequence: (1) the correlation id is set on the way out; (2) the problem converter turns the
    // response into an ApiFailure; the retry policy repeats a GET that met a network error;
    // (3) the session expiry acts on `unauthenticated`; (4) the rate limit on
    // `rate-limit-exceeded`; and the correlation interceptor, outermost, logs the final failure.
    // Nothing reads a problem type before the converter has run. `api-interceptors.spec.ts`
    // holds this sequence.
    provideHttpClient(
      withInterceptors([
        correlationIdInterceptor,
        rateLimitInterceptor,
        sessionExpiryInterceptor,
        networkRetryInterceptor,
        problemDetailInterceptor,
      ]),
    ),
  ],
};
