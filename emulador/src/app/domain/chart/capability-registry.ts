import type { ISeriesApi } from 'lightweight-charts';
import type { Capability } from './capability';
import { CountdownCapability } from './capabilities/countdown-capability';
import { DrawingsCapability } from './capabilities/drawings-capability';
import { SessionCapability } from './capabilities/session-capability';
import { TradingCapability } from './capabilities/trading-capability';

export type BuiltInCapabilityId = 'drawings' | 'countdown' | 'session' | 'trading';

export function createBuiltInCapability(
  id: BuiltInCapabilityId,
  series: ISeriesApi<'Candlestick'>,
): Capability {
  switch (id) {
    case 'drawings':
      return new DrawingsCapability(series);
    case 'countdown':
      return new CountdownCapability(series);
    case 'session':
      return new SessionCapability(series);
    case 'trading':
      return new TradingCapability(series);
    default:
      throw new Error('Unknown built-in capability.');
  }
}
