import {
  SESSION_PAYLOAD_VERSION,
  type PayloadInput,
  type SessionPayloadV1,
} from './session-sync.models';

export function toPayload(i: PayloadInput): SessionPayloadV1 {
  return {
    schemaVersion: SESSION_PAYLOAD_VERSION,
    trading: i.trading,
    currentTime: i.currentTime,
    activeTf: i.activeTf,
    customTfMinutes: i.customTfMinutes,
    playbackSpeed: i.playbackSpeed,
    drawings: i.drawings,
    notes: i.notes,
    selectedTfs: i.selectedTfs,
    startRange: i.startRange,
    endRange: i.endRange,
    requiredDatasets: i.requiredDatasets,
  };
}

export function fromPayload(p: SessionPayloadV1) {
  return {
    trading: p.trading,
    cursor: p.currentTime,
    activeTf: p.activeTf,
    customTfMinutes: p.customTfMinutes,
    playbackSpeed: p.playbackSpeed,
    drawings: p.drawings,
    notes: p.notes,
    selectedTfs: p.selectedTfs,
    startRange: p.startRange,
    endRange: p.endRange,
    requiredDatasets: p.requiredDatasets,
  };
}
