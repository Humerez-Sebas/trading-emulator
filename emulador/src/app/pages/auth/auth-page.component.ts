import { Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Store } from '@ngrx/store';
import { AuthActions } from '../../state/auth/auth.actions';
import { authFeature } from '../../state/auth/auth.reducer';
import { ButtonDirective } from '../../components/ui/button.directive';
import { environment } from '../../../environments/environment';

/**
 * Login and registration share one page; the route data decides the mode.
 * Form UX per the design guidelines: real labels (not placeholder-only)
 * and explicit submit feedback (loading -> success/error).
 */
@Component({
  selector: 'app-auth-page',
  standalone: true,
  imports: [FormsModule, RouterLink, ButtonDirective],
  templateUrl: './auth-page.component.html',
  styleUrl: './auth-page.component.css',
})
export class AuthPageComponent {
  private store = inject(Store);
  private route = inject(ActivatedRoute);

  /** 'login' | 'register', provided by the route data. */
  mode = input<'login' | 'register'>('login');

  pending = this.store.selectSignal(authFeature.selectPending);
  error = this.store.selectSignal(authFeature.selectError);
  status = this.store.selectSignal(authFeature.selectStatus);

  username = signal('');
  password = signal('');

  isLogin = computed(() => this.mode() === 'login');
  offline = computed(() => this.status() === 'offline');
  // hidden in prod (closed registration); the backend also enforces it (403)
  registrationEnabled = environment.registrationEnabled;

  valid = computed(() => this.username().trim().length >= 3 && this.password().length >= 6);

  submit(): void {
    if (!this.valid() || this.pending()) return;
    const returnUrl = this.route.snapshot.queryParamMap.get('volver');
    const payload = {
      username: this.username().trim(),
      password: this.password(),
      returnUrl,
    };
    this.store.dispatch(
      this.isLogin() ? AuthActions.login(payload) : AuthActions.register(payload),
    );
  }
}
