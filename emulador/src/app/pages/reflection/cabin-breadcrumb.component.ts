import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { ButtonDirective } from '../../components/ui/button.directive';

/**
 * "← Journal" + prev/next trade arrows + "Trade #N de M" (design spec §2.1,
 * RFC-016 D16.F circular flow). Pure presentation: index/total in, `back`
 * (→ Journal) / `prev` / `next` out. No Store below the page (J-6).
 */
@Component({
  selector: 'app-cabin-breadcrumb',
  standalone: true,
  imports: [ButtonDirective],
  template: `
    <nav class="cabin-breadcrumb" aria-label="Navegación de la Cabina">
      <button type="button" appButton variant="ghost" (click)="back.emit()">← Journal</button>
      <div class="trade-nav">
        <button
          type="button"
          appButton
          variant="ghost"
          size="sm"
          [disabled]="index() <= 1"
          aria-label="Trade anterior"
          (click)="prev.emit()"
        >
          ←
        </button>
        <span class="trade-count">Trade #{{ index() }} de {{ total() }}</span>
        <button
          type="button"
          appButton
          variant="ghost"
          size="sm"
          [disabled]="index() >= total()"
          aria-label="Trade siguiente"
          (click)="next.emit()"
        >
          →
        </button>
      </div>
    </nav>
  `,
  styles: `
    .cabin-breadcrumb {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--density-gap);
    }
    .trade-nav {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }
    .trade-count {
      font-size: var(--density-font);
      color: var(--text-muted);
      font-variant-numeric: tabular-nums;
      min-width: 10ch;
      text-align: center;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CabinBreadcrumbComponent {
  /** 1-based position of the active trade among `total`. */
  index = input.required<number>();
  total = input.required<number>();

  back = output<void>();
  prev = output<void>();
  next = output<void>();
}
