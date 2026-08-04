import { AfterViewInit, ChangeDetectionStrategy, Component, OnDestroy, ViewEncapsulation, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { mount, unmount } from '../../lotaje/lotaje-view';

/**
 * Thin Angular host for the framework-free Lotaje view (RFC-020 Task D-1).
 *
 * This component owns NOTHING of the tool's behaviour — no signals, no
 * computed sizing, no NgRx. Its entire job is: give the vanilla view a
 * container element, call `mount(document, window)` after the view has
 * initialized, and call `unmount()` on destroy. All state, validation, and
 * rendering live in `emulador/src/app/lotaje/lotaje-view.ts`, which is closed
 * to Angular/NgRx imports (RFC §7.1 item 6, grep-checked).
 *
 * `DOCUMENT`/`window` are threaded through explicitly rather than read from
 * the bare globals — `mount()`'s contract requires it (Task D-6 mounts the
 * SAME view into a Document Picture-in-Picture window, a different realm).
 */
@Component({
  selector: 'app-calculadora-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  // The vanilla view builds its DOM via `document.createElement`, never
  // through Angular's template compiler, so Angular's default
  // ViewEncapsulation.Emulated (which relies on a compiler-stamped
  // `_ngcontent-*` attribute Angular only adds to template-authored elements)
  // would never match those nodes — the CSS below would silently no-op.
  // `None` bundles this file's CSS globally instead; every selector below is
  // scoped under `.lotaje-root`/`lotaje-` class names to avoid collisions
  // with the rest of the app.
  encapsulation: ViewEncapsulation.None,
  templateUrl: './calculadora-page.component.html',
  styleUrl: './calculadora-page.component.css',
})
export class CalculadoraPageComponent implements AfterViewInit, OnDestroy {
  private readonly doc = inject(DOCUMENT);

  ngAfterViewInit(): void {
    const win = this.doc.defaultView;
    if (!win) {
      throw new Error('CalculadoraPageComponent: no window available to mount the Lotaje view');
    }
    mount(this.doc, win);
  }

  ngOnDestroy(): void {
    unmount();
  }
}
