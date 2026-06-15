import { inject, Injectable } from '@angular/core';
import { createEffect } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { tap } from 'rxjs/operators';
import { persistSettings, settingsFeature } from './settings.reducer';

@Injectable()
export class SettingsEffects {
  private store = inject(Store);

  /** Persists all settings to localStorage on every change. */
  persist$ = createEffect(
    () =>
      this.store
        .select(settingsFeature.selectSettingsState)
        .pipe(tap((state) => persistSettings(state))),
    { dispatch: false },
  );
}
