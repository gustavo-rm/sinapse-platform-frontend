import { DestroyRef, inject, signal } from '@angular/core';

/**
 * The submit of a form while the server's rate limit holds it (decision C6 of FE-4): disabled for
 * the `Retry-After` the 429 carried; with none, until the person changes what they typed. Never a
 * retry control, and never a retry by itself — the button only becomes usable again.
 *
 * Create it in a field initialiser of a component (it injects `DestroyRef`, to clear its timer).
 * `RateLimitNotice` takes `seconds()` while `blocked()`.
 */
export class SubmitBlock {
  /** `undefined`: not blocked. A number: the server's wait. `null`: blocked, with no wait given. */
  private readonly wait = signal<number | null | undefined>(undefined);
  private timer: ReturnType<typeof setTimeout> | undefined;

  readonly seconds = this.wait.asReadonly();

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  blocked(): boolean {
    return this.wait() !== undefined;
  }

  /** Blocks for `seconds`, or — with none — until `edited()`. */
  block(seconds: number | null): void {
    this.wait.set(seconds);
    clearTimeout(this.timer);
    if (seconds !== null) {
      this.timer = setTimeout(() => this.wait.set(undefined), seconds * 1000);
    }
  }

  /** The person changed the form: a block with no wait from the server lifts. */
  edited(): void {
    if (this.wait() === null) {
      this.wait.set(undefined);
    }
  }
}
