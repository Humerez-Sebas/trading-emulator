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
  ],
});
