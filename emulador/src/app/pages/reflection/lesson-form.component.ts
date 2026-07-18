import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
  type WritableSignal,
} from '@angular/core';
import type { Lesson } from '../../state/lessons/lessons.models';
import type { PlaybookRule } from '../../state/playbook/playbook.models';
import { ButtonDirective } from '../../components/ui/button.directive';
import { InputDirective } from '../../components/ui/input.directive';
import { BadgeDirective } from '../../components/ui/badge.directive';
import { TooltipDirective } from '../../components/ui/tooltip.directive';

/** The trader-authored draft this component emits on save — the PAGE mints
 * id/authoredAt/clientUpdatedAt and merges evidence/tradeRefs/sessionRef
 * (purity: `Date.now()`/`crypto.randomUUID()` ONLY in the page component). */
export interface LessonDraft {
  whatHappened: string;
  repeat: string;
  avoid: string;
  linkedRuleIds: string[];
}

/**
 * Reflection form — the pluma (design spec §2.5, D16.G). Real `<form
 * (submit)>` (native DOM event, no `FormsModule`/`NgForm` needed — this form
 * has no `ngModel`/`formGroup`) with the save button as `type="submit"`:
 * this gives "Enter (en el formulario) guarda" for free via native HTML form
 * semantics — Enter on the submit button submits, Enter on a
 * `type="button"` rule chip does NOT (native), Enter inside a `<textarea>`
 * is always a newline (native) — matching design spec §2.6's "con foco
 * DENTRO de un textarea, solo Escape y Tab tienen semántica de superficie"
 * without any bespoke JS in the page's global keydown handler.
 */
@Component({
  selector: 'app-lesson-form',
  standalone: true,
  imports: [ButtonDirective, InputDirective, BadgeDirective, TooltipDirective],
  host: { class: 'lesson-form' },
  template: `
    <form (submit)="onSubmit($event)">
      <label class="field">
        <span class="field-label">¿Qué ocurrió?</span>
        <textarea
          appInput
          rows="3"
          [value]="whatHappened()"
          (input)="onInput($event, whatHappened)"
        ></textarea>
      </label>
      <label class="field">
        <span class="field-label">¿Qué debería repetir?</span>
        <textarea appInput rows="3" [value]="repeat()" (input)="onInput($event, repeat)"></textarea>
      </label>
      <label class="field">
        <span class="field-label">¿Qué debería evitar?</span>
        <textarea appInput rows="3" [value]="avoid()" (input)="onInput($event, avoid)"></textarea>
      </label>

      @if (activeRules().length) {
        <div class="rule-chips" role="group" aria-label="Reglas del Playbook vinculadas">
          @for (rule of activeRules(); track rule.id) {
            <button
              type="button"
              appBadge
              [chip]="true"
              [tone]="isSelected(rule.id) ? 'accent' : 'neutral'"
              [appTooltip]="rule.statement"
              (click)="toggleRule(rule.id)"
            >
              {{ rule.title }}
              @if (rule.shortcutSlot !== null) {
                <span class="slot">R{{ rule.shortcutSlot }}</span>
              }
            </button>
          }
        </div>
      }

      <button type="submit" appButton variant="primary" [disabled]="saveDisabled() || saving()">
        {{
          saving()
            ? 'Guardando…'
            : existing()
              ? 'Actualizar y volver al Journal'
              : 'Guardar y volver al Journal'
        }}
      </button>
    </form>
  `,
  styles: `
    :host {
      display: block;
    }
    form {
      display: flex;
      flex-direction: column;
      gap: var(--density-gap);
    }
    .field {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
    }
    .field-label {
      font-size: var(--density-font);
      font-weight: var(--weight-medium);
      color: var(--text);
    }
    textarea {
      width: 100%;
      resize: vertical;
      font-family: inherit;
    }
    .rule-chips {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }
    .slot {
      margin-inline-start: var(--space-1);
      opacity: 0.8;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LessonFormComponent {
  existing = input<Lesson | null>(null);
  activeRules = input<PlaybookRule[]>([]);
  saving = input(false);

  save = output<LessonDraft>();

  whatHappened = signal('');
  repeat = signal('');
  avoid = signal('');
  private selectedRuleIds = signal<Set<string>>(new Set());

  saveDisabled = computed(
    () =>
      !this.whatHappened().trim() &&
      !this.repeat().trim() &&
      !this.avoid().trim() &&
      this.selectedRuleIds().size === 0,
  );

  constructor() {
    // Resets the draft whenever `existing` changes reference (switching trades,
    // or the active trade's lesson just got created/updated) — design spec
    // §2.5's "reflection-existing: pre-filled fields" prefill lives here.
    effect(() => {
      const ex = this.existing();
      this.whatHappened.set(ex?.whatHappened ?? '');
      this.repeat.set(ex?.repeat ?? '');
      this.avoid.set(ex?.avoid ?? '');
      this.selectedRuleIds.set(new Set(ex?.linkedRuleIds ?? []));
    });
  }

  isSelected(ruleId: string): boolean {
    return this.selectedRuleIds().has(ruleId);
  }

  toggleRule(ruleId: string): void {
    const next = new Set(this.selectedRuleIds());
    if (next.has(ruleId)) next.delete(ruleId);
    else next.add(ruleId);
    this.selectedRuleIds.set(next);
  }

  onInput(event: Event, target: WritableSignal<string>): void {
    target.set((event.target as HTMLTextAreaElement).value);
  }

  onSubmit(event: Event): void {
    event.preventDefault();
    if (this.saveDisabled() || this.saving()) return;
    this.save.emit({
      whatHappened: this.whatHappened(),
      repeat: this.repeat(),
      avoid: this.avoid(),
      linkedRuleIds: [...this.selectedRuleIds()],
    });
  }
}
