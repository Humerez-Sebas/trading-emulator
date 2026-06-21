import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { AuthActions } from '../../state/auth/auth.actions';
import { authFeature } from '../../state/auth/auth.reducer';
import { ButtonDirective } from '../../components/ui/button.directive';
import { environment } from '../../../environments/environment';

/**
 * Login page (invite-only: no registration). Real labels + explicit submit
 * feedback (loading -> error). Guest mode entry preserved.
 */
@Component({
  selector: 'app-auth-page',
  standalone: true,
  imports: [FormsModule, ButtonDirective],
  templateUrl: './auth-page.component.html',
  styleUrl: './auth-page.component.css',
})
export class AuthPageComponent {
  private store = inject(Store);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  pending = this.store.selectSignal(authFeature.selectPending);
  error = this.store.selectSignal(authFeature.selectError);
  status = this.store.selectSignal(authFeature.selectStatus);

  email = signal('');
  password = signal('');

  offline = computed(() => this.status() === 'offline');
  guestModeEnabled = environment.guestModeEnabled;

  private static readonly EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  valid = computed(
    () => AuthPageComponent.EMAIL_RE.test(this.email().trim()) && this.password().length >= 6,
  );

  continueAsGuest(): void {
    this.store.dispatch(AuthActions.continueAsGuest());
    this.router.navigateByUrl('/');
  }

  submit(): void {
    if (!this.valid() || this.pending()) return;
    const returnUrl = this.route.snapshot.queryParamMap.get('volver');
    this.store.dispatch(
      AuthActions.login({ email: this.email().trim(), password: this.password(), returnUrl }),
    );
  }
}
