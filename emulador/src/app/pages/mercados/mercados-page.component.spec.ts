import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { MercadosPageComponent } from './mercados-page.component';

describe('MercadosPageComponent', () => {
  it('renders the R2 markets hub', async () => {
    await TestBed.configureTestingModule({
      imports: [MercadosPageComponent],
    }).compileComponents();

    const fixture = TestBed.createComponent(MercadosPageComponent);
    fixture.detectChanges();

    const host: HTMLElement = fixture.nativeElement;
    expect(host.querySelector('app-r2-markets')).toBeTruthy();
  });

  it('is a thin shell with no injected dependencies (no BackendApiService et al.)', () => {
    // A dependency-free constructor means the component injects nothing of its
    // own — it only declares/renders R2MarketsComponent, which owns its data flow.
    expect(MercadosPageComponent.length).toBe(0);
  });
});
