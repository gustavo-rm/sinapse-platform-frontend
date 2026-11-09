import { Injectable, signal } from '@angular/core';

/** A refusal by the server's rate limiter, as the UI needs it. */
export interface RateLimitRefusal {
  /** The route template that was refused; never the concrete path. Null outside `ApiRoutes`. */
  readonly route: string | null;
  readonly method: string;
  /** The response's `Retry-After`, in seconds, or null when the server sent none. */
  readonly retryAfterSeconds: number | null;
  /** When the refusal was received, in epoch milliseconds. */
  readonly receivedAt: number;
}

/**
 * The last rate-limit refusal, published by `rateLimitInterceptor` for whichever screen shows
 * `RateLimitNotice`. The failure itself also carries `retryAfterSeconds` to its caller.
 *
 * Nothing here schedules a retry, and nothing may: a 429 is never retried, automatically or by
 * a button. Plan generation is capped at 10 requests per hour per account
 * (`application.yml`, `planning-generation-request`), and a retry would spend that budget.
 */
@Injectable({ providedIn: 'root' })
export class RateLimitState {
  private readonly last = signal<RateLimitRefusal | null>(null);

  readonly lastRefusal = this.last.asReadonly();

  record(refusal: RateLimitRefusal): void {
    this.last.set(refusal);
  }

  clear(): void {
    this.last.set(null);
  }
}
