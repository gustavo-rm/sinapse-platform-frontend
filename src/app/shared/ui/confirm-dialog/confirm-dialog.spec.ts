import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { ConfirmDialog } from './confirm-dialog';

@Component({
  imports: [ConfirmDialog],
  template: `
    <button id="opener" type="button" (click)="open.set(true)">Abrir</button>
    @if (open()) {
      <sn-confirm-dialog
        heading="Retirar?"
        confirmLabel="Retirar e suspender a conta"
        [confirmWord]="word()"
        (confirmed)="confirmed = confirmed + 1"
        (cancelled)="open.set(false)"
      >
        <p>Consequência por extenso.</p>
      </sn-confirm-dialog>
    }
  `,
})
class Host {
  readonly open = signal(false);
  readonly word = signal<string | null>('SUSPENDER');
  confirmed = 0;
}

async function render(word: string | null) {
  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.word.set(word);
  fixture.autoDetectChanges();
  document.body.appendChild(fixture.nativeElement);
  const root = fixture.nativeElement as HTMLElement;
  const opener = root.querySelector('#opener') as HTMLButtonElement;
  opener.focus();
  opener.click();
  await fixture.whenStable();
  await new Promise((resolve) => setTimeout(resolve));
  return { fixture, root, opener };
}

function tab(root: HTMLElement, shiftKey = false): void {
  root
    .querySelector('sn-confirm-dialog')
    ?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true }),
    );
}

describe('ConfirmDialog', () => {
  it('is a labelled, described modal dialog', async () => {
    const { root } = await render('SUSPENDER');
    const dialog = root.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(root.querySelector(`#${dialog.getAttribute('aria-labelledby')}`)?.textContent).toBe(
      'Retirar?',
    );
    expect(
      root.querySelector(`#${dialog.getAttribute('aria-describedby')}`)?.textContent,
    ).toContain('Consequência por extenso.');
  });

  it('destructive: starts on the word, enables the danger action only for the word, and keeps focus inside', async () => {
    const { root, fixture } = await render('SUSPENDER');
    const input = root.querySelector('sn-confirm-dialog input') as HTMLInputElement;
    expect(document.activeElement).toBe(input);
    const action = [...root.querySelectorAll('sn-confirm-dialog button')].at(
      -1,
    ) as HTMLButtonElement;
    expect(action.className).toContain('sn-btn--danger');
    expect(action.className).not.toContain('sn-btn--primary');
    expect(action.disabled).toBe(true);

    input.value = 'suspender ';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(action.disabled).toBe(false);

    action.focus();
    tab(root);
    expect(document.activeElement).toBe(input);
    tab(root, true);
    expect(document.activeElement).toBe(action);
  });

  it('ordinary: starts on Cancelar, closes on Esc, and gives focus back to the opener', async () => {
    const { root, fixture, opener } = await render(null);
    const cancel = root.querySelector('sn-confirm-dialog button') as HTMLButtonElement;
    expect(document.activeElement).toBe(cancel);
    expect(root.querySelector('sn-confirm-dialog input')).toBeNull();
    root
      .querySelector('sn-confirm-dialog')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();
    expect(root.querySelector('sn-confirm-dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});
