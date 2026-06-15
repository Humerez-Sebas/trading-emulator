import {
  ApplicationRef,
  createComponent,
  EmbeddedViewRef,
  EnvironmentInjector,
  Injectable,
  inject,
  Type,
} from '@angular/core';
import type { OutputEmitterRef } from '@angular/core';
import { ConfirmDialogComponent, ConfirmDialogData } from './dialogs/confirm-dialog.component';
import { PromptDialogComponent, PromptDialogData } from './dialogs/prompt-dialog.component';
import {
  DeleteSessionDialogComponent,
  DeleteSessionData,
} from './dialogs/delete-session-dialog.component';

/** A dialog component the service can mount: a `data` input + `result` output. */
interface ResultDialog<R> {
  result: OutputEmitterRef<R>;
}

/**
 * Imperative dialog host. Mounts a standalone dialog component onto
 * `document.body`, resolves a Promise with its result and tears it down.
 * Replaces every `window.confirm` / `window.prompt` call in the app with a
 * themed, focus-trapped, keyboard-accessible dialog.
 */
@Injectable({ providedIn: 'root' })
export class DialogService {
  private appRef = inject(ApplicationRef);
  private envInjector = inject(EnvironmentInjector);

  /** Confirm dialog → resolves true (confirmed) / false (cancelled). */
  confirm(data: ConfirmDialogData): Promise<boolean> {
    return this.mount(ConfirmDialogComponent, data);
  }

  /** Single-field prompt → resolves the trimmed value, or null if cancelled/empty. */
  prompt(data: PromptDialogData): Promise<string | null> {
    return this.mount(PromptDialogComponent, data);
  }

  /** Destructive session delete with a mini summary → true to delete. */
  deleteSession(data: DeleteSessionData): Promise<boolean> {
    return this.mount(DeleteSessionDialogComponent, data);
  }

  private mount<D, R>(component: Type<ResultDialog<R>>, data: D): Promise<R> {
    return new Promise<R>((resolve) => {
      const ref = createComponent(component, { environmentInjector: this.envInjector });
      ref.setInput('data', data);
      this.appRef.attachView(ref.hostView);
      const host = (ref.hostView as EmbeddedViewRef<unknown>).rootNodes[0] as HTMLElement;
      document.body.appendChild(host);

      const sub = ref.instance.result.subscribe((value: R) => {
        sub.unsubscribe();
        this.appRef.detachView(ref.hostView);
        ref.destroy();
        host.remove();
        resolve(value);
      });
    });
  }
}
