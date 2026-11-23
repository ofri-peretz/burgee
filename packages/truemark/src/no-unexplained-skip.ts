/**
 * `no-unexplained-skip`: every skipped or todo test carries an issue link, a decision id or an
 * unexpired date in a comment on its line or the line above. A skip with no reason on record is
 * a test nobody is told to come back to.
 */
import type { CallExpression, Node as EsNode, UnaryExpression } from 'estree';

import { defineRule, message } from './rule.js';
import { calleeChain, cited, isTestApi, justification, todayUtc } from './test-api.js';

const SKIP_ROOTS: ReadonlySet<string> = new Set(['xit', 'xtest', 'xdescribe', 'xcontext']);
const SKIP_MEMBERS: ReadonlySet<string> = new Set(['skip', 'fixme']);
const CONDITIONAL_MEMBERS: ReadonlySet<string> = new Set(['skipIf', 'runIf']);

export const noUnexplainedSkip = defineRule('no-unexplained-skip', {
  description: 'Require every skipped or todo test to carry an issue link, a decision id or an unexpired date',
  messages: {
    unexplainedSkip: message(
      'Unexplained skipped test',
      'A test is skipped with no reason on record, so the suite reports green without running it and nobody is told to come back',
      'make the test pass and remove the skip. If it must stay skipped, add a comment on this line or the line above with the issue URL, the decision id (D-…), or the YYYY-MM-DD date it is skipped until.',
    ),
    expiredSkip: message(
      'Expired skipped test',
      'A skip says it holds until {{date}}, and that date has passed',
      're-enable the test, or replace the date with an issue URL or decision id that explains why it stays skipped.',
    ),
  },
  create(context) {
    const today = todayUtc();
    return {
      CallExpression(node) {
        const chain = calleeChain(node.callee);
        if (!chain || chain.throughCall) return;
        if (!isSkip(node, chain.root.name, chain.path)) return;
        if (!isTestApi(chain.root, context.sourceCode)) return;
        const why = justification(node, context.sourceCode, today);
        if (cited(why)) return;
        if (why.kind === 'until') {
          if (!why.expired) return;
          context.report({ node: node.callee, messageId: 'expiredSkip', data: { date: why.date } });
          return;
        }
        context.report({ node: node.callee, messageId: 'unexplainedSkip' });
      },
    };
  },
});

function isSkip(node: CallExpression, root: string, path: string[]): boolean {
  if (path.includes('todo')) return true;
  if (path.some((p) => CONDITIONAL_MEMBERS.has(p))) return constantValue(node.arguments[0]) !== undefined;
  if (SKIP_ROOTS.has(root)) return true;
  if (!path.some((p) => SKIP_MEMBERS.has(p))) return false;
  // `it.skip.each(table)` declares skipped tests whatever the table holds.
  if (path.includes('each')) return true;
  return isDeclaredSkip(node);
}

/**
 * `it.skip('name', fn)`, `test.skip()` and `test.skip(true)` skip a test; Playwright's
 * `test.skip(cond, 'reason')` with a runtime condition is a gate.
 */
function isDeclaredSkip(node: CallExpression): boolean {
  const [first, second] = node.arguments;
  if (!first) return true;
  if (second && (second.type === 'ArrowFunctionExpression' || second.type === 'FunctionExpression')) return true;
  // A title, however spelled, including a template with substitutions.
  if (first.type === 'TemplateLiteral') return true;
  // Of the nodes that can stand here, only a string literal carries a string `value`.
  if (typeof (first as { value?: unknown }).value === 'string') return true;
  return constantValue(first)?.value === true;
}

/**
 * The value of a literal, or of `!`, `-` or `+` applied to one, as a truthiness: `skipIf(true)`,
 * `runIf(!0)`, `test.skip(!0)`. `undefined` when the node is not constant.
 */
function constantValue(node: EsNode | undefined): { value: boolean } | undefined {
  if (!node) return undefined;
  if (node.type === 'Literal') return { value: Boolean(node.value) };
  // Only a unary operator over a constant gets past here: on any other node `argument` is missing
  // or not constant, and `inner` is undefined.
  const inner = constantValue((node as { argument?: EsNode }).argument);
  if (!inner) return undefined;
  const { operator } = node as UnaryExpression;
  if (operator === '!') return { value: !inner.value };
  // `-1` and `+1` keep their operand's truthiness; `~0` (-1) and `void 1` do not, so they are
  // not read as constants.
  if (operator === '-' || operator === '+') return inner;
  return undefined;
}
