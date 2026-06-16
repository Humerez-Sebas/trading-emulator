import { InjectionToken } from '@angular/core';
import { environment } from './environment';

export interface Environment {
  backendUrl: string;
  registrationEnabled: boolean;
  offlineOnly: boolean;
  guestModeEnabled: boolean;
}

export const ENVIRONMENT = new InjectionToken<Environment>('environment', {
  providedIn: 'root',
  factory: () => environment,
});
