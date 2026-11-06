import { Routes } from '@angular/router';

/**
 * Lazy per area. No guard yet: guards read `GET /api/v1/me/state`, which arrives with the session
 * work (FE-4). There is no teacher layout and no teacher route: see `features/teacher/README.md`.
 */
export const routes: Routes = [
  {
    path: 'entrar',
    loadComponent: () =>
      import('./layouts/public-layout/public-layout').then((m) => m.PublicLayout),
    children: [
      {
        path: '',
        title: 'Entrar · SINAPSE',
        loadChildren: () => import('./features/auth/pages/auth.routes').then((m) => m.AUTH_ROUTES),
      },
    ],
  },
  {
    path: '',
    loadComponent: () =>
      import('./layouts/student-layout/student-layout').then((m) => m.StudentLayout),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'hoje' },
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
