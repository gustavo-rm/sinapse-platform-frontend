import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Placeholder for the "Plano" area. It renders only its name until the area is built. */
@Component({
  selector: 'sn-plan-page',
  template: `<h1 class="display-md">Plano</h1>`,
  styles: ':host { display: block; } h1 { margin: 0; }',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlanPage {}
