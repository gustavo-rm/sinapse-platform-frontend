import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { ApiProblemFailure, TransportFailure } from '../../core/api/api-problem';
import { PROBLEM_TYPES, type ProblemType } from '../../core/api/contract/problem-type';
import { PROBLEM_TYPE_LABELS } from '../labels/problem-type.labels';
import { TRANSPORT_FAILURE_LABELS } from '../labels/transport-failure.labels';
import { EmptyState } from './empty-state/empty-state';
import {
  ErrorState,
  RETRYABLE_PROBLEM_TYPES,
  type ErrorStateProblem,
} from './error-state/error-state';
import { LoadingState } from './loading-state/loading-state';
import { RateLimitNotice, describeWait } from './rate-limit-notice/rate-limit-notice';

async function render<T>(component: new () => T): Promise<{ host: HTMLElement; instance: T }> {
  const fixture = TestBed.createComponent(component);
  await fixture.whenStable();
  return { host: fixture.nativeElement as HTMLElement, instance: fixture.componentInstance };
}

describe('LoadingState', () => {
  @Component({
    imports: [LoadingState],
    template: `<sn-loading-state
      label="Carregando a agenda de hoje"
      [shape]="shape()"
      [count]="4"
    />`,
    changeDetection: ChangeDetectionStrategy.OnPush,
  })
  class Host {
    readonly shape = signal<'lines' | 'cards'>('lines');
  }

  it('is a skeleton marked busy, never a spinner, with its purpose announced', async () => {
    const { host } = await render(Host);
    const busy = host.querySelector('[aria-busy="true"]');

    expect(busy).not.toBeNull();
    expect(busy?.querySelector('[role="status"]')?.textContent?.trim()).toBe(
      'Carregando a agenda de hoje',
    );
    expect(host.querySelectorAll('.sn-skel')).toHaveLength(4);
    expect(host.querySelector('[role="progressbar"], .spinner')).toBeNull();
  });

  it('hides the placeholder shapes from assistive technology', async () => {
    const { host } = await render(Host);
    for (const card of host.querySelectorAll('.sn-card')) {
      expect(card.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('takes the shape of a list of cards when asked', async () => {
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.shape.set('cards');
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('.sn-card')).toHaveLength(4);
  });
});

describe('EmptyState', () => {
  @Component({
    imports: [EmptyState],
    template: `
      <sn-empty-state
        title="Nada planejado para hoje"
        description="Seu plano não reservou sessões para esta data."
        actionLabel="Estudar por conta própria"
        (action)="taken = taken + 1"
      />
    `,
  })
  class Host {
    taken = 0;
  }

  @Component({
    imports: [EmptyState],
    template: `<sn-empty-state title="Ainda não há sessões vencidas para comparar." />`,
  })
  class NoActionHost {}

  it('shows an icon, one sentence and one primary action', async () => {
    const { host, instance } = await render(Host);

    expect(host.querySelector('.sn-state__icon')?.getAttribute('aria-hidden')).toBe('true');
    expect(host.querySelector('.sn-state__icon svg')).not.toBeNull();
    expect(host.querySelector('h2')?.textContent?.trim()).toBe('Nada planejado para hoje');
    expect(host.querySelector('p')?.textContent?.trim()).toBe(
      'Seu plano não reservou sessões para esta data.',
    );

    const buttons = host.querySelectorAll<HTMLButtonElement>('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0].classList).toContain('sn-btn--primary');
    buttons[0].click();
    expect(instance.taken).toBe(1);
  });

  it('draws no button when no action is possible', async () => {
    const { host } = await render(NoActionHost);
    expect(host.querySelector('button')).toBeNull();
  });
});

describe('ErrorState', () => {
  @Component({
    imports: [ErrorState],
    template: `<sn-error-state [problem]="problem()" (retry)="retried = retried + 1" />`,
    changeDetection: ChangeDetectionStrategy.OnPush,
  })
  class Host {
    readonly problem = signal<ErrorStateProblem>({ type: 'urn:sinapse:problem:internal-error' });
    retried = 0;
  }

  async function renderProblem(problem: ErrorStateProblem) {
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.problem.set(problem);
    await fixture.whenStable();
    return { host: fixture.nativeElement as HTMLElement, instance: fixture.componentInstance };
  }

  it('is announced as an alert and words the message by problem type', async () => {
    const { host } = await renderProblem({ type: 'urn:sinapse:problem:setup-incomplete' });

    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    expect(host.querySelector('h2')?.textContent?.trim()).toBe(
      PROBLEM_TYPE_LABELS['urn:sinapse:problem:setup-incomplete'],
    );
  });

  it('tells apart the three problem types that share HTTP 409', async () => {
    const messages = new Set<string>();
    for (const type of [
      'urn:sinapse:problem:conflict',
      'urn:sinapse:problem:setup-incomplete',
      'urn:sinapse:problem:prerequisite-cycle',
    ] as const) {
      const { host } = await renderProblem({ type });
      messages.add(host.querySelector('h2')?.textContent?.trim() ?? '');
    }
    expect(messages.size).toBe(3);
  });

  it('offers a retry for internal-error, and the retry reaches the screen', async () => {
    const { host, instance } = await renderProblem({ type: 'urn:sinapse:problem:internal-error' });
    const button = host.querySelector<HTMLButtonElement>('button');

    expect(button?.textContent?.trim()).toBe('Tentar de novo');
    button?.click();
    expect(instance.retried).toBe(1);
  });

  it.each(PROBLEM_TYPES.filter((type) => !RETRYABLE_PROBLEM_TYPES.has(type)))(
    'offers no retry for %s',
    async (type: ProblemType) => {
      const { host } = await renderProblem({ type });
      expect(host.querySelector('button')).toBeNull();
    },
  );

  it('keeps the correlation id collapsed in a <details>', async () => {
    const { host } = await renderProblem({
      type: 'urn:sinapse:problem:internal-error',
      correlationId: '01HQ8Z3K7F9M2P4R6T8V0W1X3Y',
    });
    const details = host.querySelector('details');

    expect(details).not.toBeNull();
    expect(details?.open).toBe(false);
    expect(details?.querySelector('.sn-state__detail')?.textContent?.trim()).toBe(
      '01HQ8Z3K7F9M2P4R6T8V0W1X3Y',
    );
  });

  it.each([
    ['network', true],
    ['timeout', true],
    ['unreadable', false],
  ] as const)(
    'words a transport failure (%s) by its reason; retry offered: %s',
    async (reason, retry) => {
      const failure = new TransportFailure(reason, {
        method: 'GET',
        route: null,
        correlationId: 'c-1',
      });
      const { host } = await renderProblem(failure);

      expect(host.querySelector('[role="alert"] h2')?.textContent?.trim()).toBe(
        TRANSPORT_FAILURE_LABELS[reason],
      );
      expect(host.querySelector('button') !== null).toBe(retry);
      expect(host.querySelector('.sn-state__detail')?.textContent?.trim()).toBe('c-1');
    },
  );

  it('takes an ApiProblemFailure as it is', async () => {
    const failure = new ApiProblemFailure(
      {
        type: 'urn:sinapse:problem:conflict',
        title: 't',
        status: 409,
        detail: 'English detail',
        instance: '/',
      },
      { method: 'POST', route: null, correlationId: null },
    );
    const { host } = await renderProblem(failure);
    expect(host.textContent).toContain(PROBLEM_TYPE_LABELS['urn:sinapse:problem:conflict']);
    expect(host.textContent).not.toContain('English detail');
  });

  it('draws no <details> when there is no correlation id', async () => {
    const { host } = await renderProblem({
      type: 'urn:sinapse:problem:internal-error',
      correlationId: null,
    });
    expect(host.querySelector('details')).toBeNull();
  });
});

describe('RateLimitNotice', () => {
  @Component({
    imports: [RateLimitNotice],
    template: `<sn-rate-limit-notice [retryAfterSeconds]="seconds()" />`,
    changeDetection: ChangeDetectionStrategy.OnPush,
  })
  class Host {
    readonly seconds = signal<number | null>(90);
  }

  it('says when trying again will be possible, in words, as a polite status', async () => {
    const { host } = await render(Host);
    const status = host.querySelector('[role="status"]');

    expect(status?.textContent).toContain(
      PROBLEM_TYPE_LABELS['urn:sinapse:problem:rate-limit-exceeded'],
    );
    expect(status?.textContent).toContain('Aguarde 2 minutos para tentar outra vez.');
  });

  it('exposes no retry control at all', async () => {
    const { host } = await render(Host);
    expect(host.querySelector('button, a, [role="button"], input, [tabindex]')).toBeNull();
  });

  it('still says to wait when the server gave no interval', async () => {
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.seconds.set(null);
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Aguarde um pouco para tentar outra vez.',
    );
  });

  it.each([
    [1, '1 segundo'],
    [40, '40 segundos'],
    [60, '1 minuto'],
    [61, '2 minutos'],
    [3600, '1 hora'],
    [3900, '1 hora e 5 minutos'],
    [7199, '2 horas'],
  ])('rounds %i seconds up to "%s", never earlier than the server allows', (seconds, words) => {
    expect(describeWait(seconds)).toBe(words);
  });

  it.each([0, -5, Number.NaN, null, undefined])('has nothing to say for %s', (seconds) => {
    expect(describeWait(seconds)).toBeNull();
  });
});
