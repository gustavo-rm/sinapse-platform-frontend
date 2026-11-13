import { Routes } from '@angular/router';

import { PlanHistoryPage } from './plan-history-page';
import { PlanPage } from './plan-page';

/** Routes of the "Plano" area, loaded lazily by `app.routes.ts`. History lives inside Plano (`docs/DESIGN_SYSTEM.md` §7). */
export const PLAN_ROUTES: Routes = [
  { path: '', component: PlanPage },
  { path: 'historico', title: 'Histórico de planos · SINAPSE', component: PlanHistoryPage },
];
