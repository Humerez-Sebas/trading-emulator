// @ts-check
'use strict';

/**
 * Local ESLint rule: a spec that forces a selector result must release it.
 *
 * THE LAW IT ENCODES (current, not stale prose):
 * `docs/engineering/testing.md` §"isolate:false discipline" #1 — the Angular
 * unit-test builder runs vitest with `isolate: false`, so spec files in the
 * same worker share module state. `MockStore.overrideSelector()` writes the
 * forced result onto the module-level memoized selector itself, which
 * `TestBed.resetTestingModule()` does NOT undo. A file that forces a selector
 * and never calls `store.resetSelectors()` therefore poisons every later spec
 * file that reads the same selector — the observed incident was a leaked
 * `selectFloatingPnl` making an unrelated assertion see 120.5 instead of 50.
 *
 * That failure is order- and cache-dependent, so it does not reproduce
 * reliably and a green local run proves nothing. 19 spec files had drifted
 * out of compliance before this rule existed.
 *
 * WHAT THIS RULE PROVES, AND WHAT IT DOES NOT:
 * It is deliberately file-scoped and coarse — it asserts only that a file
 * calling `.overrideSelector(...)` also calls `.resetSelectors(...)`
 * somewhere. It does NOT verify the call sits in an `afterEach`, nor that
 * every `describe` block in a multi-describe file is covered. Those would
 * need scope analysis with real false-positive risk (a reset reached through
 * a shared helper is legitimate), for no gain against the failure actually
 * observed: all 19 offenders had no reset at all. Treat a passing lint as
 * "the release exists", not "the release is correctly scoped".
 *
 * Escape hatch: a spec that genuinely cannot reset should disable this rule
 * on the line with a written reason, which is reviewable — silence is not.
 */

/** @type {import('eslint').Rule.RuleModule} */
const requireResetSelectors = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require a spec that calls MockStore#overrideSelector to also call resetSelectors, so a forced selector result cannot leak across spec files under vitest isolate:false.',
    },
    schema: [],
    messages: {
      missingReset:
        'This spec calls overrideSelector() but never calls resetSelectors(). Under isolate:false the forced result outlives TestBed.resetTestingModule() and leaks into later spec files. Add `afterEach(() => store.resetSelectors());` (see docs/engineering/testing.md, isolate:false discipline).',
    },
  },

  create(context) {
    /** @type {import('estree').Node | null} */
    let firstOverride = null;
    let sawReset = false;

    /** Matches `<anything>.overrideSelector(...)` / `<anything>.resetSelectors(...)`. */
    function calleeName(node) {
      const callee = node.callee;
      if (!callee || callee.type !== 'MemberExpression') return null;
      if (callee.computed) return null;
      const property = callee.property;
      return property && property.type === 'Identifier' ? property.name : null;
    }

    return {
      CallExpression(node) {
        const name = calleeName(node);
        if (name === 'overrideSelector') {
          if (!firstOverride) firstOverride = node;
        } else if (name === 'resetSelectors') {
          sawReset = true;
        }
      },

      'Program:exit'() {
        if (firstOverride && !sawReset) {
          context.report({ node: firstOverride, messageId: 'missingReset' });
        }
      },
    };
  },
};

module.exports = {
  rules: { 'require-reset-selectors': requireResetSelectors },
};
