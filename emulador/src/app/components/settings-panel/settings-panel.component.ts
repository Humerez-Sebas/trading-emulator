import { Component, inject } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { Store } from '@ngrx/store';
import { DropdownComponent, DropdownOption } from '../ui/dropdown.component';
import { ColorFieldComponent } from '../ui/color-field.component';
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

@Component({
  selector: 'app-settings-panel',
  standalone: true,
  imports: [AsyncPipe, DropdownComponent, ColorFieldComponent],
  templateUrl: './settings-panel.component.html',
  styleUrl: './settings-panel.component.css',
})
export class SettingsPanelComponent {
  private store = inject(Store);

  theme$ = this.store.select(selectTheme);
  colors$ = this.store.select(selectChartColors);
  utcOffset$ = this.store.select(selectUtcOffset);
  gridVisible = this.store.selectSignal(selectGridVisible);
  gridOpacity = this.store.selectSignal(selectGridOpacity);
  floatingToolbar = this.store.selectSignal(selectFloatingToolbar);
  boxOpacity = this.store.selectSignal(selectTradeBoxOpacity);

  readonly presets = CHART_PRESETS;
  readonly utcOffsets = UTC_OFFSETS;
  readonly utcOptions: DropdownOption[] = UTC_OFFSETS.map((o) => ({
    value: String(o.value),
    label: o.label,
  }));

  readonly colorFields: { key: keyof ChartColors; label: string }[] = [
    { key: 'upColor', label: 'Vela alcista' },
    { key: 'downColor', label: 'Vela bajista' },
    { key: 'wickUp', label: 'Mecha alcista' },
    { key: 'wickDown', label: 'Mecha bajista' },
    { key: 'background', label: 'Fondo' },
    { key: 'grid', label: 'Cuadrícula' },
    { key: 'text', label: 'Texto de escalas' },
    { key: 'tpZone', label: 'Zona TP' },
    { key: 'slZone', label: 'Zona SL' },
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

  toggleGrid(event: Event): void {
    const visible = (event.target as HTMLInputElement).checked;
    this.store.dispatch(SettingsActions.changeGrid({ visible }));
  }

  onGridOpacity(event: Event): void {
    const opacity = +(event.target as HTMLInputElement).value / 100;
    this.store.dispatch(SettingsActions.changeGrid({ opacity }));
  }

  toggleFloatingToolbar(event: Event): void {
    const visible = (event.target as HTMLInputElement).checked;
    this.store.dispatch(SettingsActions.toggleFloatingToolbar({ visible }));
  }

  onBoxFill(event: Event): void {
    const fill = +(event.target as HTMLInputElement).value / 100;
    this.store.dispatch(SettingsActions.changeTradeBoxOpacity({ fill }));
  }

  onBoxBorder(event: Event): void {
    const border = +(event.target as HTMLInputElement).value / 100;
    this.store.dispatch(SettingsActions.changeTradeBoxOpacity({ border }));
  }
}
