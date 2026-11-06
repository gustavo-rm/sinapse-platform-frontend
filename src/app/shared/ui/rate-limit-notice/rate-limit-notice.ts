import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { PROBLEM_TYPE_LABELS } from '../../labels/problem-type.labels';

/**
 * Turns a `Retry-After` in seconds into words: "40 segundos", "2 minutos", "1 hora e 5 minutos".
 * Rounds up, so the person is never told to come back before the server will answer.
 * Returns `null` when there is nothing to wait for.
 */
export function describeWait(seconds: number | null | undefined): string | null {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) {
    return null;
  }
  const total = Math.ceil(seconds);
  if (total < 60) {
    return plural(total, 'segundo', 'segundos');
  }
  if (total < 3600) {
    return plural(Math.ceil(total / 60), 'minuto', 'minutos');
  }
  let hours = Math.floor(total / 3600);
  let minutes = Math.ceil((total - hours * 3600) / 60);
  if (minutes === 60) {
    hours += 1;
    minutes = 0;
  }
  const hoursText = plural(hours, 'hora', 'horas');
  return minutes === 0 ? hoursText : `${hoursText} e ${plural(minutes, 'minuto', 'minutos')}`;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * The rate limit was reached (`urn:sinapse:problem:rate-limit-exceeded`, HTTP 429). It says when
 * trying again will be possible and offers NO retry control: a 429 is never retried, automatically
 * or by a button, and a button would invite the loop the limit exists to stop.
 */
@Component({
  selector: 'sn-rate-limit-notice',
  template: `
    <div class="sn-alert sn-alert--info" role="status">
      <svg
        width="20"
        height="20"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        aria-hidden="true"
      >
        <circle cx="10" cy="10" r="7.5" />
        <path d="M10 6v4l2.5 2.5" />
      </svg>
      <div>
        <div class="sn-alert__title">{{ message }}</div>
        <div class="sn-alert__body">
          @if (wait(); as text) {
            Aguarde {{ text }} para tentar outra vez.
          } @else {
            Aguarde um pouco para tentar outra vez.
          }
        </div>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RateLimitNotice {
  /** The `Retry-After` of the 429 response, in seconds, as the server sends it. */
  readonly retryAfterSeconds = input<number | null>(null);

  protected readonly message = PROBLEM_TYPE_LABELS['urn:sinapse:problem:rate-limit-exceeded'];
  protected readonly wait = computed(() => describeWait(this.retryAfterSeconds()));
}
