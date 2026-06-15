import { createActionGroup, emptyProps, props } from '@ngrx/store';
import { Candle } from '../../models';
import { ClosedTrade, OrderSide, PendingType } from './trading.models';

export const TradingActions = createActionGroup({
  source: 'Trading',
  events: {
    /** Opens a position immediately at the current price (clean fill). */
    'Open Market': props<{
      side: OrderSide;
      price: number;
      sl: number;
      tp: number | null;
      riskPct: number;
      time: number;
      contractSize: number;
    }>(),
    /** Places a limit/stop order to be filled by the engine. */
    'Place Order': props<{
      side: OrderSide;
      /** Named orderType because `type` is the NgRx action discriminator. */
      orderType: PendingType;
      entryPrice: number;
      sl: number;
      tp: number | null;
      riskPct: number;
      time: number;
      contractSize: number;
    }>(),
    /** Updates SL/TP of an open position (e.g. dragging its price line). */
    'Modify Position': props<{ id: string; sl?: number; tp?: number | null }>(),
    /**
     * Updates entry/SL/TP of a pending order. Changing entry or SL re-sizes
     * the lots to keep the order's risk % constant (the order has not been
     * filled yet, so re-sizing does not alter any taken risk).
     */
    'Modify Order': props<{
      id: string;
      entryPrice?: number;
      sl?: number;
      tp?: number | null;
      contractSize: number;
    }>(),
    'Cancel Order': props<{ id: string }>(),
    /** Shows/hides the historical trade box of a closed trade. */
    'Set Trade Box Hidden': props<{ id: string; hidden: boolean }>(),
    /** Removes the historical trade box of a closed trade (irreversible). */
    'Delete Trade Box': props<{ id: string }>(),
    /** Closes an open position manually at the current price. */
    'Close Position': props<{ id: string; price: number; time: number; contractSize: number }>(),
    /** A new candle of the active TF was revealed: run the fill engine. */
    'Process Candle': props<{
      candle: Candle;
      subCandles: Candle[] | null;
      contractSize: number;
    }>(),
    /** Ends the session: closes everything at the last visible price. */
    'End Session': props<{ price: number; time: number; contractSize: number }>(),
    'Set Initial Balance': props<{ balance: number }>(),
    /** Default risk % per trade (panel + chart context menu). */
    'Set Risk Pct': props<{ riskPct: number }>(),
    /** Schedules (or clears) the automatic session end time. */
    'Set Session End': props<{ time: number | null }>(),
    'Open Summary': emptyProps(),
    'Close Summary': emptyProps(),
    /**
     * Archives the active session (if it has any activity) and starts a
     * fresh one. `currentCursor` = replay position to store with it.
     */
    'New Session': props<{ currentCursor: number }>(),
    /** Names the ACTIVE session (kept when it gets archived). */
    'Set Session Name': props<{ name: string | null }>(),
    /** Archives the active session and restores a saved one. */
    'Switch Session': props<{ id: string; currentCursor: number }>(),
    'Delete Session': props<{ id: string }>(),
    /** Renames an ARCHIVED session (the active one uses Set Session Name). */
    'Rename Session': props<{ id: string; name: string }>(),
    /** Assigns a session to a folder (id null = the active session). */
    'Set Session Folder': props<{ id: string | null; folderId: string | null }>(),
    /**
     * Loads a session exported as CSV: archives the active session (if it
     * has activity) and shows the imported trades as an ended session.
     */
    'Session Imported': props<{ trades: ClosedTrade[]; currentCursor: number }>(),
  },
});
