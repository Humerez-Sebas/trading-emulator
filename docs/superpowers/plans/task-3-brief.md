### Task 3: Fix Archived Session Restore 

**Files:**
- Modify: `emulador/src/app/pages/sesiones/sesiones-page.component.ts`

**Context:**
`dispatchOpen(card)` uses `WorkspacesActions.switchAsset` but fails to provide `thenLoad` (candles) and `selectedTfs`, causing the Emulator to open empty.

- [ ] **Step 1: Inject dependencies and fix dispatchOpen**

```typescript
// In sesiones-page.component.ts
// Find dispatchOpen(card: SessionCard) and rewrite:

  private async dispatchOpen(card: SessionCard): Promise<void> {
    if (card.symbol === this.currentAsset()) {
      if (card.id !== null) {
        this.store.dispatch(
          TradingActions.switchSession({ id: card.id, currentCursor: this.currentTime() }),
        );
        if (card.cursor > 0) {
          this.store.dispatch(ReplayActions.goToTime({ time: card.cursor }));
        }
      }
    } else {
      // NEW LOGIC: Fetch target workspace meta to get selectedTfs
      const meta = this.metas().find(m => m.symbol === card.symbol);
      const tfs = (meta?.selectedTfs?.length ? meta.selectedTfs : ['M1', 'H1', 'D1']) as Timeframe[];
      
      const pending: PendingCsv[] = [];
      for (const tf of tfs) {
        const candles = await this.repo.getCandles(card.symbol, tf);
        pending.push({
          tf,
          candles,
          fileName: `${card.symbol.toLowerCase()}_${tf.toLowerCase()}.csv`
        });
      }

      this.store.dispatch(
        WorkspacesActions.switchAsset({
          symbol: card.symbol,
          selectedTfs: tfs,
          thenLoad: pending,
          thenOpenSession: card.id ?? undefined,
        }),
      );
    }
    void this.router.navigateByUrl('/');
  }
```

- [ ] **Step 2: Manual Verification**
Since this is an Angular component without a direct mock test in the provided plan, just implement it precisely as outlined. Ensure no syntax errors are introduced. Ensure `PendingCsv` and `Timeframe` imports are present if they are not already.

- [ ] **Step 3: Commit**

```bash
git add src/app/pages/sesiones/sesiones-page.component.ts
git commit -m "fix(sessions): load required candles into memory before switching asset"
```
