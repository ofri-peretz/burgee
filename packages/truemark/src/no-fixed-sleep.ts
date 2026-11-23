/**
 * `no-fixed-sleep`: a test that waits a fixed time instead of for the thing it needs is slow
 * where the guess is long and flaky where it is short. Test files only.
 */
import type { SourceCode } from 'eslint';
import type { CallExpression, Identifier, NewExpression, Node as EsNode } from 'estree';

import { defineRule, message } from './rule.js';
import { binding, isTestFile, memberName, type Node } from './test-api.js';

const SLEEP_HELPERS: ReadonlySet<string> = new Set(['sleep', 'delay', 'wait', 'pause']);
const TIMER_PROMISES: ReadonlySet<string> = new Set(['timers/promises', 'node:timers/promises']);

export const noFixedSleep = defineRule('no-fixed-sleep', {
  description: 'Disallow fixed-duration sleeps in tests; await the event or condition instead',
  messages: {
    fixedSleep: message(
      'Fixed sleep in a test',
      'The test waits a fixed {{how}} instead of for the thing it needs, so it is slow where the guess is long and flaky where it is short',
      'await the event or condition itself: the promise the code returns, an emitted event (events.once), a polling assertion (vi.waitFor, expect.poll, Playwright expect(locator).toBeVisible()), or fake timers (vi.advanceTimersByTimeAsync) for timer-driven code.',
    ),
  },
  create(context) {
    if (!isTestFile(context.filename)) return {};
    const { sourceCode } = context;
    return {
      NewExpression(node) {
        if (isPromiseTimeout(node, sourceCode)) context.report({ node, messageId: 'fixedSleep', data: { how: 'setTimeout' } });
      },
      CallExpression(node) {
        const how = sleepKind(node as CallExpression & Node, sourceCode);
        if (how) context.report({ node, messageId: 'fixedSleep', data: { how } });
      },
    };
  },
});

/** `new Promise((resolve) => setTimeout(resolve, n))` and its spellings. */
function isPromiseTimeout(node: NewExpression, sourceCode: SourceCode): boolean {
  if (node.callee.type !== 'Identifier' || node.callee.name !== 'Promise') return false;
  const [executor] = node.arguments;
  if (!executor || (executor.type !== 'ArrowFunctionExpression' && executor.type !== 'FunctionExpression')) return false;
  const [resolve] = executor.params;
  if (!resolve || resolve.type !== 'Identifier') return false;
  const call = onlyExpression(executor.body);
  if (call?.type !== 'CallExpression') return false;
  if (call.callee.type !== 'Identifier' || call.callee.name !== 'setTimeout') return false;
  if (binding(call.callee, sourceCode).kind !== 'global') return false;
  return callsBack(call.arguments[0], resolve.name);
}

/** The single expression a function body evaluates, if that is all it does. */
function onlyExpression(body: EsNode): EsNode | undefined {
  if (body.type !== 'BlockStatement') return body;
  const [statement] = body.body;
  if (body.body.length !== 1 || statement?.type !== 'ExpressionStatement') return undefined;
  return statement.expression;
}

/** `resolve` itself, or `() => resolve()`. */
function callsBack(arg: EsNode | undefined, name: string): boolean {
  if (!arg) return false;
  if (arg.type === 'Identifier') return arg.name === name;
  if (arg.type !== 'ArrowFunctionExpression' && arg.type !== 'FunctionExpression') return false;
  const inner = onlyExpression(arg.body);
  return inner?.type === 'CallExpression' && inner.callee.type === 'Identifier' && inner.callee.name === name;
}

function importedFrom(id: Identifier, sourceCode: SourceCode): string | undefined {
  const bound = binding(id, sourceCode);
  if (bound.kind !== 'import' || !TIMER_PROMISES.has(bound.module)) return undefined;
  return bound.name;
}

function sleepKind(node: CallExpression & Node, sourceCode: SourceCode): string | undefined {
  const { callee } = node;
  if (callee.type === 'MemberExpression') {
    const method = memberName(callee);
    if (method === 'waitForTimeout') return 'waitForTimeout()';
    if (method !== 'wait' || callee.object.type !== 'Identifier') return undefined;
    if (callee.object.name === 'cy' && isNumber(node.arguments[0])) return 'cy.wait()';
    if (importedFrom(callee.object, sourceCode) === 'scheduler') return 'scheduler.wait()';
    return undefined;
  }
  if (callee.type !== 'Identifier') return undefined;
  if (importedFrom(callee, sourceCode) === 'setTimeout') return 'setTimeout() from timers/promises';
  if (SLEEP_HELPERS.has(callee.name) && node.parent?.type === 'AwaitExpression' && isNumber(node.arguments[0])) return `${callee.name}()`;
  return undefined;
}

/** A numeric literal, or arithmetic over numeric literals: `500`, `2 * 1000`. */
function isNumber(node: EsNode | undefined): boolean {
  if (!node) return false;
  if (node.type === 'Literal') return typeof node.value === 'number';
  if (node.type === 'BinaryExpression') return isNumber(node.left) && isNumber(node.right);
  return false;
}
