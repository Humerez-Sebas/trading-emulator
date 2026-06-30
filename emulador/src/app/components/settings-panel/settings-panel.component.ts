import { Component, inject, signal } from '@angular/core';
import { Store } from '@ngrx/store';
import { DropdownComponent, DropdownOption } from '../ui/dropdown.component';
import { SettingsActions } from '../../state/settings/settings.actions';
import {
  CHART_PRESETS,
  ChartColors,
  ChartPreset,
  Theme,
  UTC_OFFSETS,
} from '../../state/settings/settings.models';
import {
  selectChartColors,
  selectFloatingToolbar,
  selectGridOpacity,
  selectGridVisible,
  selectTheme,
  selectTradeBoxOpacity,
  selectUtcOffset,
} from '../../state/selectors';
import { CustomSwitchComponent } from '../custom-switch.component';
import { CustomOpacitySliderComponent } from '../custom-opacity-slider.component';
import { InteractiveCandlesComponent, ColorPartEditEvent } from '../interactive-candles.component';
import { CustomColorPickerComponent } from '../custom-color-picker.component';

@Component({
  selector: 'app-settings-panel',
  standalone: true,
  imports: [
    DropdownComponent,
    CustomSwitchComponent,
    CustomOpacitySliderComponent,
    InteractiveCandlesComponent,
    CustomColorPickerComponent,
  ],
  templateUrl: './settings-panel.component.html',
  styleUrl: './settings-panel.component.css',
})
export class SettingsPanelComponent {
  private store = inject(Store);

  theme = this.store.selectSignal(selectTheme);
  colors = this.store.selectSignal(selectChartColors);
  utcOffset = this.store.selectSignal(selectUtcOffset);
  gridVisible = this.store.selectSignal(selectGridVisible);
  gridOpacity = this.store.selectSignal(selectGridOpacity);
  floatingToolbar = this.store.selectSignal(selectFloatingToolbar);
  boxOpacity = this.store.selectSignal(selectTradeBoxOpacity);

  activePicker = signal<{
    key: keyof ChartColors;
    label: string;
    y: number;
  } | null>(null);

  readonly presets = CHART_PRESETS;
  readonly utcOffsets = UTC_OFFSETS;
  readonly utcOptions: DropdownOption[] = UTC_OFFSETS.map((o) => ({
    value: String(o.value),
    label: o.label,
  }));

  readonly colorFields: { key: keyof ChartColors; label: string }[] = [
    { key: 'background', label: 'Color del Fondo' },
    { key: 'text', label: 'Texto de Escalas' },
    { key: 'grid', label: 'Color de Cuadrícula' },
    { key: 'tpZone', label: 'Color de Zona TP' },
    { key: 'slZone', label: 'Color de Zona SL' },
  ];

  setTheme(theme: Theme): void {
    this.store.dispatch(SettingsActions.changeTheme({ theme }));
  }

  onColor(key: keyof ChartColors, value: string): void {
    this.store.dispatch(SettingsActions.changeChartColors({ colors: { [key]: value } }));
  }

  applyPreset(preset: ChartPreset): void {
    this.store.dispatch(SettingsActions.changeChartColors({ colors: preset.colors }));
  }

  restore(): void {
    this.store.dispatch(SettingsActions.restoreColors());
  }

  onOffset(value: string): void {
    this.store.dispatch(SettingsActions.changeUtcOffset({ utcOffset: +value }));
  }

  toggleGrid(visible: boolean): void {
    this.store.dispatch(SettingsActions.changeGrid({ visible }));
  }

  onGridOpacity(opacity: number): void {
    this.store.dispatch(SettingsActions.changeGrid({ opacity: opacity / 100 }));
  }

  toggleFloatingToolbar(visible: boolean): void {
    this.store.dispatch(SettingsActions.toggleFloatingToolbar({ visible }));
  }

  onBoxFill(fill: number): void {
    this.store.dispatch(SettingsActions.changeTradeBoxOpacity({ fill: fill / 100 }));
  }

  onBoxBorder(border: number): void {
    this.store.dispatch(SettingsActions.changeTradeBoxOpacity({ border: border / 100 }));
  }

  onEditPart(event: ColorPartEditEvent): void {
    this.openColorPicker(event.key as keyof ChartColors, event.label, { target: event.element });
  }

  openColorPicker(
    key: keyof ChartColors,
    label: string,
    event: MouseEvent | { target: EventTarget | null },
  ): void {
    const target = event.target as HTMLElement;
    if (!target) return;

    const container =
      document.getElementById('settings-scroll-container') || document.querySelector('.panel');
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();

    // Calculate absolute position inside scroll area
    const relativeTop = targetRect.top - containerRect.top + container.scrollTop;

    // Check height in current view to position popover either above or below the element
    const containerHeight = container.clientHeight;
    const relativeTopInViewport = targetRect.top - containerRect.top;

    let y = relativeTop + 25; // default below
    if (relativeTopInViewport > containerHeight / 2) {
      y = relativeTop - 225; // float above if in the lower half of screen
    }

    this.activePicker.set({
      key,
      label,
      y,
    });
  }

  closeColorPicker(): void {
    this.activePicker.set(null);
  }
}
