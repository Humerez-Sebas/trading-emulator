import { Component, ElementRef, input, output, signal, viewChild } from '@angular/core';
import { ModalComponent } from '../modal.component';
import { ButtonDirective } from '../button.directive';
import { InputDirective } from '../input.directive';

export interface PromptDialogData {
  title: string;
  label?: string;
  message?: string;
  initialValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  maxLength?: number;
}

/**
 * Themed replacement for `window.prompt` (single text field), opened via
 * `DialogService`. Resolves with the trimmed value, or `null` when cancelled
 * or left empty.
 */
@Component({
  selector: 'app-prompt-dialog',
  standalone: true,
  imports: [ModalComponent, ButtonDirective, InputDirective],
  template: `
    <app-modal [title]="data().title" size="sm" (closed)="resolve(null)">
      <form class="modal-pad body" (ngSubmit)="confirm()">
        @if (data().message) {
          <p class="msg">{{ data().message }}</p>
        }
        <label class="ui-field">
          @if (data().label) {
            <span class="ui-field-label">{{ data().label }}</span>
          }
          <input
            #field
            appInput
            type="text"
            [value]="value()"
            (input)="value.set($any($event.target).value)"
            [attr.placeholder]="data().placeholder || null"
            [attr.maxlength]="data().maxLength || null"
          />
        </label>
        <button type="submit" hidden></button>
      </form>
      <div footer class="modal-foot">
        <button appButton variant="ghost" (click)="resolve(null)">Cancelar</button>
        <button appButton variant="primary" [disabled]="!value().trim()" (click)="confirm()">
          {{ data().confirmLabel || 'Guardar' }}
        </button>
      </div>
    </app-modal>
  `,
  styles: [
    `
      .body {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }
      .msg {
        margin: 0;
        color: var(--text-muted);
        line-height: var(--leading-normal);
      }
    `,
  ],
})
export class PromptDialogComponent {
  data = input.required<PromptDialogData>();
  result = output<string | null>();

  value = signal('');
  private field = viewChild<ElementRef<HTMLInputElement>>('field');

  constructor() {
    queueMicrotask(() => {
      this.value.set(this.data().initialValue ?? '');
      this.field()?.nativeElement.select();
    });
  }

  confirm(): void {
    const v = this.value().trim();
    this.result.emit(v || null);
  }

  resolve(value: string | null): void {
    this.result.emit(value);
  }
}
