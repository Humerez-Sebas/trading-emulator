import { describe, expect, it, vi } from 'vitest';
import type { ISeriesApi } from 'lightweight-charts';
import { createBuiltInCapability, type BuiltInCapabilityId } from './capability-registry';

describe('built-in chart capability registry', () => {
  it.each([
    'drawings',
    'countdown',
    'session',
    'trading',
  ] satisfies BuiltInCapabilityId[])('maps %s to the matching domain capability', (id) => {
    const capability = createBuiltInCapability(
      id,
      { attachPrimitive: vi.fn() } as unknown as ISeriesApi<'Candlestick'>,
    );

    expect(capability.id).toBe(id);
  });

  it('rejects an unknown runtime value', () => {
    expect(() =>
      createBuiltInCapability(
        'probe' as BuiltInCapabilityId,
        {} as ISeriesApi<'Candlestick'>,
      ),
    ).toThrowError('Unknown built-in capability.');
  });
});
