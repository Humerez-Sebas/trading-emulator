import { Routes } from '@angular/router';
import { authGuard } from './auth/auth.guard';
import { r2OnboardingGuard } from './components/data-wizard/data-wizard.guard';

export const routes: Routes = [
  {
    path: '',
    // r2OnboardingGuard sends a first-time user (no datasets yet) to
    // /mercados (the R2 data hub) so they can pick a symbol before trading.
    canActivate: [authGuard, r2OnboardingGuard],
    loadComponent: () =>
      import('./pages/emulador/emulador-page.component').then((m) => m.EmuladorPageComponent),
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./pages/auth/auth-page.component').then((m) => m.AuthPageComponent),
  },
  {
    path: 'mercados',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/mercados/mercados-page.component').then((m) => m.MercadosPageComponent),
  },
  {
    path: 'sesiones',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/sesiones/sesiones-page.component').then((m) => m.SesionesPageComponent),
  },
  {
    path: 'sesiones/crear',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/crear-sesion/crear-sesion-page.component').then(
        (m) => m.CrearSesionPageComponent,
      ),
  },
  { path: '**', redirectTo: '' },
];
