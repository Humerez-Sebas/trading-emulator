import { describe, expect, it } from 'vitest';
import { replayFeature } from './replay.reducer';
import { ReplayActions } from './replay.actions';
import { WorkspacesActions } from '../workspaces/workspaces.actions';
import { MarketActions } from '../market/market.actions';
import { workspace } from '../../testing/fixtures';

const reducer = replayFeature.reducer;

function initial() {
  return reducer(undefined, { type: '@@init' } as any);
}

describe('replay reducer: goToTime', () => {
  it('sets currentTime', () => {
    const next = reducer(initial(), ReplayActions.goToTime({ time: 3600 }));
    expect(next.currentTime).toBe(3600);
  });
});

describe('replay reducer: play / pause / endOfData', () => {
  it('play sets playing to true', () => {
    const next = reducer(initial(), ReplayActions.play());
    expect(next.playing).toBe(true);
  });

  it('pause sets playing to false', () => {
    const playing = { ...initial(), playing: true };
    const next = reducer(playing, ReplayActions.pause());
    expect(next.playing).toBe(false);
  });

  it('endOfData sets playing to false', () => {
    const playing = { ...initial(), playing: true };
    const next = reducer(playing, ReplayActions.endOfData());
    expect(next.playing).toBe(false);
  });
});

describe('replay reducer: changeSpeed', () => {
  it('sets msPerCandle', () => {
    const next = reducer(initial(), ReplayActions.changeSpeed({ msPerCandle: 250 }));
    expect(next.msPerCandle).toBe(250);
  });
});

describe('replay reducer: workspaceRestored', () => {
  it('sets currentTime from the workspace and forces playing:false', () => {
    const ws = workspace({ currentTime: 7200 });
    const playing = { ...initial(), playing: true };
    const next = reducer(playing, WorkspacesActions.workspaceRestored({ workspace: ws }));
    expect(next.currentTime).toBe(7200);
    expect(next.playing).toBe(false);
  });
});

describe('replay reducer — navegación', () => {
  const init = initial();

  it('jumpSize por defecto es 10', () => {
    expect(init.jumpSize).toBe(10);
  });

  it('setJumpSize actualiza jumpSize', () => {
    const next = reducer(init, ReplayActions.setJumpSize({ size: 50 }));
    expect(next.jumpSize).toBe(50);
  });

  it('seekTo mueve el cursor sin tocar playing', () => {
    const playing = reducer(init, ReplayActions.play());
    const next = reducer(playing, ReplayActions.seekTo({ time: 12345 }));
    expect(next.currentTime).toBe(12345);
    expect(next.playing).toBe(true);
  });
});

describe('replay reducer — resolution', () => {
  const init = reducer(undefined, { type: '@@init' } as any);

  it('resolutionMinutes por defecto es null', () => {
    expect(init.resolutionMinutes).toBeNull();
  });

  it('setReplayResolution fija los minutos', () => {
    const next = reducer(init, ReplayActions.setReplayResolution({ minutes: 5 }));
    expect(next.resolutionMinutes).toBe(5);
  });

  it('changeTimeframe a un TF incompatible resetea la resolución', () => {
    const m30 = reducer(init, ReplayActions.setReplayResolution({ minutes: 30 }));
    const toM15 = reducer(m30, MarketActions.changeTimeframe({ tf: 'M15' })); // 1800 ∤ 900
    expect(toM15.resolutionMinutes).toBeNull();
  });

  it('changeTimeframe a un TF compatible conserva la resolución', () => {
    const m30 = reducer(init, ReplayActions.setReplayResolution({ minutes: 30 }));
    const toH1 = reducer(m30, MarketActions.changeTimeframe({ tf: 'H1' })); // 1800 | 3600
    expect(toH1.resolutionMinutes).toBe(30);
  });
});
