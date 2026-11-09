import { Routes } from '@angular/router';

import { SignInPage } from './sign-in-page';

/** Routes of the "Entrar" area, loaded lazily by `app.routes.ts`. */
export const AUTH_ROUTES: Routes = [{ path: '', component: SignInPage }];
