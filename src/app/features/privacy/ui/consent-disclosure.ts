import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { CONSENT_PURPOSE_KIND_LABELS } from '../../../shared/labels/consent-purpose-kind.labels';
import { CONSENT_PURPOSE_NOTE_LABELS } from '../../../shared/labels/consent-purpose-note.labels';
import { CONSENT_PURPOSE_LABELS } from '../../../shared/labels/consent-purpose.labels';
import { AccountDatePipe } from '../../../shared/pipes/account-date.pipe';
import { type Wording, isDevelopmentPlaceholder } from '../model/consent';

let nextId = 0;

/**
 * The text of one consent purpose, shown where the person decides (Design System,
 * ConsentDisclosure).
 *
 * - The `body` is a legal document and goes in FULL, in `lead`, within `reading-max`: not
 *   summarised, not folded behind a "read more". Consent to a text the person did not see is not
 *   consent. It comes BEFORE the control.
 * - `version` and `publishedAt` are shown in `sn-terms__ver`: they make auditable which wording
 *   was accepted.
 * - A development placeholder (`dev-0`) carries a visible marker that it is not a consent term.
 * - Essential and optional purposes get the same treatment. The control is never pre-checked, and
 *   no purpose is marked "recommended": the person's choice starts empty.
 *
 * With `choice` set, a checkbox "Li e concordo com esta finalidade" follows the text, with the
 * purpose's note; without it, the text alone. The component sends nothing.
 */
@Component({
  selector: 'sn-consent-disclosure',
  imports: [AccountDatePipe],
  template: `
    <section class="sn-card sn-terms" [attr.aria-labelledby]="id + '-title'">
      <div class="sn-card__head">
        <h2 class="sn-card__title" [id]="id + '-title'">{{ name() }}</h2>
        <span class="sn-badge">{{ kind() }}</span>
      </div>
      <div class="sn-terms__ver">
        versão {{ wording().version }}
        @if (wording().publishedAt; as published) {
          · publicada em {{ published | accountDate: 'longDate' }}
        }
      </div>

      @if (placeholder()) {
        <div class="sn-alert sn-alert--info placeholder" role="note">
          <div class="sn-alert__body">
            <strong>Texto provisório de desenvolvimento.</strong> Não é um termo de consentimento: o
            ambiente de desenvolvimento publica este marcador no lugar do texto real.
          </div>
        </div>
      }

      <div class="sn-terms__body lead text" [id]="id + '-body'">{{ wording().body }}</div>

      @if (choice()) {
        <label class="sn-choice decision">
          <input
            type="checkbox"
            [id]="id + '-choice'"
            [checked]="checked()"
            [disabled]="disabled()"
            [attr.aria-describedby]="id + '-note'"
            (change)="toggled.emit($any($event.target).checked)"
          />
          <span class="sn-choice__text">
            <span class="sn-choice__title">Li e concordo com esta finalidade</span>
            <span class="sn-choice__note" [id]="id + '-note'">{{ note() }}</span>
          </span>
        </label>
      } @else {
        <p class="sn-choice__note note" [id]="id + '-note'">{{ note() }}</p>
      }
      <ng-content />
    </section>
  `,
  styles: `
    :host {
      display: block;
    }
    .placeholder {
      margin-top: var(--space-4);
    }
    .text {
      margin-top: var(--space-4);
      white-space: pre-line;
    }
    .decision {
      margin-top: var(--space-5);
    }
    .note {
      margin: var(--space-4) 0 0;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConsentDisclosure {
  /** The wording in force, exactly as `GET /api/v1/terms` gave it. */
  readonly wording = input.required<Wording>();
  /** Show the "I have read and agree" checkbox. */
  readonly choice = input(false);
  /** The person's choice. Starts false wherever this is used: never pre-checked. */
  readonly checked = input(false);
  readonly disabled = input(false);
  readonly toggled = output<boolean>();

  protected readonly id = `sn-disclosure-${nextId++}`;
  protected readonly name = computed(() => CONSENT_PURPOSE_LABELS[this.wording().purpose]);
  protected readonly kind = computed(() => CONSENT_PURPOSE_KIND_LABELS[this.wording().purpose]);
  protected readonly note = computed(() => CONSENT_PURPOSE_NOTE_LABELS[this.wording().purpose]);
  protected readonly placeholder = computed(() => isDevelopmentPlaceholder(this.wording()));
}
