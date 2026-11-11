import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { IntervalDialogComponent } from './interval-dialog.component';
import { MarketDataRepository } from '../../domain/market-data.repository';
import { ManifestService } from '../../services/market-data/manifest.service';
import { DataOnboardingService } from '../../services/market-data/data-onboarding.service';
import { selectCurrentAsset, selectSeries } from '../../state/selectors';

describe('IntervalDialogComponent global digit hotkey', () => {
  let fixture: ComponentFixture<IntervalDialogComponent>;
  let store: MockStore;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [IntervalDialogComponent],
      providers: [
        provideMockStore(),
        { provide: ManifestService, useValue: {} },
        { provide: DataOnboardingService, useValue: {} },
        { provide: MarketDataRepository, useValue: {} },
      ],
    });
    store = TestBed.inject(MockStore);
    store.overrideSelector(selectSeries, {} as never);
    store.overrideSelector(selectCurrentAsset, 'EURUSD' as never);
    fixture = TestBed.createComponent(IntervalDialogComponent);
    fixture.detectChanges();
  });

  afterEach(() => store.resetSelectors());

  function press(init: KeyboardEventInit): void {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init }));
  }

  it('a bare digit opens the dialog', () => {
    press({ key: '3', code: 'Digit3' });
    expect(fixture.componentInstance.open()).toBe(true);
    expect(fixture.componentInstance.raw()).toBe('3');
  });

  it.each([{ altKey: true }, { ctrlKey: true }, { metaKey: true }])(
    'a digit with %o held does NOT open the dialog',
    (mods) => {
      press({ key: '3', code: 'Digit3', ...mods });
      expect(fixture.componentInstance.open()).toBe(false);
    },
  );
});
