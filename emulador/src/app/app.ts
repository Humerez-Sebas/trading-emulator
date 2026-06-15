import { Component, DestroyRef, ElementRef, HostListener, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Store } from '@ngrx/store';
import { selectTheme } from './state/selectors';
import { authFeature } from './state/auth/auth.reducer';
import { AuthActions } from './state/auth/auth.actions';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private store = inject(Store);
  private destroyRef = inject(DestroyRef);
  private host = inject(ElementRef<HTMLElement>);

  user = this.store.selectSignal(authFeature.selectUser);
  status = this.store.selectSignal(authFeature.selectStatus);
  menuOpen = signal(false);

  constructor() {
    // applies the theme as an attribute on <html> to activate the CSS tokens
    this.store
      .select(selectTheme)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((theme) => {
        document.documentElement.setAttribute('data-theme', theme);
      });
  }

  logout(): void {
    this.menuOpen.set(false);
    this.store.dispatch(AuthActions.logout());
  }

  @HostListener('document:mousedown', ['$event'])
  closeMenuOutside(event: MouseEvent): void {
    if (!this.menuOpen()) return;
    const menu = (this.host.nativeElement as HTMLElement).querySelector('.user-menu');
    if (menu && !menu.contains(event.target as Node)) this.menuOpen.set(false);
  }
}
