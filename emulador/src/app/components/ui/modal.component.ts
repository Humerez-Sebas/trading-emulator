import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  output,
  input,
  viewChild,
} from '@angular/core';
import { IconButtonDirective } from './icon-button.directive';

let modalSeq = 0;

/**
 * Presentational modal shell: dimmed overlay + centered panel with a focus
 * trap, ESC/backdrop close, return-focus on teardown and `aria-modal`.
 * Replaces the ad-hoc overlays in session-summary (z100/101) and csv-dialog
 * (z60/61). Project the body into the default slot and the footer via
 * `[footer]`; an optional `[titleSuffix]` rides next to the title.
 *
 * Emits `closed` when the user asks to dismiss (ESC, backdrop or the × button).
 * The host decides whether to actually remove the modal from the DOM.
 */
@Component({
  selector: 'app-modal',
  standalone: true,
  imports: [IconButtonDirective],
  host: { '(keydown)': 'onKeydown($event)' },
  template: `
    <div class="overlay" (click)="onBackdrop()" role="presentation"></div>
    <div
      #panel
      class="panel"
      [class.panel--sm]="size() === 'sm'"
      [class.panel--md]="size() === 'md'"
      [class.panel--lg]="size() === 'lg'"
      tabindex="-1"
      role="dialog"
      aria-modal="true"
      [attr.aria-label]="!title() ? ariaLabel() || null : null"
      [attr.aria-labelledby]="title() ? titleId : null"
    >
      @if (title()) {
        <header class="panel-head">
          <h2 [id]="titleId" class="panel-title">
            {{ title() }}<ng-content select="[titleSuffix]" />
          </h2>
          @if (dismissable()) {
            <button
              appIconButton
              [borderless]="true"
              type="button"
              class="panel-x"
              (click)="requestClose()"
              aria-label="Cerrar"
            >
              <svg
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                aria-hidden="true"
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          }
        </header>
      }
      <div class="panel-body"><ng-content /></div>
      <ng-content select="[footer]" />
    </div>
  `,
  styles: [
    `
      :host {
        position: fixed;
        inset: 0;
        z-index: 1000;
        display: block;
      }
      .overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.55);
        animation: modal-fade var(--duration-base) var(--ease-out);
      }
      .panel {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        display: flex;
        flex-direction: column;
        max-height: calc(100vh - 48px);
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: var(--radius-lg);
        box-shadow: var(--elevation-3);
        color: var(--text);
        font-size: var(--text-sm);
        animation: modal-pop var(--duration-base) var(--ease-out);
      }
      .panel:focus {
        outline: none;
      }
      .panel--sm {
        width: min(420px, calc(100vw - 32px));
      }
      .panel--md {
        width: min(620px, calc(100vw - 32px));
      }
      .panel--lg {
        width: min(880px, calc(100vw - 32px));
      }
      .panel-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-3);
        padding: var(--space-4) var(--space-5);
        border-bottom: 1px solid var(--border);
      }
      .panel-title {
        margin: 0;
        font-size: var(--text-md);
        font-weight: var(--weight-semibold);
      }
      .panel-body {
        overflow: auto;
      }
      @keyframes modal-fade {
        from {
          opacity: 0;
        }
      }
      @keyframes modal-pop {
        from {
          opacity: 0;
          transform: translate(-50%, calc(-50% + 8px)) scale(0.98);
        }
      }
    `,
  ],
})
export class ModalComponent implements AfterViewInit, OnDestroy {
  title = input('');
  ariaLabel = input('');
  size = input<'sm' | 'md' | 'lg'>('md');
  /** Show the × button and allow ESC/backdrop dismissal. */
  dismissable = input(true);
  closeOnBackdrop = input(true);

  closed = output<void>();

  readonly titleId = `modal-title-${modalSeq++}`;
  private panel = viewChild.required<ElementRef<HTMLElement>>('panel');
  private previouslyFocused: HTMLElement | null = null;

  ngAfterViewInit(): void {
    this.previouslyFocused = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';
    // focus the first focusable control, else the panel itself
    const first = this.focusable()[0] ?? this.panel().nativeElement;
    queueMicrotask(() => first.focus());
  }

  ngOnDestroy(): void {
    document.body.style.overflow = '';
    this.previouslyFocused?.focus?.();
  }

  onBackdrop(): void {
    if (this.closeOnBackdrop() && this.dismissable()) this.requestClose();
  }

  requestClose(): void {
    this.closed.emit();
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.dismissable()) {
      event.stopPropagation();
      this.requestClose();
      return;
    }
    if (event.key !== 'Tab') return;
    // focus trap
    const items = this.focusable();
    if (!items.length) {
      event.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  private focusable(): HTMLElement[] {
    const sel =
      'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
    return Array.from(this.panel().nativeElement.querySelectorAll<HTMLElement>(sel)).filter(
      (el) => el.offsetParent !== null || el === document.activeElement,
    );
  }
}
