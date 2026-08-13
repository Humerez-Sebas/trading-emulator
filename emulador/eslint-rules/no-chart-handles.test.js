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
