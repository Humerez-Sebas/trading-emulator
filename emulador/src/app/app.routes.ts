import { Routes } from '@angular/router';
import { authGuard } from './auth/auth.guard';
import { r2OnboardingGuard } from './components/data-wizard/data-wizard.guard';

export const routes: Routes = [
  {
    path: '',
    // r2OnboardingGuard is a no-op for the default csv data source; for r2 it
    // sends a first-time user (no datasets yet) to /data-wizard.
    canActivate: [authGuard, r2OnboardingGuard],
    loadComponent: () =>
      import('./pages/emulador/emulador-page.component').then((m) => m.EmuladorPageComponent),
  },
  {
    path: 'login',
    data: { mode: 'login' },
    loadComponent: () =>
      import('./pages/auth/auth-page.component').then((m) => m.AuthPageComponent),
  },
  {
    path: 'registro',
    data: { mode: 'register' },
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
  {
    // R2/Parquet first-launch onboarding (Task 6). Only reached when
    // environment.dataSource === 'r2'; the CSV flow uses /sesiones/crear.
    path: 'data-wizard',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./components/data-wizard/data-wizard.component').then((m) => m.DataWizardComponent),
  },
  { path: '**', redirectTo: '' },
];
