import { Component, inject, signal } from '@angular/core';
import { Store } from '@ngrx/store';
import { PlaybookActions } from '../../state/playbook/playbook.actions';
import { PlaybookRule } from '../../state/playbook/playbook.models';
import { selectPlaybookRules } from '../../state/playbook/playbook.selectors';
import { EmptyStateComponent } from '../ui/empty-state.component';
import { ButtonDirective } from '../ui/button.directive';
import { downloadJson } from '../../services/download-json';

@Component({
  selector: 'app-playbook-panel',
  standalone: true,
  imports: [EmptyStateComponent, ButtonDirective],
  templateUrl: './playbook-panel.component.html',
  styleUrl: './playbook-panel.component.css',
})
export class PlaybookPanelComponent {
  private store = inject(Store);

  rules = this.store.selectSignal(selectPlaybookRules);

  newTitle = signal('');
  newStatement = signal('');

  editingId = signal<string | null>(null);
  editTitle = signal('');
  editStatement = signal('');

  readonly slotOptions: { value: number | null; label: string }[] = [
    { value: null, label: '—' },
    ...Array.from({ length: 9 }, (_, i) => ({ value: i + 1, label: String(i + 1) })),
  ];

  createRule(): void {
    const title = this.newTitle().trim();
    if (!title) return;
    this.store.dispatch(
      PlaybookActions.createRule({
        id: crypto.randomUUID(),
        title,
        statement: this.newStatement().trim(),
        createdAt: Date.now(),
      }),
    );
    this.newTitle.set('');
    this.newStatement.set('');
  }

  startEdit(rule: PlaybookRule): void {
    this.editingId.set(rule.id);
    this.editTitle.set(rule.title);
    this.editStatement.set(rule.statement);
  }

  cancelEdit(): void {
    this.editingId.set(null);
  }

  saveEdit(rule: PlaybookRule): void {
    const title = this.editTitle().trim();
    if (!title) return;
    const statement = this.editStatement().trim();
    if (title !== rule.title || statement !== rule.statement) {
      this.store.dispatch(
        PlaybookActions.updateRule({
          id: rule.id,
          title,
          statement,
          clientUpdatedAt: Date.now(),
        }),
      );
    }
    this.editingId.set(null);
  }

  onEditTitleInput(event: Event): void {
    this.editTitle.set((event.target as HTMLInputElement).value);
  }

  onEditStatementInput(event: Event): void {
    this.editStatement.set((event.target as HTMLTextAreaElement).value);
  }

  toggleStatus(rule: PlaybookRule): void {
    this.store.dispatch(
      PlaybookActions.setRuleStatus({
        id: rule.id,
        status: rule.status === 'active' ? 'retired' : 'active',
        clientUpdatedAt: Date.now(),
      }),
    );
  }

  assignSlot(rule: PlaybookRule, slot: number | null): void {
    this.store.dispatch(
      PlaybookActions.assignSlot({
        id: rule.id,
        slot,
        clientUpdatedAt: Date.now(),
      }),
    );
  }

  onSlotChange(rule: PlaybookRule, event: Event): void {
    const raw = (event.target as HTMLSelectElement).value;
    const slot = raw === '' ? null : Number(raw);
    this.assignSlot(rule, slot);
  }

  onTitleInput(event: Event): void {
    this.newTitle.set((event.target as HTMLInputElement).value);
  }

  onStatementInput(event: Event): void {
    this.newStatement.set((event.target as HTMLTextAreaElement).value);
  }

  exportPlaybook(): void {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const filename = `playbook-${yyyy}-${mm}-${dd}.playbook.json`;
    const payload = {
      version: 1,
      exportedAt: Date.now(),
      rules: this.rules(),
    };
    this.downloadJson(filename, payload);
  }

  downloadJson(filename: string, payload: unknown): void {
    downloadJson(filename, payload);
  }
}
