import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Store } from '@ngrx/store';
import { selectAssets } from '../../state/selectors';
import { contractSizeFor, lotsForRisk } from '../../state/trading/trading.models';
import {
  pipSizeFor,
  priceDistance,
  riskForLots,
  riskUsdFor,
} from '../../domain/risk/risk-calculator';
import { InputDirective } from '../../components/ui/input.directive';
import { BadgeDirective } from '../../components/ui/badge.directive';
import { DropdownComponent, DropdownOption } from '../../components/ui/dropdown.component';
import { RiskSliderComponent } from '../../components/risk-slider.component';

/**
 * Sizes a CFD/Forex position EXACTLY like the emulator, without a session or
 * downloaded data. This page is the composition point: `domain/risk/risk-calculator.ts`
 * stays parameterized and pure (no `state/` import — Dependency Rule), so THIS
 * page is what imports `contractSizeFor`/`lotsForRisk` from `state/trading/trading.models`
 * and wires them to the four pure functions. `lotsForRisk` is the ONLY source
 * of a lot figure anywhere in this file/template — no local sizing formula.
 *
 * Three honest states replace the lot figure (never sit beside it): SL = entry,
 * non-positive balance/risk/entry, each with its own message. A fourth state —
 * the 0.01-lot floor — is a WARNING shown alongside a real lot figure (not a
 * replacement): `lotsForRisk` never returns below its 0.01-lot minimum, so on
 * small accounts or wide stops the real risk silently exceeds the requested one.
 *
 * Read-only NgRx: only `selectAssets`, to populate the asset dropdown. No
 * `dispatch`, no effects, no subscriptions — everything else is `computed`
 * over local input signals.
 */
