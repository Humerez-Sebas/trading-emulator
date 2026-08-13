// @ts-check
'use strict';

/**
 * Prevent raw lightweight-charts handles from crossing out of the chart domain.
 *
 * Scope is set in eslint.config.js: production TypeScript under src/app, excluding
 * src/app/domain/chart/** and specs. This rule intentionally inspects imports only. It
 * permits lightweight-charts payload/data types while rejecting the four handle types
 * the retired RFC-004/RFC-005 bridge exposed. Namespace imports are rejected because
 * they can access those handles without a named ImportSpecifier.
 */

const FORBIDDEN_HANDLES = new Set([
  'IChartApi',
  'ISeriesApi',
  'IPriceLine',
  'ISeriesMarkersPluginApi',
]);

/** @type {import('eslint').Rule.RuleModule} */
const noChartHandles = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow importing raw lightweight-charts handles outside the chart domain.',
    },
    schema: [],
    messages: {
      forbiddenNamedImport:
        'Do not import {{name}} outside src/app/domain/chart. Use a narrow ChartEngine or Capability contract instead.',
      forbiddenNamespaceImport:
        'Do not namespace-import lightweight-charts outside src/app/domain/chart; it bypasses raw-handle import checks. Import only the specific payload/data types needed.',
    },
  },

  create(context) {
    return {
      ImportDeclaration(node) {
        if (node.source.value !== 'lightweight-charts') return;

        for (const specifier of node.specifiers) {
          if (specifier.type === 'ImportNamespaceSpecifier') {
            context.report({ node: specifier, messageId: 'forbiddenNamespaceImport' });
            continue;
          }
          if (specifier.type !== 'ImportSpecifier') continue;

          const imported = specifier.imported;
          const name = imported.type === 'Identifier' ? imported.name : String(imported.value);
          if (FORBIDDEN_HANDLES.has(name)) {
            context.report({
              node: specifier,
              messageId: 'forbiddenNamedImport',
              data: { name },
            });
          }
        }
      },
    };
  },
};

module.exports = {
  rules: { 'no-chart-handles': noChartHandles },
};
