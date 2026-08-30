// @ts-check
'use strict';

const { RuleTester } = require('eslint');
const tseslint = require('typescript-eslint');
const engineBoundary = require('./no-chart-handles');

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    ecmaVersion: 2022,
    sourceType: 'module',
  },
});

const domainRuleTester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    ecmaVersion: 2022,
    sourceType: 'module',
  },
});

ruleTester.run('no-chart-handles', engineBoundary.rules['no-chart-handles'], {
  valid: [
    {
      name: 'allows chart payload and data types',
      code: `
        import type {
          CandlestickData,
          LogicalRange,
          MouseEventParams,
          Time,
          UTCTimestamp,
        } from 'lightweight-charts';
      `,
    },
    {
      name: 'ignores imports from other modules',
      code: `import type { IChartApi } from './test-double';`,
    },
    {
      name: 'allows a data-only TypeScript import type',
      code: `type Candle = import('lightweight-charts').CandlestickData;`,
    },
    {
      name: 'allows a data-only direct re-export',
      code: `export type { CandlestickData } from 'lightweight-charts';`,
    },
    ...[
      'chart-engine',
      'chart-event-bus',
      'chart-sync-bus',
      'render-model',
      'display-time',
    ].map((module) => ({
      name: `allows the established host-facing ${module} module`,
      filename: 'src/app/components/chart/public-contract.ts',
      code: `import type { PublicContract } from '../../domain/chart/${module}';`,
    })),
  ],
  invalid: [
    ...['IChartApi', 'ISeriesApi', 'IPriceLine', 'ISeriesMarkersPluginApi'].map((handle) => ({
      name: `rejects ${handle}`,
      code: `import type { ${handle} } from 'lightweight-charts';`,
      errors: [{ messageId: 'forbiddenNamedImport', data: { name: handle } }],
    })),
    {
      name: 'rejects an aliased handle import',
      code: `import type { IChartApi as ChartHandle } from 'lightweight-charts';`,
      errors: [{ messageId: 'forbiddenNamedImport', data: { name: 'IChartApi' } }],
    },
    {
      name: 'rejects namespace imports that bypass named-import checks',
      code: `import * as LightweightCharts from 'lightweight-charts';`,
      errors: [{ messageId: 'forbiddenNamespaceImport' }],
    },
    {
      name: 'rejects a handle through a TypeScript import type',
      code: `type ChartHandle = import('lightweight-charts').IChartApi;`,
      errors: [{ messageId: 'forbiddenNamedImport', data: { name: 'IChartApi' } }],
    },
    {
      name: 'rejects a handle through an indexed TypeScript import type',
      code: `type ChartHandle = import('lightweight-charts')['IChartApi'];`,
      errors: [{ messageId: 'forbiddenNamedImport', data: { name: 'IChartApi' } }],
    },
    {
      name: 'rejects an aliased direct handle re-export',
      code: `export type { ISeriesApi as SeriesHandle } from 'lightweight-charts';`,
      errors: [{ messageId: 'forbiddenNamedImport', data: { name: 'ISeriesApi' } }],
    },
    {
      name: 'rejects a star re-export that includes handles',
      code: `export type * from 'lightweight-charts';`,
      errors: [{ messageId: 'forbiddenNamespaceImport' }],
    },
    {
      name: 'rejects createChart outside the chart domain',
      filename: 'src/app/components/chart/raw-chart.ts',
      code: `import { createChart } from 'lightweight-charts';`,
      errors: [{ messageId: 'forbiddenChartFactoryImport' }],
    },
    {
      name: 'rejects an aliased createChart outside the chart domain',
      filename: 'src/app/pages/reflection/raw-chart.ts',
      code: `import { createChart as buildChart } from 'lightweight-charts';`,
      errors: [{ messageId: 'forbiddenChartFactoryImport' }],
    },
    {
      name: 'rejects deriving the init chart from the internal capability contract',
      filename: 'src/app/components/chart/capability-leak.ts',
      code: `
        import type { Capability } from '../../domain/chart/capability';
        export type LeakedChart = Parameters<Capability['init']>[0];
      `,
      errors: [{ messageId: 'forbiddenChartInternalImport' }],
    },
    {
      name: 'rejects a sibling-relative internal capability import from a Windows filename',
      filename: 'C:\\repo\\emulador\\src\\app\\domain\\reflection\\capability-leak.ts',
      code: `import type { Capability } from '../chart/capability';`,
      errors: [{ messageId: 'forbiddenChartInternalImport' }],
    },
    {
      name: 'rejects the internal capability registry with an optional TypeScript extension',
      filename: 'src/app/components/chart/capability-leak.ts',
      code: `import { createBuiltInCapability } from '../../domain/chart/capability-registry.ts';`,
      errors: [{ messageId: 'forbiddenChartInternalImport' }],
    },
    {
      name: 'rejects a nested concrete capability import',
      filename: 'src/app/pages/reflection/capability-leak.ts',
      code: `import { TradingCapability } from '../../domain/chart/capabilities/trading-capability';`,
      errors: [{ messageId: 'forbiddenChartInternalImport' }],
    },
    {
      name: 'rejects the internal raw-handle coordinate helpers',
      filename: 'src/app/components/chart/capability-leak.ts',
      code: `import { timeForX } from '../../domain/chart/time-coordinates';`,
      errors: [{ messageId: 'forbiddenChartInternalImport' }],
    },
    {
      name: 'rejects importing the chart-domain root',
      filename: 'src/app/components/chart/capability-leak.ts',
      code: `import * as ChartDomain from '../../domain/chart';`,
      errors: [{ messageId: 'forbiddenChartInternalImport' }],
    },
    {
      name: 'rejects importing the chart-domain index',
      filename: 'src/app/components/chart/capability-leak.ts',
      code: `import * as ChartDomain from '../../domain/chart/index';`,
      errors: [{ messageId: 'forbiddenChartInternalImport' }],
    },
  ],
});

