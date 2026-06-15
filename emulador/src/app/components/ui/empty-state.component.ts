import { Component, input } from '@angular/core';

/**
 * Consistent empty-state block (icon · title · hint · optional CTA).
 * Promotes the repeated `.empty` markup into one primitive. Project an
 * `[icon]` element and an optional CTA into the default slot.
 */
@Component({
  selector: 'ui-empty-state',
  standalone: true,
  template: `
    <div class="empty" [class.empty--compact]="compact()" [class.empty--boxed]="boxed()">
      <span class="empty-icon" aria-hidden="true"><ng-content select="[icon]" /></span>
      <p class="empty-title">{{ title() }}</p>
      @if (hint()) {
        <p class="empty-hint">{{ hint() }}</p>
      }
      <div class="empty-cta"><ng-content /></div>
    </div>
  `,
  styles: [
    `
      .empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        gap: var(--space-2);
        padding: var(--space-8) var(--space-6);
        color: var(--text);
        font-size: var(--text-base);
      }
      .empty--boxed {
        border: 1px dashed var(--border);
        border-radius: var(--radius-md);
      }
      .empty--compact {
        padding: var(--space-4);
        gap: var(--space-1);
        font-size: var(--text-sm);
      }
      .empty-icon {
        display: inline-flex;
        color: var(--text-muted);
      }
      .empty-icon:empty {
        display: none;
      }
      .empty-title {
        margin: 0;
        font-weight: var(--weight-semibold);
      }
      .empty-hint {
        margin: 0;
        max-width: 520px;
        color: var(--text-muted);
        font-size: var(--text-sm);
        line-height: var(--leading-normal);
      }
      .empty-cta:empty {
        display: none;
      }
      .empty-cta {
        margin-top: var(--space-3);
      }
    `,
  ],
})
export class EmptyStateComponent {
  title = input.required<string>();
  hint = input('');
  compact = input(false);
  boxed = input(false);
}
