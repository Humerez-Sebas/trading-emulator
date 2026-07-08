# Domain: Replay Clock, Fills & Trading

Why the replay system is shaped the way it is. Relevant history: playback controller
spec/plans (`docs/superpowers/*2026-06-28*`), RFC-010 fan-out.

## The clock

- There is exactly ONE replay cursor: `replay.currentTime` — a global timestamp,
  independent of any timeframe or panel. Everything else *projects* from it: each
  panel/timeframe finds its candle via at-or-before-T binary search
  (`selectReplayIndex`). This is what made multi-panel replay (RFC-010) a fan-out
  problem instead of a rewrite.
- Navigation semantics (frozen with the user): ±1 step with auto-repeat; jump ±N
  (5/10/50); **scrubber `seekTo` is teleportation — it does NOT simulate fills** for the
  skipped range. Jumps (`jumpForward`/`jumpBack`) DO process fills for every crossed
  candle and clamp to data/session end.

## Replay Resolution (Phase 2 concept)

Generalizes "sub-timeframe stepping": the displayed TF stays fixed while the user picks
the advance grain (any standard divisor with data: H1→M1, M15→M5). The displayed candle
forms progressively; progress reads as a time range (`09:37 / 10:00`).

**The realism invariant: fills, SL and TP always evaluate at the BASE resolution**, not
the displayed TF — otherwise an intra-candle spike that would have stopped you out gets
averaged away. Default is full-candle stepping; an incompatible TF change resets
resolution; resolution persists in the session payload as an optional,
backward-compatible field.

## Fill engine

Pure core (`state/trading/fill-engine.ts`: `processCandle`/`sliceRange`) — hard-TDD
territory. Effects around it stay thin. Replay-aware selectors
(`selectReplaySeries`/`selectReplayIndex`) were designed so `selectFillContext` could be
redefined on top of them WITHOUT rewriting `processFills$` — extending selectors beats
rewriting effects.

## Timeframe machinery worth reusing (don't rebuild these)

- `state/market/custom-timeframe.ts` — `generateCustomSeries`/`pickBaseSeriesTf`
  (custom TFs derive from the best available base series).
- `services/timeframe-generator.ts` — `aggregateCandles`.
- `selectSessionTfs` — the selector for "timeframes that actually have data"; UI
  timeframe lists must use it, never a static order list.

## Trading state

- Trading data (positions/orders/fills/balance) exists ONLY for the session's
  `primarySymbol` (D1). View-only panels never touch trading state.
- `activeSessionId` is a first-class `TradingState` field. This was a hard-won fix:
  archiving used to mint a new id, which duplicated/lost sessions after archive→pull in
  cloud sync. Session identity must be stable across archive cycles.

## UI split (frozen with the user)

Top bar = context only (symbol, TF). The floating Playback HUD owns ALL backtesting
navigation; floating P/L is a chart overlay. Session metrics UX follows PRODUCT.md
("focused terminal", anti-MetaTrader).
