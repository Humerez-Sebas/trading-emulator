import { describe, expect, it } from 'vitest';
import { authGuard } from './auth/auth.guard';
import { r2OnboardingGuard } from './components/data-wizard/data-wizard.guard';
import { routes } from './app.routes';
import { CalculadoraPageComponent } from './pages/calculadora/calculadora-page.component';

describe('routes — /calculadora', () => {
  const calculadoraRoute = routes.find((r) => r.path === 'calculadora');
  const wildcardIndex = routes.findIndex((r) => r.path === '**');
  const calculadoraIndex = routes.findIndex((r) => r.path === 'calculadora');

  it('exists', () => {
    expect(calculadoraRoute).toBeDefined();
  });

  it('is guarded by authGuard', () => {
    expect(calculadoraRoute?.canActivate).toContain(authGuard);
  });

  it('is NOT guarded by r2OnboardingGuard — the calculator needs no datasets', () => {
    expect(calculadoraRoute?.canActivate).not.toContain(r2OnboardingGuard);
  });

  it('is lazy and resolves to CalculadoraPageComponent', async () => {
    expect(typeof calculadoraRoute?.loadComponent).toBe('function');
    const loaded = await calculadoraRoute?.loadComponent?.();
    expect(loaded).toBe(CalculadoraPageComponent);
  });

  it('is placed before the wildcard route so it is never dead', () => {
    expect(wildcardIndex).toBeGreaterThan(-1);
    expect(calculadoraIndex).toBeGreaterThan(-1);
    expect(calculadoraIndex).toBeLessThan(wildcardIndex);
  });
});
