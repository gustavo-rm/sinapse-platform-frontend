import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Placeholder for the "Entrar" area. It renders only its name until the area is built. */
@Component({
  selector: 'sn-sign-in-page',
  template: `<h1 class="display-lg">Entrar</h1>`,
  styles: ':host { display: block; } h1 { margin: 0; }',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignInPage {}