domainRuleTester.run('no-chart-handles (trusted chart-domain imports)', engineBoundary.rules['no-chart-handles'], {
  valid: [
    {
      name: 'allows the chart domain to import handles it owns',
      code: `import type { IChartApi } from 'lightweight-charts';`,
      options: [{ allowImports: true }],
    },
    {
      name: 'allows an exported internal interface to use an owned chart handle',
      filename: 'src/app/domain/chart/internal-capability.ts',
      code: `
        import type { IChartApi } from 'lightweight-charts';
        export interface InternalCapability {
          init(chart: IChartApi): void;
        }
      `,
      options: [{ allowImports: true }],
    },
    {
      name: 'allows an exported alias of a named data-only type',
      code: `
        import type { CandlestickData as D } from 'lightweight-charts';
        export type Public = D;
      `,
      options: [{ allowImports: true }],
    },
    {
      name: 'allows an exported alias of a namespace-qualified data-only type',
      code: `
        import type * as LC from 'lightweight-charts';
        export type Public = LC.CandlestickData;
      `,
      options: [{ allowImports: true }],
    },
    {
      name: 'allows an exported alias of a namespace-indexed data-only type',
      code: `
        import type * as LC from 'lightweight-charts';
        export type Public = LC['CandlestickData'];
      `,
      options: [{ allowImports: true }],
    },
    {
      name: 'allows an indexed member of a namespace-qualified data-only type',
      code: `
        import type * as LC from 'lightweight-charts';
        export type Public = LC.CandlestickData['close'];
      `,
      options: [{ allowImports: true }],
    },
    {
      name: 'allows a nested indexed member of a namespace-indexed data-only type',
      code: `
        import type * as LC from 'lightweight-charts';
        export type AlsoPublic = LC['CandlestickData']['close'];
      `,
      options: [{ allowImports: true }],
    },
    {
      name: 'allows late named data-only aliases and exports',
      code: `
        export type Public = D;
        export type { D };
        import type { CandlestickData as D } from 'lightweight-charts';
      `,
      options: [{ allowImports: true }],
    },
    {
      name: 'allows a late namespace-qualified nested data-only alias',
      code: `
        export type Public = LC.CandlestickData['close'];
        import type * as LC from 'lightweight-charts';
      `,
      options: [{ allowImports: true }],
    },
    {
      name: 'allows a late namespace-indexed nested data-only alias',
      code: `
        export type Public = LC['CandlestickData']['close'];
        import type * as LC from 'lightweight-charts';
      `,
      options: [{ allowImports: true }],
    },
    {
      name: 'allows a generic type parameter that shadows an imported handle alias',
      code: `
        import type { IChartApi as H } from 'lightweight-charts';
        export type Public<H> = H;
      `,
      options: [{ allowImports: true }],
    },
  ],
  invalid: [
    {
      name: 'still rejects a direct handle re-export from the chart domain',
      code: `export type { IChartApi } from 'lightweight-charts';`,
      options: [{ allowImports: true }],
      errors: [{ messageId: 'forbiddenNamedImport', data: { name: 'IChartApi' } }],
    },
    {
      name: 'rejects exporting a handle imported earlier by the chart domain',
      code: `
        import type { IChartApi } from 'lightweight-charts';
        export type { IChartApi };
      `,
      options: [{ allowImports: true }],
      errors: [{ messageId: 'forbiddenNamedImport', data: { name: 'IChartApi' } }],
    },
    {
      name: 'rejects exporting an aliased handle imported earlier by the chart domain',
      code: `
        import type { IChartApi as ChartHandle } from 'lightweight-charts';
        export type { ChartHandle };
      `,
      options: [{ allowImports: true }],
      errors: [{ messageId: 'forbiddenNamedImport', data: { name: 'IChartApi' } }],
    },
    {
      name: 'rejects exporting a namespace imported earlier by the chart domain',
      code: `
        import type * as LightweightCharts from 'lightweight-charts';
        export type { LightweightCharts };
      `,
      options: [{ allowImports: true }],
      errors: [{ messageId: 'forbiddenNamespaceImport' }],
    },
    {
      name: 'rejects an exported alias of a named handle binding',
      code: `
        import type { IChartApi as H } from 'lightweight-charts';
        export type Public = H;
      `,
      options: [{ allowImports: true }],
      errors: [{ messageId: 'forbiddenNamedImport', data: { name: 'IChartApi' } }],
    },
    {
      name: 'rejects an exported alias of a namespace-qualified handle',
      code: `
        import type * as LC from 'lightweight-charts';
        export type Public = LC.IChartApi;
      `,
      options: [{ allowImports: true }],
      errors: [{ messageId: 'forbiddenNamedImport', data: { name: 'IChartApi' } }],
    },
    {
      name: 'rejects an exported alias of a namespace-indexed handle',
      code: `
        import type * as LC from 'lightweight-charts';
        export type Public = LC['ISeriesApi'];
      `,
      options: [{ allowImports: true }],
      errors: [{ messageId: 'forbiddenNamedImport', data: { name: 'ISeriesApi' } }],
    },
    {
      name: 'rejects an indexed member of a named handle binding',
      code: `
        import type { IChartApi as H } from 'lightweight-charts';
        export type Public = H['priceScale'];
      `,
      options: [{ allowImports: true }],
      errors: [{ messageId: 'forbiddenNamedImport', data: { name: 'IChartApi' } }],
    },
    {
      name: 'rejects an indexed member of a namespace-qualified handle',
      code: `
        import type * as LC from 'lightweight-charts';
        export type Public = LC.ISeriesApi<'Candlestick'>['createPriceLine'];
      `,
      options: [{ allowImports: true }],
      errors: [{ messageId: 'forbiddenNamedImport', data: { name: 'ISeriesApi' } }],
    },
    {
      name: 'rejects a nested indexed member of a namespace-indexed handle',
      code: `
        import type * as LC from 'lightweight-charts';
        export type AlsoPublic = LC['IChartApi']['priceScale'];
      `,
      options: [{ allowImports: true }],
      errors: [{ messageId: 'forbiddenNamedImport', data: { name: 'IChartApi' } }],
    },
    {
      name: 'rejects an exported alias of the whole forbidden namespace',
      code: `
        import type * as LC from 'lightweight-charts';
        export type Public = LC;
      `,
      options: [{ allowImports: true }],
      errors: [{ messageId: 'forbiddenNamespaceImport' }],
    },
    {
      name: 'rejects a late named handle alias',
      code: `
        export type Public = H;
        import type { IChartApi as H } from 'lightweight-charts';
      `,
      options: [{ allowImports: true }],
      errors: [{ messageId: 'forbiddenNamedImport', data: { name: 'IChartApi' } }],
    },
    {
      name: 'rejects a late namespace-qualified nested handle alias',
      code: `
        export type Public = LC.ISeriesApi<'Candlestick'>['createPriceLine'];
        import type * as LC from 'lightweight-charts';
      `,
      options: [{ allowImports: true }],
      errors: [{ messageId: 'forbiddenNamedImport', data: { name: 'ISeriesApi' } }],
    },
    {
      name: 'rejects a late namespace-indexed nested handle alias',
      code: `
        export type Public = LC['IChartApi']['priceScale'];
        import type * as LC from 'lightweight-charts';
      `,
      options: [{ allowImports: true }],
      errors: [{ messageId: 'forbiddenNamedImport', data: { name: 'IChartApi' } }],
    },
    {
      name: 'rejects a late source-less named handle export',
      code: `
        export type { H };
        import type { IChartApi as H } from 'lightweight-charts';
      `,
      options: [{ allowImports: true }],
      errors: [{ messageId: 'forbiddenNamedImport', data: { name: 'IChartApi' } }],
    },
    {
      name: 'rejects a late source-less namespace export',
      code: `
        export type { LC };
        import type * as LC from 'lightweight-charts';
      `,
      options: [{ allowImports: true }],
      errors: [{ messageId: 'forbiddenNamespaceImport' }],
    },
  ],
});
