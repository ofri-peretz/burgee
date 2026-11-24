/**
 * `no-focused-test`: a focused test turns every other test in the file off. Locally that is a
 * debugging aid; committed, it makes the suite report green while running one case. An agent
 * that narrows a failing run with `.only` and forgets to undo it ships exactly that.
 *
 * Reports a call whose callee is a test-runner API (proven by import, or an unbound global) and
 * carries `.only` anywhere in its chain, or is `fit`, `ftest` or `fdescribe`.
 */
import type { MemberExpression } from 'estree';

import { defineRule, message } from './rule.js';
import { calleeChain, isTestApi, memberName } from './test-api.js';

const FOCUS_ROOTS: ReadonlySet<string> = new Set(['fit', 'ftest', 'fdescribe']);

export const noFocusedTest = defineRule('no-focused-test', {
  description: 'Disallow focused tests (`.only`, `fit`, `fdescribe`) that silently turn the rest of the suite off',
  hasSuggestions: true,
  messages: {
    focusedTest: message(
      'Focused test',
      'A focused test (.only / fit / fdescribe) runs alone and turns every other test in the file off, so the suite reports green while running one case',
      'remove the focus. To run one test locally, pass a filter on the command line (vitest -t "<name>", jest -t "<name>", playwright test -g "<name>") instead of editing the file.',
    ),
    removeFocus: 'Remove the focus from this test.',
  },
  create(context) {
    return {
      CallExpression(node) {
        const chain = calleeChain(node.callee);
        // `it.only.each(t)('x', fn)`: the inner `it.only.each(t)` reports.
        if (!chain || chain.throughCall) return;
        const focusedByName = FOCUS_ROOTS.has(chain.root.name);
        const focusedByMember = chain.path.includes('only');
        if (!focusedByName && !focusedByMember) return;
        if (!isTestApi(chain.root, context.sourceCode)) return;
        const { root } = chain;
        context.report({
          node: node.callee,
          messageId: 'focusedTest',
          suggest: [
            {
              messageId: 'removeFocus',
              fix(fixer) {
                if (!focusedByMember) return fixer.replaceText(root, root.name.slice(1));
                const member = onlyMember(node.callee as MemberExpression);
                // ESLint ranges every node it parses; `range` is optional only in the ESTree type.
                return fixer.removeRange([(member.object.range as [number, number])[1], (member.range as [number, number])[1]]);
              },
            },
          ],
        });
      },
    };
  },
});

/** The `X.only` member in a callee chain known to contain one. */
function onlyMember(callee: MemberExpression): MemberExpression {
  let current = callee;
  while (memberName(current) !== 'only') current = current.object as MemberExpression;
  return current;
}
