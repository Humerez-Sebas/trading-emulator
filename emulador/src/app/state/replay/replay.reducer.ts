import { createFeature, createReducer, on } from '@ngrx/store';
import { ReplayActions } from './replay.actions';
import { WorkspacesActions } from '../workspaces/workspaces.actions';

export interface ReplayState {
  /**
   * Timestamp (unix seconds) of the last visible candle. It is independent of
   * the timeframe: when switching TF the chart keeps showing up to this
   * instant, without revealing the future.
   */
  currentTime: number;
  playing: boolean;
  msPerCandle: number;
  jumpSize: number;
}

const initialState: ReplayState = {
  currentTime: 0,
  playing: false,
  msPerCandle: 500,
  jumpSize: 10,
};

export const replayFeature = createFeature({
  name: 'replay',
  reducer: createReducer(
    initialState,
    on(ReplayActions.goToTime, (state, { time }): ReplayState => ({ ...state, currentTime: time })),
    on(ReplayActions.play, (state): ReplayState => ({ ...state, playing: true })),
    on(ReplayActions.pause, (state): ReplayState => ({ ...state, playing: false })),
    on(ReplayActions.endOfData, (state): ReplayState => ({ ...state, playing: false })),
    on(
      ReplayActions.changeSpeed,
      (state, { msPerCandle }): ReplayState => ({ ...state, msPerCandle }),
    ),
    on(ReplayActions.setJumpSize, (state, { size }): ReplayState => ({ ...state, jumpSize: size })),
    on(ReplayActions.seekTo, (state, { time }): ReplayState => ({ ...state, currentTime: time })),
    // asset switch: restore the replay cursor of the incoming workspace
    on(
      WorkspacesActions.workspaceRestored,
      (state, { workspace }): ReplayState => ({
        ...state,
        currentTime: workspace.currentTime,
        playing: false,
      }),
    ),
  ),
});
