import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Store } from '@ngrx/store';
import { AuthActions } from '../../state/auth/auth.actions';
import { authFeature } from '../../state/auth/auth.reducer';
import { ButtonDirective } from '../../components/ui/button.directive';

/**
 * Login page (invite-only: no registration). Real labels + explicit submit
 * feedback (loading -> error). Login is required to use the app.
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

  pending = this.store.selectSignal(authFeature.selectPending);
  error = this.store.selectSignal(authFeature.selectError);

  email = signal('');
  password = signal('');

  private static readonly EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  valid = computed(
    () => AuthPageComponent.EMAIL_RE.test(this.email().trim()) && this.password().length >= 6,
  );

  submit(): void {
    if (!this.valid() || this.pending()) return;
    const returnUrl = this.route.snapshot.queryParamMap.get('volver');
    this.store.dispatch(
      AuthActions.login({ email: this.email().trim(), password: this.password(), returnUrl }),
    );
  }
}
