import { Routes } from '@angular/router';
import { authGuard } from './auth/auth.guard';

export const routes: Routes = [
  {
    path: '',
    canActivate: [authGuard],
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
  { path: '**', redirectTo: '' },
];
