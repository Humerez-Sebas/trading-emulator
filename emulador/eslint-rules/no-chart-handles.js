// @ts-check
'use strict';

/**
 * Prevent raw lightweight-charts handles from crossing out of the chart domain.
 *
 * Scope is set in eslint.config.js: production TypeScript under src/app, excluding
 * src/app/domain/chart/** and specs. It permits lightweight-charts payload/data types while
 * rejecting the four handle types the retired RFC-004/RFC-005 bridge exposed through static
 * imports, TypeScript import types, and direct re-exports. Namespace imports and star
 * re-exports are rejected because they can expose handles without a named specifier.
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
    schema: [
      {
        type: 'object',
        properties: { allowImports: { type: 'boolean' } },
        additionalProperties: false,
      },
    ],
    messages: {
      forbiddenNamedImport:
        'Do not import {{name}} outside src/app/domain/chart. Use a narrow ChartEngine or Capability contract instead.',
      forbiddenNamespaceImport:
        'Do not namespace-import lightweight-charts outside src/app/domain/chart; it bypasses raw-handle import checks. Import only the specific payload/data types needed.',
    },
  },

  create(context) {
    const allowImports = context.options[0]?.allowImports === true;
    const importedHandleLocals = new Set();
    function importedName(specifier) {
      const imported = specifier.imported ?? specifier.local;
      return imported.type === 'Identifier' ? imported.name : String(imported.value);
    }

    function reportNamed(node, name) {
      if (!FORBIDDEN_HANDLES.has(name)) return;
      context.report({ node, messageId: 'forbiddenNamedImport', data: { name } });
    }

    return {
      ImportDeclaration(node) {
        if (node.source.value !== 'lightweight-charts') return;

        for (const specifier of node.specifiers) {
          if (allowImports) {
            if (
              specifier.type === 'ImportSpecifier' &&
              FORBIDDEN_HANDLES.has(importedName(specifier))
            ) {
              importedHandleLocals.add(specifier.local.name);
            }
            continue;
          }
          if (specifier.type === 'ImportNamespaceSpecifier') {
            context.report({ node: specifier, messageId: 'forbiddenNamespaceImport' });
            continue;
          }
          if (specifier.type !== 'ImportSpecifier') continue;

          reportNamed(specifier, importedName(specifier));
        }
      },
      TSImportType(node) {
        if (node.source.type !== 'Literal' || node.source.value !== 'lightweight-charts') {
          return;
        }
        if (node.qualifier?.type === 'Identifier') reportNamed(node, node.qualifier.name);
      },
      TSIndexedAccessType(node) {
        if (
          node.objectType.type !== 'TSImportType' ||
          node.objectType.source.value !== 'lightweight-charts' ||
          node.indexType.type !== 'TSLiteralType' ||
          node.indexType.literal.type !== 'Literal'
        ) {
          return;
        }
        reportNamed(node, String(node.indexType.literal.value));
      },
      ExportNamedDeclaration(node) {
        for (const specifier of node.specifiers) {
          if (node.source?.value === 'lightweight-charts') {
            reportNamed(specifier, importedName(specifier));
          } else if (!node.source && importedHandleLocals.has(specifier.local.name)) {
            reportNamed(specifier, specifier.local.name);
          }
        }
      },
      ExportAllDeclaration(node) {
        if (node.source.value === 'lightweight-charts') {
          context.report({ node, messageId: 'forbiddenNamespaceImport' });
        }
      },
    };
  },
};

module.exports = {
  rules: { 'no-chart-handles': noChartHandles },
};
