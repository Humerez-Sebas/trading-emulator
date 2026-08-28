// @ts-check
'use strict';

/**
 * Prevent raw lightweight-charts handles from crossing out of the chart domain.
 *
 * Scope is set in eslint.config.js: production TypeScript under src/app, excluding specs.
 * Chart-domain files may import owned handles but may not export them; non-domain files may
 * neither import nor export them. The rule permits lightweight-charts payload/data types while
 * rejecting the four handle types the retired RFC-004/RFC-005 bridge exposed through static
 * imports, TypeScript import types, direct re-exports, and exported aliases of tracked
 * bindings. Namespace imports and star re-exports are rejected because they can expose
 * handles without a named specifier.
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
    const importedHandleLocals = new Map();
    function importedName(specifier) {
      const imported = specifier.imported ?? specifier.local;
      return imported.type === 'Identifier' ? imported.name : String(imported.value);
    }

    function reportNamed(node, name) {
      if (!FORBIDDEN_HANDLES.has(name)) return;
      context.report({ node, messageId: 'forbiddenNamedImport', data: { name } });
    }

    function trackImportBindings(node) {
      if (node.source.value !== 'lightweight-charts') return;

      for (const specifier of node.specifiers) {
        if (specifier.type === 'ImportNamespaceSpecifier') {
          importedHandleLocals.set(specifier.local.name, null);
        } else if (specifier.type === 'ImportSpecifier') {
          const name = importedName(specifier);
          if (FORBIDDEN_HANDLES.has(name)) {
            importedHandleLocals.set(specifier.local.name, name);
          }
        }
      }
    }

    function trackedTypeRoot(type) {
      if (type.type === 'TSIndexedAccessType') {
        const name = trackedTypeRoot(type.objectType);
        if (name !== null) return name;
        if (
          type.indexType.type === 'TSLiteralType' &&
          type.indexType.literal.type === 'Literal' &&
          FORBIDDEN_HANDLES.has(String(type.indexType.literal.value))
        ) {
          return String(type.indexType.literal.value);
        }
        return undefined;
      }

      if (type.type !== 'TSTypeReference') return undefined;
      if (type.typeName.type === 'Identifier') {
        return importedHandleLocals.get(type.typeName.name);
      }

      let qualifiedName = type.typeName;
      while (qualifiedName.left.type === 'TSQualifiedName') {
        qualifiedName = qualifiedName.left;
      }
      const name = importedHandleLocals.get(qualifiedName.left.name);
      if (name !== null) return name;
      return FORBIDDEN_HANDLES.has(qualifiedName.right.name)
        ? qualifiedName.right.name
        : undefined;
    }

    function reportTrackedTypeRoot(node, type) {
      const name = trackedTypeRoot(type);
      if (name === undefined) return;
      if (name === null) {
        context.report({ node, messageId: 'forbiddenNamespaceImport' });
      } else {
        reportNamed(node, name);
      }
    }

    return {
      Program(node) {
        if (!allowImports) return;
        for (const statement of node.body) {
          if (statement.type === 'ImportDeclaration') trackImportBindings(statement);
        }
      },
      ImportDeclaration(node) {
        if (node.source.value !== 'lightweight-charts') return;
        if (allowImports) return;

        for (const specifier of node.specifiers) {
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
      TSTypeAliasDeclaration(node) {
        if (node.parent.type !== 'ExportNamedDeclaration') return;
        reportTrackedTypeRoot(node, node.typeAnnotation);
      },
      ExportNamedDeclaration(node) {
        for (const specifier of node.specifiers) {
          if (node.source?.value === 'lightweight-charts') {
            reportNamed(specifier, importedName(specifier));
          } else if (!node.source && importedHandleLocals.has(specifier.local.name)) {
            const name = importedHandleLocals.get(specifier.local.name);
            if (name === null) {
              context.report({ node: specifier, messageId: 'forbiddenNamespaceImport' });
            } else {
              reportNamed(specifier, name);
            }
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
