import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { CabinBreadcrumbComponent } from './cabin-breadcrumb.component';

describe('CabinBreadcrumbComponent', () => {
  function mount(index: number, total: number) {
    TestBed.configureTestingModule({ imports: [CabinBreadcrumbComponent] });
    const fixture = TestBed.createComponent(CabinBreadcrumbComponent);
    fixture.componentRef.setInput('index', index);
    fixture.componentRef.setInput('total', total);
    fixture.detectChanges();
    return fixture;
  }

  it('renders "Trade #N de M"', () => {
    const fixture = mount(2, 5);
    const text = fixture.nativeElement.querySelector('.trade-count').textContent;
    expect(text).toContain('Trade #2 de 5');
  });

  it('emits back on the "← Journal" click', () => {
    const fixture = mount(1, 3);
    let backEmitted = false;
    fixture.componentInstance.back.subscribe(() => (backEmitted = true));
    const buttons: HTMLButtonElement[] = fixture.nativeElement.querySelectorAll('button');
    buttons[0].click();
    expect(backEmitted).toBe(true);
  });

  it('emits prev/next on arrow clicks', () => {
    const fixture = mount(2, 3);
    let prevEmitted = false;
    let nextEmitted = false;
    fixture.componentInstance.prev.subscribe(() => (prevEmitted = true));
    fixture.componentInstance.next.subscribe(() => (nextEmitted = true));
    const buttons: HTMLButtonElement[] = fixture.nativeElement.querySelectorAll('button');
    buttons[1].click(); // prev arrow
    buttons[2].click(); // next arrow
    expect(prevEmitted).toBe(true);
    expect(nextEmitted).toBe(true);
  });

  it('disables the prev arrow at index=1 (no wrap) and the next arrow at index=total', () => {
    const fixture = mount(1, 1);
    const buttons: HTMLButtonElement[] = fixture.nativeElement.querySelectorAll('button');
    expect(buttons[1].disabled).toBe(true); // prev
    expect(buttons[2].disabled).toBe(true); // next
  });

  it('enables both arrows in the middle of the list', () => {
    const fixture = mount(2, 3);
    const buttons: HTMLButtonElement[] = fixture.nativeElement.querySelectorAll('button');
    expect(buttons[1].disabled).toBe(false);
    expect(buttons[2].disabled).toBe(false);
  });
});
