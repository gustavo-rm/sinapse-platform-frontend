import { Routes } from '@angular/router';

import {
  APP_HOME_PATH,
  type Gate,
  SESSION_UNAVAILABLE_PATH,
  SIGN_IN_PATH,
  pathOf,
} from './core/session/gate';
import { gateGuard, sessionGuard, unavailableGuard } from './core/session/session-guards';

/** A gate's path as the router writes it, without the leading slash: one source, `pathOf`. */
function at(gate: Gate): string {
  return pathOf(gate).slice(1);
}

/**
 * Lazy per area. Two shells:
 *
 * - the public layout, for signing in and for every screen the guard chain may send a person to
 *   instead of the application (`core/session/gate.ts`). Each gate screen has its own guard, and
 *   opens only for the person the chain sends there;
 * - the student layout, whose children all run `sessionGuard`: nothing in it renders before the
 *   bootstrap (`GET /api/v1/me/state`, through `SessionStore`) has resolved and the chain let the
 *   person through.
 *
 * There is no teacher layout and no teacher route: see `features/teacher/README.md`.
 */
export const routes: Routes = [
  // First: the public shell below has an empty path too, and would otherwise take '/' itself.
  { path: '', pathMatch: 'full', redirectTo: APP_HOME_PATH.slice(1) },
  {
    path: '',
    loadComponent: () =>
      import('./layouts/public-layout/public-layout').then((m) => m.PublicLayout),
    children: [
      {
        path: SIGN_IN_PATH.slice(1),
        title: 'Entrar · SINAPSE',
        loadChildren: () => import('./features/auth/pages/auth.routes').then((m) => m.AUTH_ROUTES),
      },
      {
        path: SESSION_UNAVAILABLE_PATH.slice(1),
        title: 'Indisponível · SINAPSE',
        canActivate: [unavailableGuard],
        loadComponent: () =>
          import('./features/auth/pages/session-unavailable-page').then(
            (m) => m.SessionUnavailablePage,
          ),
      },
      {
        path: at('anonymized'),
        title: 'Conta encerrada · SINAPSE',
        canActivate: [gateGuard('anonymized')],
        loadComponent: () =>
          import('./features/auth/pages/account-status-pages').then((m) => m.AccountClosedPage),
      },
      {
        path: at('suspended'),
        title: 'Conta suspensa · SINAPSE',
        canActivate: [gateGuard('suspended')],
        loadComponent: () =>
          import('./features/auth/pages/account-status-pages').then((m) => m.AccountSuspendedPage),
      },
      {
        path: at('verify-email'),
        title: 'Confirme seu e-mail · SINAPSE',
        canActivate: [gateGuard('verify-email')],
        loadComponent: () =>
          import('./features/onboarding/pages/onboarding-placeholders').then(
            (m) => m.VerifyEmailPage,
          ),
      },
      {
        path: at('guardian-consent'),
        title: 'Consentimento do responsável · SINAPSE',
        canActivate: [gateGuard('guardian-consent')],
        loadComponent: () =>
          import('./features/onboarding/pages/onboarding-placeholders').then(
            (m) => m.GuardianConsentPage,
          ),
      },
      {
        path: at('reaffirmation'),
        title: 'Reafirme seu consentimento · SINAPSE',
        canActivate: [gateGuard('reaffirmation')],
        loadComponent: () =>
          import('./features/onboarding/pages/onboarding-placeholders').then(
            (m) => m.ReaffirmationPage,
          ),
      },
      {
        path: at('consent'),
        title: 'Consentimentos pendentes · SINAPSE',
        canActivate: [gateGuard('consent')],
        loadComponent: () =>
          import('./features/onboarding/pages/onboarding-placeholders').then(
            (m) => m.PendingConsentsPage,
          ),
      },
      {
        path: at('setup'),
        title: 'Configure seus estudos · SINAPSE',
        canActivate: [gateGuard('setup')],
        loadComponent: () =>
          import('./features/onboarding/pages/onboarding-placeholders').then((m) => m.SetupPage),
      },
    ],
  },
  {
    path: '',
    loadComponent: () =>
      import('./layouts/student-layout/student-layout').then((m) => m.StudentLayout),
    canActivateChild: [sessionGuard],
    children: [
      {
        path: 'hoje',
        title: 'Hoje · SINAPSE',
        loadChildren: () =>
          import('./features/today/pages/today.routes').then((m) => m.TODAY_ROUTES),
      },
      {
        path: 'agenda',
        title: 'Agenda · SINAPSE',
        loadChildren: () =>
          import('./features/agenda/pages/agenda.routes').then((m) => m.AGENDA_ROUTES),
      },
      {
        path: 'plano',
        title: 'Plano · SINAPSE',
        loadChildren: () => import('./features/plan/pages/plan.routes').then((m) => m.PLAN_ROUTES),
      },
      {
        path: 'conta',
        title: 'Conta · SINAPSE',
        loadChildren: () =>
          import('./features/account/pages/account.routes').then((m) => m.ACCOUNT_ROUTES),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
