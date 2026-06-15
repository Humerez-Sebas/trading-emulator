import { Component, input, output } from '@angular/core';
import { ModalComponent } from '../modal.component';
import { ButtonDirective } from '../button.directive';

export interface ConfirmDialogData {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red, solid confirm button for destructive actions. */
  danger?: boolean;
}

/** Themed replacement for `window.confirm`, opened via `DialogService`. */
@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [ModalComponent, ButtonDirective],
  template: `
    <app-modal [title]="data().title" size="sm" (closed)="resolve(false)">
      <p class="modal-pad msg">{{ data().message }}</p>
      <div footer class="modal-foot">
        <button appButton variant="ghost" (click)="resolve(false)">
          {{ data().cancelLabel || 'Cancelar' }}
        </button>
        <button
          appButton
          [variant]="data().danger ? 'danger-solid' : 'primary'"
          (click)="resolve(true)"
        >
          {{ data().confirmLabel || 'Aceptar' }}
        </button>
      </div>
    </app-modal>
  `,
  styles: [
    `
      .msg {
        margin: 0;
        color: var(--text);
        line-height: var(--leading-normal);
      }
    `,
  ],
})
export class ConfirmDialogComponent {
  data = input.required<ConfirmDialogData>();
  result = output<boolean>();

  resolve(value: boolean): void {
    this.result.emit(value);
  }
}
