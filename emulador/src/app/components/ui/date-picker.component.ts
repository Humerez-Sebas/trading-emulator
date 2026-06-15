import { Component, ElementRef, computed, inject, input, output, signal, viewChild } from '@angular/core';

interface DayCell {
  key: string;
  day: number | null;
  iso: string;
  disabled: boolean;
}

/** First-of-month (UTC) for an ISO yyyy-mm-dd string, or today if empty/invalid. */
function monthStart(iso: string): Date {
  const base = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00Z`) : new Date();
  return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), 1));
}

function isoOf(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Themed date picker (calendar popover) — a dark-theme replacement for the
 * native `<input type="date">` chrome. Works in ISO `yyyy-mm-dd` strings (UTC),
 * matching the wizard / csv date-validation logic. `min`/`max` clamp selectable
 * days and month navigation.
 */
@Component({
  selector: 'ui-date-picker',
  standalone: true,
  host: { class: 'ui-dp', '(document:click)': 'onDocClick($event)' },
  template: `
    <button
      #trigger
      type="button"
      class="dp-trigger"
      aria-haspopup="dialog"
      [attr.aria-expanded]="open()"
      [attr.aria-label]="ariaLabel() || null"
      (click)="toggle()"
    >
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
      </svg>
      <span [class.dp-placeholder]="!display()">{{ display() || placeholder() }}</span>
    </button>
    @if (open()) {
      <div class="dp-pop" role="dialog" aria-label="Elegir fecha" (keydown)="onKey($event)">
        <div class="dp-head">
          <button type="button" class="dp-nav" (click)="shiftMonth(-1)" [disabled]="!canPrev()" aria-label="Mes anterior">‹</button>
          <span class="dp-month">{{ monthLabel() }}</span>
          <button type="button" class="dp-nav" (click)="shiftMonth(1)" [disabled]="!canNext()" aria-label="Mes siguiente">›</button>
        </div>
        <div class="dp-dow" aria-hidden="true">
          @for (d of dow; track d) {
            <span>{{ d }}</span>
          }
        </div>
        <div class="dp-grid" role="grid">
          @for (cell of cells(); track cell.key) {
            @if (cell.day !== null) {
              <button
                type="button"
                class="dp-day"
                [class.selected]="cell.iso === value()"
                [class.today]="cell.iso === todayIso"
                [disabled]="cell.disabled"
                (click)="pick(cell.iso)"
              >
                {{ cell.day }}
              </button>
            } @else {
              <span></span>
            }
          }
        </div>
      </div>
    }
  `,
  styles: [
    `
      :host {
        position: relative;
        display: inline-flex;
      }
      .dp-trigger {
        display: inline-flex;
        align-items: center;
        gap: var(--space-2);
        width: 100%;
        padding: var(--space-2) var(--space-3);
        background: var(--surface-2);
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        color: var(--text);
        font: inherit;
        font-size: var(--text-sm);
        cursor: pointer;
        transition: border-color var(--duration-fast) var(--ease-out);
      }
      .dp-trigger:hover {
        border-color: var(--border-strong);
      }
      .dp-trigger:focus-visible {
        outline: none;
        border-color: var(--accent);
        box-shadow: var(--ring);
      }
      .dp-trigger svg {
        color: var(--text-muted);
        flex-shrink: 0;
      }
      .dp-placeholder {
        color: var(--text-muted);
      }
      .dp-pop {
        position: absolute;
        top: calc(100% + 4px);
        left: 0;
        z-index: 95;
        width: 260px;
        padding: var(--space-3);
        background: var(--surface-3);
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        box-shadow: var(--elevation-2);
        animation: dp-in var(--duration-fast) var(--ease-out);
      }
      .dp-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: var(--space-2);
      }
      .dp-month {
        font-size: var(--text-sm);
        font-weight: var(--weight-semibold);
        text-transform: capitalize;
      }
      .dp-nav {
        width: 26px;
        height: 26px;
        background: none;
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        color: var(--text);
        font-size: var(--text-md);
        line-height: 1;
        cursor: pointer;
      }
      .dp-nav:hover:not(:disabled) {
        background: var(--surface-2);
      }
      .dp-nav:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }
      .dp-dow,
      .dp-grid {
        display: grid;
        grid-template-columns: repeat(7, 1fr);
        gap: 2px;
      }
      .dp-dow {
        margin-bottom: 2px;
      }
      .dp-dow span {
        text-align: center;
        font-size: var(--text-2xs);
        color: var(--text-muted);
        text-transform: uppercase;
      }
      .dp-day {
        aspect-ratio: 1;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: none;
        border: 1px solid transparent;
        border-radius: var(--radius-sm);
        color: var(--text);
        font: inherit;
        font-size: var(--text-xs);
        cursor: pointer;
      }
      .dp-day:hover:not(:disabled) {
        background: var(--surface-2);
      }
      .dp-day.today {
        border-color: var(--border-strong);
      }
      .dp-day.selected {
        background: var(--accent);
        color: var(--on-accent);
      }
      .dp-day:disabled {
        opacity: 0.3;
        cursor: not-allowed;
      }
      @keyframes dp-in {
        from {
          opacity: 0;
          transform: translateY(-4px);
        }
      }
    `,
  ],
})
export class DatePickerComponent {
  value = input('');
  min = input('');
  max = input('');
  placeholder = input('Elegir fecha');
  ariaLabel = input('');
  valueChange = output<string>();

  readonly dow = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
  readonly todayIso = new Date().toISOString().slice(0, 10);

  open = signal(false);
  /** First day (UTC) of the displayed month. */
  private viewMonth = signal(monthStart(''));

  private hostEl = inject<ElementRef<HTMLElement>>(ElementRef);
  private trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');

  display = computed(() => {
    const v = this.value();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return '';
    return new Date(`${v}T00:00:00Z`).toLocaleDateString('es', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
  });

  monthLabel = computed(() =>
    this.viewMonth().toLocaleDateString('es', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
  );

  cells = computed<DayCell[]>(() => {
    const first = this.viewMonth();
    const y = first.getUTCFullYear();
    const m = first.getUTCMonth();
    const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    // Monday-first offset (JS getUTCDay: 0=Sun)
    const lead = (new Date(Date.UTC(y, m, 1)).getUTCDay() + 6) % 7;
    const out: DayCell[] = [];
    for (let i = 0; i < lead; i++) out.push({ key: `b${i}`, day: null, iso: '', disabled: true });
    const min = this.min();
    const max = this.max();
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = isoOf(y, m, d);
      const disabled = (!!min && iso < min) || (!!max && iso > max);
      out.push({ key: iso, day: d, iso, disabled });
    }
    return out;
  });

  canPrev = computed(() => {
    const min = this.min();
    if (!min) return true;
    const first = this.viewMonth();
    return isoOf(first.getUTCFullYear(), first.getUTCMonth(), 1) > min;
  });

  canNext = computed(() => {
    const max = this.max();
    if (!max) return true;
    const first = this.viewMonth();
    const y = first.getUTCFullYear();
    const m = first.getUTCMonth();
    const lastOfMonth = isoOf(y, m, new Date(Date.UTC(y, m + 1, 0)).getUTCDate());
    return lastOfMonth < max;
  });

  toggle(): void {
    if (this.open()) {
      this.close();
    } else {
      this.viewMonth.set(monthStart(this.value()));
      this.open.set(true);
    }
  }

  close(): void {
    this.open.set(false);
  }

  shiftMonth(delta: number): void {
    const first = this.viewMonth();
    this.viewMonth.set(new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + delta, 1)));
  }

  pick(iso: string): void {
    if (iso !== this.value()) this.valueChange.emit(iso);
    this.close();
    this.trigger()?.nativeElement.focus();
  }

  onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
      this.trigger()?.nativeElement.focus();
    }
  }

  onDocClick(event: MouseEvent): void {
    if (this.open() && !this.hostEl.nativeElement.contains(event.target as Node)) this.close();
  }
}
