import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Placeholder for the "Conta" area. It renders only its name until the area is built. */
@Component({
  selector: 'sn-account-page',
  template: `<h1 class="display-md">Conta</h1>`,
  styles: ':host { display: block; } h1 { margin: 0; }',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountPage {}
