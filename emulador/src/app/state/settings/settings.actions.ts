import { createActionGroup, emptyProps, props } from '@ngrx/store';
import { ChartColors, SidePanelTab, Theme } from './settings.models';

export const SettingsActions = createActionGroup({
  source: 'Settings',
  events: {
    'Change Theme': props<{ theme: Theme }>(),
    'Change Chart Colors': props<{ colors: Partial<ChartColors> }>(),
    'Restore Colors': emptyProps(),
    'Change Utc Offset': props<{ utcOffset: number }>(),
    'Change Grid': props<{ visible?: boolean; opacity?: number }>(),
    'Toggle Floating Toolbar': props<{ visible: boolean }>(),
    /** Toolbar eye: shows/hides ALL trade boxes at once. */
    'Set Trade Boxes Visible': props<{ visible: boolean }>(),
    /** Adjusts the fill/border opacity of the trade boxes. */
    'Change Trade Box Opacity': props<{ fill?: number; border?: number }>(),
    /** Rail click: opens the tab, or collapses the dock if already active. */
    'Set Side Panel Tab': props<{ tab: SidePanelTab }>(),
  },
});
