import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  AfterViewInit,
  input,
  viewChild,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';

/**
 * Journal page header (design spec §1.1): title, breadcrumb back to
 * `/sesiones`, session metadata (symbol + trade date range) in
 * `--text-muted`. Pure presentation — no Store below the page (comp-arch
 * §1.1).
 *
 * Focus management (DESIGN_SYSTEM §5.3): "Page navigation sets focus to the
 * main content heading (h1)." This component owns the `h1` DOM node, so it
 * owns the focus call too — mirrors `ModalComponent.ngAfterViewInit`'s
 * `viewChild.required` + `queueMicrotask(() => target.focus())` idiom.
 */
@Component({
  selector: 'app-journal-header',
  standalone: true,
  imports: [DatePipe, RouterLink],
  templateUrl: './journal-header.component.html',
  styleUrl: './journal-header.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JournalHeaderComponent implements AfterViewInit {
  sessionName = input.required<string>();
  symbol = input.required<string>();
  /** UTC seconds; null when the session has no closed trades (no date range to show). */
  dateFrom = input<number | null>(null);
  dateTo = input<number | null>(null);

  private heading = viewChild.required<ElementRef<HTMLHeadingElement>>('heading');

  ngAfterViewInit(): void {
    const el = this.heading().nativeElement;
    queueMicrotask(() => el.focus());
  }
}
