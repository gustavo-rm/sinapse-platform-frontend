import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Placeholder for the "Agenda" area. It renders only its name until the area is built. */
@Component({
  selector: 'sn-agenda-page',
  template: `<h1 class="display-md">Agenda</h1>`,
  styles: ':host { display: block; } h1 { margin: 0; }',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgendaPage {}
