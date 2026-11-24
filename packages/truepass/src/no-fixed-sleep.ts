/**
 * `no-fixed-sleep`: a test that waits a fixed time instead of for the thing it needs is slow
 * where the guess is long and flaky where it is short. Test files only. A zero or omitted delay
 * (`setTimeout(r, 0)`, `setTimeout(r)`) is a tick, not a guess: it yields to queued work once,
 * as a flush inside React's `act()` does, so it is not reported.
 */
import type { SourceCode } from 'eslint';
import type { CallExpression, Identifier, MemberExpression, NewExpression, Node as EsNode } from 'estree';

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
        if (how && !isTick(node.arguments[0])) context.report({ node, messageId: 'fixedSleep', data: { how } });
      },
    };
  },
});

/** `new Promise((resolve) => setTimeout(resolve, n))` and its spellings. */
function isPromiseTimeout(node: NewExpression, sourceCode: SourceCode): boolean {
  // Stryker disable next-line ConditionalExpression,EqualityOperator,StringLiteral: only an identifier has a `name` that could be 'Promise'
  if (node.callee.type !== 'Identifier') return false;
  if (node.callee.name !== 'Promise') return false;
  const [executor] = node.arguments;
  if (!executor || (executor.type !== 'ArrowFunctionExpression' && executor.type !== 'FunctionExpression')) return false;
  const [resolve] = executor.params;
  if (!resolve) return false;
  // Stryker disable next-line ConditionalExpression,EqualityOperator,StringLiteral: a pattern parameter has no `name`, so `callsBack` refuses it either way
  if (resolve.type !== 'Identifier') return false;
  const call = onlyExpression(executor.body);
  if (call?.type !== 'CallExpression') return false;
  // Stryker disable next-line ConditionalExpression,EqualityOperator,StringLiteral: only an identifier has a `name` that could be 'setTimeout'
  if (call.callee.type !== 'Identifier') return false;
  if (call.callee.name !== 'setTimeout') return false;
  if (binding(call.callee, sourceCode).kind !== 'global') return false;
  return callsBack(call.arguments[0], resolve.name) && !isTick(call.arguments[1]);
}

/** A delay of `0` or none at all: one turn of the event loop, not a guess at how long to wait. */
function isTick(delay: EsNode | undefined): boolean {
  // Only a literal carries its value; any other delay is one this rule cannot read as zero.
  return delay?.type === 'Literal' ? delay.value === 0 : delay === undefined;
}

/** The single expression a function body evaluates, if that is all it does. */
function onlyExpression(body: EsNode): EsNode | undefined {
  if (body.type !== 'BlockStatement') return body;
  if (body.body.length !== 1) return undefined;
  // Only an expression statement has an `expression`; `return;` and the rest give undefined.
  return (body.body[0] as { expression?: EsNode }).expression;
}

/** `resolve` itself, or `() => resolve()`. */
function callsBack(arg: EsNode | undefined, name: string): boolean {
  if (!arg) return false;
  if (arg.type === 'Identifier') return arg.name === name;
  if (arg.type !== 'ArrowFunctionExpression' && arg.type !== 'FunctionExpression') return false;
  const inner = onlyExpression(arg.body);
  // Stryker disable next-line ConditionalExpression: only an identifier callee has a `name` to compare
  return inner?.type === 'CallExpression' && inner.callee.type === 'Identifier' && inner.callee.name === name;
}

function importedFrom(id: Identifier, sourceCode: SourceCode): string | undefined {
  const bound = binding(id, sourceCode);
  // Stryker disable next-line ConditionalExpression,LogicalOperator,EqualityOperator,StringLiteral: a global or local binding has no module, so TIMER_PROMISES refuses it either way
  if (bound.kind !== 'import' || !TIMER_PROMISES.has(bound.module)) return undefined;
  return bound.name;
}

/** `page.waitForTimeout(n)`, `cy.wait(n)` and `scheduler.wait(n)` from timers/promises. */
function memberSleep(node: CallExpression, callee: MemberExpression, sourceCode: SourceCode): string | undefined {
  const method = memberName(callee);
  if (method === 'waitForTimeout') return 'waitForTimeout()';
  if (method !== 'wait') return undefined;
  // Stryker disable next-line ConditionalExpression,EqualityOperator,StringLiteral: a receiver that is not an identifier is neither `cy` nor an import
  if (callee.object.type !== 'Identifier') return undefined;
  if (callee.object.name === 'cy' && isNumber(node.arguments[0])) return 'cy.wait()';
  if (importedFrom(callee.object, sourceCode) === 'scheduler') return 'scheduler.wait()';
  return undefined;
}

function sleepKind(node: CallExpression & Node, sourceCode: SourceCode): string | undefined {
  const { callee } = node;
  if (callee.type === 'MemberExpression') return memberSleep(node, callee, sourceCode);
  // Stryker disable next-line ConditionalExpression,EqualityOperator,StringLiteral: any other callee (a call, a function) is neither a helper nor an import
  if (callee.type !== 'Identifier') return undefined;
  if (importedFrom(callee, sourceCode) === 'setTimeout') return 'setTimeout() from timers/promises';
  if (SLEEP_HELPERS.has(callee.name) && (node.parent as Node).type === 'AwaitExpression' && isNumber(node.arguments[0]))
    return `${callee.name}()`;
  return undefined;
}

/** A numeric literal, or arithmetic over numeric literals: `500`, `2 * 1000`. */
function isNumber(node: EsNode | undefined): boolean {
  if (!node) return false;
  if (node.type === 'Literal') return typeof node.value === 'number';
  // Stryker disable next-line ConditionalExpression,EqualityOperator,StringLiteral: on any other node `left` is undefined, which is not a number either
  if (node.type === 'BinaryExpression') return isNumber(node.left) && isNumber(node.right);
  return false;
}
