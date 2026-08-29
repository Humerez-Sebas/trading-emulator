// @ts-check
const eslint = require('@eslint/js');
const { defineConfig } = require('eslint/config');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');
// Local rule, plain ESLint AST — no new dependency. See the file header for
// the law it encodes and the limits of what it proves.
const selectorIsolation = require('./eslint-rules/require-reset-selectors');

module.exports = defineConfig([
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      tseslint.configs.recommended,
      tseslint.configs.stylistic,
      angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        {
          type: 'attribute',
          prefix: 'app',
          style: 'camelCase',
        },
      ],
      '@angular-eslint/component-selector': [
        'error',
        {
          type: 'element',
          // 'app' for feature components; 'ui' for the shared design-system primitives.
          prefix: ['app', 'ui'],
          style: 'kebab-case',
        },
      ],
    },
  },
  {
    // Test files legitimately use `any` and empty functions for mocks/stubs.
    files: ['**/*.spec.ts', 'src/app/testing/**/*.ts'],
    plugins: { 'selector-isolation': selectorIsolation },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      // A forced selector result survives TestBed.resetTestingModule() and
      // leaks across spec files under vitest isolate:false. 19 spec files had
      // drifted before this rule existed; the backlog is now clear.
      'selector-isolation/require-reset-selectors': 'error',
    },
  },
  {
    files: ['**/*.html'],
    extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility],
    rules: {},
  },
]);
