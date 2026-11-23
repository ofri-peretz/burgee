/**
 * `no-test-retry`: retries turn an intermittent failure into a pass, hiding the flakiness the
 * test exists to report. Allowed when a comment cites the decision or issue that permits them.
 */
import type { SourceCode } from 'eslint';
import type { CallExpression, Node as EsNode, Property } from 'estree';

import { defineRule, message } from './rule.js';
import { binding, calleeChain, cited, isTestApi, justification, memberName, type Node } from './test-api.js';

const RETRY_KEYS: ReadonlySet<string> = new Set(['retry', 'retries']);
const CONFIG_FILE = /(?:^|[\\/])(?:vitest|vite|jest|playwright)(?:\.[\w-]+)*\.config\.[cm]?[jt]s$|(?:^|[\\/])vitest\.workspace\.[cm]?[jt]s$/;
const CONFIG_CALLS: ReadonlySet<string> = new Set(['defineConfig', 'defineProject', 'defineWorkspace', 'mergeConfig']);

export const noTestRetry = defineRule('no-test-retry', {
  description: 'Disallow test retries unless a comment cites the decision or issue that allows them',
  messages: {
    testRetry: message(
      'Test retry',
      'Retries turn an intermittent failure into a pass, hiding the flakiness the test exists to report',
      'remove the retry and fix the cause of the flake (a race, shared state, a fixed sleep, an unmocked clock or network). If the retry is a deliberate policy, cite the decision id (D-…) or issue URL in a comment on this line or the line above.',
    ),
  },
  create(context) {
    const configFile = CONFIG_FILE.test(context.filename);
    const { sourceCode } = context;
    const explained = (node: EsNode): boolean => cited(justification(node, sourceCode, ''));
    return {
      Property(node) {
        if (!RETRY_KEYS.has(keyName(node) ?? '')) return;
        if (isZero(node.value)) return;
        if (!configFile && !inRetryContext(node as Property & Node, sourceCode)) return;
        if (explained(node)) return;
        context.report({ node, messageId: 'testRetry' });
      },
      CallExpression(node) {
        if (!isRetryCall(node, sourceCode)) return;
        if (isZero(node.arguments[0])) return;
        if (explained(node)) return;
        context.report({ node, messageId: 'testRetry' });
      },
    };
  },
});

/** `retry`, `'retry'` and `['retry']` as an object key. */
function keyName(node: Property): string | undefined {
  const { key } = node;
  if (!node.computed && key.type === 'Identifier') return key.name;
  if (key.type === 'Literal' && typeof key.value === 'string') return key.value;
  return undefined;
}

function isZero(node: EsNode | undefined): boolean {
  return node?.type === 'Literal' && node.value === 0;
}

/**
 * The property sits in an object passed to a test-runner call or a config factory, at any depth
 * (`defineConfig({ test: { retry: 2 } })`).
 */
function inRetryContext(node: EsNode & Node, sourceCode: SourceCode): boolean {
  // Always has one: a property sits in an object, and `Program` ends the walk below.
  const parent = node.parent as Node;
  if (parent.type === 'CallExpression') {
    const chain = calleeChain(parent.callee);
    if (!chain) return false;
    if (CONFIG_CALLS.has(chain.root.name) && chain.path.length === 0) return true;
    return isTestApi(chain.root, sourceCode);
  }
  if (parent.type !== 'ObjectExpression' && parent.type !== 'Property' && parent.type !== 'ArrayExpression') return false;
  return inRetryContext(parent, sourceCode);
}

/** `jest.retryTimes(n)` and mocha's `this.retries(n)`. */
function isRetryCall(node: CallExpression, sourceCode: SourceCode): boolean {
  const { callee } = node;
  if (callee.type !== 'MemberExpression') return false;
  const method = memberName(callee);
  if (method === 'retries') return callee.object.type === 'ThisExpression';
  if (method !== 'retryTimes' || callee.object.type !== 'Identifier' || callee.object.name !== 'jest') return false;
  const bound = binding(callee.object, sourceCode);
  return bound.kind === 'global' || (bound.kind === 'import' && bound.module === '@jest/globals');
}
