import { Routes } from '@angular/router';

import { AccountPage } from './account-page';
import { PasswordChangePage } from './password-change-page';

/** Routes of the "Conta" area, loaded lazily by `app.routes.ts`. */
export const ACCOUNT_ROUTES: Routes = [
  { path: '', component: AccountPage },
  { path: 'senha', title: 'Trocar senha · SINAPSE', component: PasswordChangePage },
];
