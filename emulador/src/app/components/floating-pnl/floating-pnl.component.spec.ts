import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { afterEach, describe, beforeEach, it, expect } from 'vitest';
import { FloatingPnlComponent } from './floating-pnl.component';
import { selectFloatingPnl } from '../../state/selectors';

describe('FloatingPnlComponent', () => {
  let fixture: ComponentFixture<FloatingPnlComponent>;
  let store: MockStore;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [FloatingPnlComponent],
      providers: [provideMockStore()],
    });
    store = TestBed.inject(MockStore);
  });

  // `overrideSelector` forces a memoized RESULT onto the module-level
  // `selectFloatingPnl` singleton. Under the Angular unit-test builder's
  // `isolate: false` pool, that forced value survives this file and leaks into
  // any later spec that reads the real selector (e.g. selectors.spec.ts, which
  // then saw 120.5 instead of computing its own value). Releasing the overrides
  // after each test keeps the singleton clean across files.
  afterEach(() => {
    store.resetSelectors();
  });

  it('oculto cuando el P/L es null', () => {
    store.overrideSelector(selectFloatingPnl, null);
    fixture = TestBed.createComponent(FloatingPnlComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.fpnl')).toBeNull();
  });

  it('muestra el P/L con clase up cuando es positivo', () => {
    store.overrideSelector(selectFloatingPnl, 120.5);
    fixture = TestBed.createComponent(FloatingPnlComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement.querySelector('.fpnl');
    expect(el).not.toBeNull();
    expect(el.classList).toContain('up');
  });
});
