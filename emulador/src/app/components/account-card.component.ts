import { Component, ChangeDetectionStrategy, input, computed } from '@angular/core';
import { DecimalPipe } from '@angular/common';

@Component({
  selector: 'app-account-card',
  standalone: true,
  imports: [DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="card">
      <!-- Subtle background glow based on account PnL -->
      <div
        class="glow"
        [class.neutral]="!hasActivePositions()"
        [class.up]="hasActivePositions() && equity() >= balance()"
        [class.down]="hasActivePositions() && equity() < balance()"
      ></div>

      <!-- Faded SVG background sparkline -->
      <div class="sparkline-container">
        <svg class="sparkline" viewBox="0 0 100 30" preserveAspectRatio="none">
          <path
            d="M0,25 C10,23 20,28 30,20 C40,12 50,15 60,8 C70,1 C80,10 90,5 100,2"
            fill="none"
            [attr.stroke]="sparklineColor()"
            stroke-width="1.5"
          />
        </svg>
      </div>

      <!-- Top row - Title & PnL Badge if active -->
      <div class="header-row">
        <span class="title">Balance Neto</span>
        @if (hasActivePositions()) {
          <div
            class="pnl-badge"
            [class.up]="equity() >= balance()"
            [class.down]="equity() < balance()"
          >
            PnL: {{ pnlPrefix() }}{{ pnl() | number: '1.2-2' }} $
          </div>
        }
      </div>

      <!-- Main Balance Display -->
      <div class="balance-display">
        <span class="balance-amount">{{ balance() | number: '1.2-2' }}</span>
        <span class="currency">USD</span>
      </div>

      <!-- Equity info row -->
      <div class="equity-row">
        <span class="equity-label">Equidad:</span>
        <span class="equity-value">{{ equity() | number: '1.2-2' }} $</span>
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
    }
    .card {
      position: relative;
      overflow: hidden;
      border-radius: var(--radius-lg, 12px);
      border: 1px solid rgba(255, 255, 255, 0.06);
      background: linear-gradient(135deg, #121418, #08090b);
      padding: 16px;
      box-shadow:
        inset 0 1px rgba(255, 255, 255, 0.03),
        0 4px 24px rgba(0, 0, 0, 0.4);
      transition: border-color 0.3s ease;
    }
    .card:hover {
      border-color: rgba(255, 255, 255, 0.12);
    }
    .glow {
      position: absolute;
      top: -64px;
      right: -64px;
      width: 128px;
      height: 128px;
      border-radius: 50%;
      filter: blur(40px);
      opacity: 0.15;
      pointer-events: none;
      transition: background-color 1s ease;
    }
    .glow.neutral {
      background-color: rgba(41, 98, 255, 0.4); /* blue */
    }
    .glow.up {
      background-color: rgba(38, 166, 154, 0.4); /* emerald */
    }
    .glow.down {
      background-color: rgba(239, 83, 80, 0.4); /* crimson */
    }
    .sparkline-container {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      height: 48px;
      opacity: 0.03;
      pointer-events: none;
      transition: opacity 0.3s ease;
    }
    .card:hover .sparkline-container {
      opacity: 0.06;
    }
    .sparkline {
      width: 100%;
      height: 100%;
    }
    .header-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .title {
      font-size: 9px;
      color: #787b86;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .pnl-badge {
      font-size: 9px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 6px;
      border: 1px solid transparent;
      font-family: var(--font-mono, monospace);
    }
    .pnl-badge.up {
      background-color: rgba(38, 166, 154, 0.1);
      color: #26a69a;
      border-color: rgba(38, 166, 154, 0.2);
    }
    .pnl-badge.down {
      background-color: rgba(239, 83, 80, 0.1);
      color: #ef5350;
      border-color: rgba(239, 83, 80, 0.2);
    }
    .balance-display {
      margin-top: 4px;
      display: flex;
      align-items: baseline;
      gap: 4px;
    }
    .balance-amount {
      font-size: 24px;
      font-weight: 800;
      color: #ffffff;
      font-family: var(--font-mono, monospace);
      letter-spacing: -0.02em;
    }
    .currency {
      font-size: 12px;
      font-weight: 700;
      color: #787b86;
      font-family: var(--font-mono, monospace);
    }
    .equity-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 16px;
      padding-top: 12px;
      border-top: 1px solid rgba(255, 255, 255, 0.04);
      font-size: 12px;
    }
    .equity-label {
      color: #a1a1aa;
      font-weight: 600;
    }
    .equity-value {
      font-weight: 600;
      color: #d4d4d8;
      font-family: var(--font-mono, monospace);
    }
  `,
})
export class AccountCardComponent {
  balance = input.required<number>();
  equity = input.required<number>();
  hasActivePositions = input<boolean>(false);

  pnl = computed(() => this.equity() - this.balance());
  pnlPrefix = computed(() => (this.pnl() >= 0 ? '+' : ''));
  sparklineColor = computed(() => (this.equity() >= this.balance() ? '#26a69a' : '#ef5350'));
}