@Component({
  selector: 'app-calculadora-page',
  standalone: true,
  imports: [DecimalPipe, InputDirective, BadgeDirective, DropdownComponent, RiskSliderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './calculadora-page.component.html',
  styleUrl: './calculadora-page.component.css',
})
export class CalculadoraPageComponent {
  private store = inject(Store);

  private assets = this.store.selectSignal(selectAssets);
  assetOptions = computed<DropdownOption[]>(() =>
    this.assets().map((a) => ({ value: a.symbol, label: a.symbol })),
  );

  // ---- inputs (prefilled with the owner's acceptance case) ----
  balance = signal(5000);
  riskPct = signal(1);
  symbol = signal('US30');
  entry = signal(40000);
  sl = signal(39950);
  manualLots = signal(1);

  // ---- composition: contractSizeFor/lotsForRisk (state) + risk-calculator (domain) ----
  contractSize = computed(() => contractSizeFor(this.symbol()));
  distance = computed(() => priceDistance(this.entry(), this.sl()));
  requestedRisk = computed(() => riskUsdFor(this.balance(), this.riskPct()));
  /** The only source of a lot figure in this page. */
  lots = computed(() =>
    lotsForRisk(this.balance(), this.riskPct(), this.entry(), this.sl(), this.contractSize()),
  );
  actualRisk = computed(() =>
    riskForLots(this.lots(), this.entry(), this.sl(), this.contractSize()),
  );

  pipSize = computed(() => pipSizeFor(this.symbol()));
  /** Pips when the symbol has a pip size, points (raw price units) otherwise. */
  distanceLabel = computed(() => (this.pipSize() !== null ? 'pips' : 'puntos'));
  distanceValue = computed(() => {
    const pip = this.pipSize();
    const raw = this.distance();
    return pip !== null ? raw / pip : raw;
  });

  /**
   * `contractSize × pipSize` (L2): the $/pip value every forex trader
   * already knows (EURUSD → 10), instead of the raw $/point figure which
   * reads a hundredfold too large for a pip distance. `null` when the
   * symbol has no pip size (index CFDs, metals) — those already read
   * correctly in raw $/point terms. Purely relabels `contractSize` for
   * display; never touches `lots`, not a sizing formula.
   */
  contractPerPip = computed(() => {
    const pip = this.pipSize();
    return pip !== null ? this.contractSize() * pip : null;
  });

  /**
   * Honest states 1 & 2 (spec §3.1): SL = entry, or balance/risk/entry
   * non-positive. Checked in `lotsForRisk`'s own evaluation order (distance
   * first) so the two mirror each other. `null` = a real lot figure exists.
   */
  invalidReason = computed<string | null>(() => {
    if (this.distance() === 0) return 'El SL coincide con la entrada.';
    if (!(this.balance() > 0) || !(this.riskPct() > 0) || !(this.entry() > 0)) {
      return 'La cuenta, el riesgo y la entrada deben ser valores positivos.';
    }
    return null;
  });

  /**
   * Honest state 3: the 0.01-lot floor OR plain rounding to the 0.01 broker
   * step (spec §3.1: «el mismo mecanismo cubre el redondeo a 0.01 hacia
   * abajo»). Only meaningful when a real lot figure exists
   * (`invalidReason() === null`) — it is a warning ALONGSIDE the lot figure,
   * never a replacement. Material difference: requested risk > 0 and the
   * real risk differs from it by more than 1%.
   *
   * The message must be honest about BOTH cause and direction — using only
   * values already computed above, never a "raw lots before rounding"
   * figure (that would be a second sizing formula, which is prohibited).
   * `lots() === 0.01 && actual > requested` is the floor signature: the
   * `lotsForRisk` minimum only ever pushes the real risk UP past the
   * requested one. `lots() === 0.01` on its own is not enough — the natural
   * rounded size can also land on exactly 0.01 — so the direction check
   * disambiguates. Any other case is plain rounding to the 0.01 step, which
   * moves the risk in either direction.
   */
  minLotWarning = computed<string | null>(() => {
    if (this.invalidReason() !== null) return null;
    const requested = this.requestedRisk();
    if (!(requested > 0)) return null;
    const actual = this.actualRisk();
    const diff = Math.abs(actual - requested) / requested;
    if (!(diff > 0.01)) return null;
    const atFloor = this.lots() === 0.01 && actual > requested;
    const cause = atFloor ? 'El mínimo de 0.01 lotes' : 'El redondeo al paso de 0.01 lotes';
    const direction = actual > requested ? 'por encima de' : 'por debajo de';
    return `${cause} arriesga $${actual.toFixed(2)}, ${direction} los $${requested.toFixed(2)} solicitados.`;
  });

  // ---- inverse block: given manual lots, the USD risk and % of account ----
  /**
   * `null` (L1) when distance is 0 (SL = entry) — the same degenerate setup
   * that earns its own message in «Dimensionado», not a fabricated $0.00
   * that reads as a valid zero-risk result. A genuine zero (e.g. 0 manual
   * lots) is not degenerate and still renders as 0.
   */
  manualRiskUsd = computed<number | null>(() => {
    if (this.distance() === 0) return null;
    return riskForLots(this.manualLots(), this.entry(), this.sl(), this.contractSize());
  });
  /**
   * `null` (L1) whenever the ratio is undefined: balance <= 0 (division by
   * a non-positive quantity — previously hardcoded to a fabricated 0), or
   * the USD numerator itself is undefined (distance 0). Never a fabricated
   * 0.00 % standing in for "undefined".
   */
  manualRiskPct = computed<number | null>(() => {
    const balance = this.balance();
    const usd = this.manualRiskUsd();
    if (!(balance > 0) || usd === null) return null;
    return (usd / balance) * 100;
  });

  onBalance(event: Event): void {
    this.balance.set(Number((event.target as HTMLInputElement).value));
  }
  onRiskPct(event: Event): void {
    this.riskPct.set(Number((event.target as HTMLInputElement).value));
  }
  onRiskSlider(value: number): void {
    this.riskPct.set(value);
  }
  onSymbol(event: Event): void {
    this.symbol.set((event.target as HTMLInputElement).value);
  }
  onAssetPick(symbol: string): void {
    this.symbol.set(symbol);
  }
  onEntry(event: Event): void {
    this.entry.set(Number((event.target as HTMLInputElement).value));
  }
  onSl(event: Event): void {
    this.sl.set(Number((event.target as HTMLInputElement).value));
  }
  onManualLots(event: Event): void {
    this.manualLots.set(Number((event.target as HTMLInputElement).value));
  }
}
