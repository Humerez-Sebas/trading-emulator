import { describe, expect, it } from 'vitest';
import { replayFeature } from './replay.reducer';
import { ReplayActions } from './replay.actions';
import { WorkspacesActions } from '../workspaces/workspaces.actions';
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
