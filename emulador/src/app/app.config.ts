import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideStore } from '@ngrx/store';
import { provideEffects } from '@ngrx/effects';

import { routes } from './app.routes';
import { authInterceptor } from './auth/auth.interceptor';
import { marketFeature } from './state/market/market.reducer';
import { replayFeature } from './state/replay/replay.reducer';
import { settingsFeature } from './state/settings/settings.reducer';
import { drawingsFeature } from './state/drawings/drawings.reducer';
import { workspacesFeature } from './state/workspaces/workspaces.reducer';
import { tradingFeature } from './state/trading/trading.reducer';
import { authFeature } from './state/auth/auth.reducer';
import { userSymbolsFeature } from './state/user-symbols/user-symbols.reducer';
import { ReplayEffects } from './state/replay/replay.effects';
import { SettingsEffects } from './state/settings/settings.effects';
import { WorkspacesEffects } from './state/workspaces/workspaces.effects';
import { TradingEffects } from './state/trading/trading.effects';
import { AuthEffects } from './state/auth/auth.effects';
import { UserSymbolsEffects } from './state/user-symbols/user-symbols.effects';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideRouter(routes, withComponentInputBinding()),
    provideStore({
      [marketFeature.name]: marketFeature.reducer,
      [replayFeature.name]: replayFeature.reducer,
      [settingsFeature.name]: settingsFeature.reducer,
      [drawingsFeature.name]: drawingsFeature.reducer,
      [workspacesFeature.name]: workspacesFeature.reducer,
      [tradingFeature.name]: tradingFeature.reducer,
      [authFeature.name]: authFeature.reducer,
      [userSymbolsFeature.name]: userSymbolsFeature.reducer,
    }),
    provideEffects(
      ReplayEffects,
      SettingsEffects,
      WorkspacesEffects,
      TradingEffects,
      AuthEffects,
      UserSymbolsEffects,
    ),
  ],
};
