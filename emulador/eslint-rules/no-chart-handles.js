// @ts-check
'use strict';

const path = require('node:path');

/**
 * Prevent raw lightweight-charts handles from crossing out of the chart domain.
 *
 * Scope is set in eslint.config.js: production TypeScript under src/app, excluding specs.
 * Outside the chart domain, the rule rejects the four handle types exposed by the retired
 * RFC-004/RFC-005 bridge, the createChart factory, and relative dependency edges to chart-domain
 * modules other than the five established host-facing modules below. Static import declarations,
 * TypeScript import types, and named/star re-exports are covered. Chart-domain files remain trusted
 * owners: they may import handles and expose handle-bearing signatures for internal sibling
 * composition. Direct re-exports and direct exported aliases rooted in tracked library bindings
 * remain rejected. This is intentionally syntax- and dependency-edge enforcement, not arbitrary
 * type-flow, runtime ImportExpression, CommonJS require, or TypeScript path-alias analysis.
 */

const FORBIDDEN_HANDLES = new Set([
  'IChartApi',
  'ISeriesApi',
  'IPriceLine',
  'ISeriesMarkersPluginApi',
]);

const HOST_FACING_CHART_MODULES = new Set([
  'chart-engine',
  'chart-event-bus',
  'chart-sync-bus',
  'render-model',
  'display-time',
]);

function resolveChartDomainModule(filename, source) {
  if (!source.startsWith('.')) return null;

  const pathApi = /^[A-Za-z]:[\\/]/.test(filename) || filename.includes('\\') ? path.win32 : path;
  const portableSource = source.replace(/[\\/]/g, pathApi.sep);
  const resolved = pathApi.resolve(pathApi.dirname(filename), portableSource);
  const normalized = resolved.replace(/\\/g, '/').replace(/\.(?:ts|js)$/i, '');
  const marker = '/src/app/domain/chart';
  const markerIndex = normalized.toLowerCase().lastIndexOf(marker);
  if (markerIndex === -1) return null;

  const suffix = normalized.slice(markerIndex + marker.length);
  if (suffix !== '' && !suffix.startsWith('/')) return null;

  const module = suffix.replace(/^\//, '');
  if (HOST_FACING_CHART_MODULES.has(module)) return null;
  return module || 'domain/chart';
}

/** @type {import('eslint').Rule.RuleModule} */
const noChartHandles = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Enforce handle-free imports across the chart-domain public boundary.',
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
        'Do not import {{name}} outside src/app/domain/chart. Use a narrow ChartEngine or host-facing chart contract instead.',
      forbiddenNamespaceImport:
        'Do not namespace-import lightweight-charts outside src/app/domain/chart; it bypasses raw-handle import checks. Import only the specific payload/data types needed.',
      forbiddenChartFactoryImport:
        'Do not import or re-export createChart outside src/app/domain/chart. ChartEngine owns chart construction.',
      forbiddenChartInternalImport:
        'Do not reference internal chart-domain module {{module}} outside src/app/domain/chart. Use an established host-facing chart contract.',
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

    function reportLightweightNamed(node, name) {
      if (name === 'createChart') {
        context.report({ node, messageId: 'forbiddenChartFactoryImport' });
      } else {
        reportNamed(node, name);
      }
    }

    function reportInternalModuleSource(node, source) {
      if (allowImports) return false;
      const internalModule = resolveChartDomainModule(context.filename, source);
      if (internalModule === null) return false;

      context.report({
        node,
        messageId: 'forbiddenChartInternalImport',
        data: { module: internalModule },
      });
      return true;
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

    function trackedTypeRoot(type, shadowedNames) {
      if (type.type === 'TSIndexedAccessType') {
        const name = trackedTypeRoot(type.objectType, shadowedNames);
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
        if (shadowedNames.has(type.typeName.name)) return undefined;
        return importedHandleLocals.get(type.typeName.name);
      }

      let qualifiedName = type.typeName;
      while (qualifiedName.left.type === 'TSQualifiedName') {
        qualifiedName = qualifiedName.left;
      }
      if (shadowedNames.has(qualifiedName.left.name)) return undefined;
      const name = importedHandleLocals.get(qualifiedName.left.name);
      if (name !== null) return name;
      return FORBIDDEN_HANDLES.has(qualifiedName.right.name)
        ? qualifiedName.right.name
        : undefined;
    }

    function reportTrackedTypeRoot(node, type, shadowedNames) {
      const name = trackedTypeRoot(type, shadowedNames);
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
        if (reportInternalModuleSource(node.source, String(node.source.value))) return;

        if (node.source.value !== 'lightweight-charts') return;
        if (allowImports) return;

        for (const specifier of node.specifiers) {
          if (specifier.type === 'ImportNamespaceSpecifier') {
            context.report({ node: specifier, messageId: 'forbiddenNamespaceImport' });
            continue;
          }
          if (specifier.type !== 'ImportSpecifier') continue;

          reportLightweightNamed(specifier, importedName(specifier));
        }
      },
      TSImportType(node) {
        if (node.source.type !== 'Literal') return;
        if (reportInternalModuleSource(node.source, String(node.source.value))) return;
        if (node.source.value !== 'lightweight-charts') return;
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
        const shadowedNames = new Set(
          node.typeParameters?.params.map((parameter) => parameter.name.name) ?? [],
        );
        reportTrackedTypeRoot(node, node.typeAnnotation, shadowedNames);
      },
      ExportNamedDeclaration(node) {
        if (
          node.source &&
          reportInternalModuleSource(node.source, String(node.source.value))
        ) {
          return;
        }

        for (const specifier of node.specifiers) {
          if (node.source?.value === 'lightweight-charts') {
            reportLightweightNamed(specifier, importedName(specifier));
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
        if (reportInternalModuleSource(node.source, String(node.source.value))) return;
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
