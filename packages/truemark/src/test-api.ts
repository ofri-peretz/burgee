/**
 * The one model of "is this call a test-runner API" every rule reads.
 *
 * A callee counts when its root identifier is a test-runner name AND that name is either an
 * unbound global (vitest `globals: true`, jest, mocha) or a binding imported from a test-runner
 * module. A local `const it = …` or an `it` imported from anywhere else is somebody else's
 * function and is never read as a test.
 */
import type { Rule, Scope, SourceCode } from 'eslint';
import type { Identifier, ImportDeclaration, MemberExpression, Node as EsNode, SourceLocation } from 'estree';

/** Names that declare a test, a suite or a benchmark. */
export const TEST_ROOTS: ReadonlySet<string> = new Set([
  'it',
  'test',
  'describe',
  'suite',
  'context',
  'bench',
  'xit',
  'xtest',
  'xdescribe',
  'xcontext',
  'fit',
  'ftest',
  'fdescribe',
]);

/** Modules whose exports are test-runner APIs. */
export const TEST_MODULES: ReadonlySet<string> = new Set(['vitest', '@jest/globals', '@playwright/test', 'node:test', 'bun:test', 'mocha']);

/** A node as ESLint hands it to a listener: with its parent. */
export type Node = EsNode & { parent?: Node };

/**
 * The receiver chain of a callee, root first: `test.describe.only` → `['test', 'describe',
 * 'only']`. `null` for anything that is not a plain identifier/member chain, including computed
 * keys that are not string literals (`it['only']` is read, `it[name]` is not).
 */
export interface CalleeChain {
  root: Identifier;
  path: string[];
  /** The chain passed through a call: `it.each(table)` in `it.each(table)('x', fn)`. */
  throughCall: boolean;
}

/** The static name of a member's property: `a.b` and `a['b']` → `'b'`, `a[b]` → `null`. */
export function memberName(member: MemberExpression): string | null {
  const { property } = member;
  if (!member.computed && property.type === 'Identifier') return property.name;
  if (member.computed && property.type === 'Literal' && typeof property.value === 'string') return property.value;
  return null;
}

export function calleeChain(callee: EsNode): CalleeChain | null {
  const path: string[] = [];
  let current: EsNode = callee;
  while (current.type === 'MemberExpression') {
    const name = memberName(current);
    if (name === null) return null;
    path.unshift(name);
    current = current.object;
  }
  // `it.each([...])('name', fn)`: the call's callee is itself a call.
  if (current.type === 'CallExpression') {
    const inner = calleeChain(current.callee);
    if (!inner) return null;
    return { root: inner.root, path: [...inner.path, ...path], throughCall: true };
  }
  if (current.type !== 'Identifier') return null;
  return { root: current, path, throughCall: false };
}

/** Walk up the scope chain for a variable by name. */
export function lookup(name: string, scope: Scope.Scope | null): Scope.Variable | undefined {
  for (let current = scope; current; current = current.upper) {
    const variable = current.set.get(name);
    if (variable) return variable;
  }
  return undefined;
}

/** The name an import binding was imported under, or `'default'` for a default import. */
function importedName(specifier: EsNode): string {
  if (specifier.type !== 'ImportSpecifier') return 'default';
  const { imported } = specifier;
  return imported.type === 'Identifier' ? imported.name : String(imported.value);
}

/** What a name is bound to: nothing (an unbound global), a local, or an import. */
export type Binding = { kind: 'global' } | { kind: 'local' } | { kind: 'import'; module: string; name: string };

/** Where `id` comes from: the module and imported name for an import. */
export function binding(id: Identifier, sourceCode: SourceCode): Binding {
  const variable = lookup(id.name, sourceCode.getScope(id));
  const def = variable?.defs[0];
  if (!def) return { kind: 'global' };
  if (def.type !== 'ImportBinding') return { kind: 'local' };
  const declaration = def.parent as ImportDeclaration;
  return { kind: 'import', module: String(declaration.source.value), name: importedName(def.node) };
}

/**
 * Whether `identifier` names a test-runner API: an unbound global, or an import from one of
 * {@link TEST_MODULES}. The imported name is what counts, so `import { test as it } from
 * 'vitest'` reads as a test and `import { it } from './my-iterators'` does not.
 */
export function isTestApi(identifier: Identifier, sourceCode: SourceCode): boolean {
  const bound = binding(identifier, sourceCode);
  if (bound.kind === 'global') return TEST_ROOTS.has(identifier.name);
  if (bound.kind === 'local' || !TEST_MODULES.has(bound.module)) return false;
  // `import test from '@playwright/test'`: Playwright's default export is `test`.
  return bound.name === 'default' || TEST_ROOTS.has(bound.name);
}

/** `foo.test.ts`, `foo.spec.mjs`, `__tests__/…`, `e2e/…`, `tests/…`. */
const TEST_FILE = /(?:\.(?:test|spec|e2e|bench)\.[cm]?[jt]sx?$)|(?:(?:^|[\\/])(?:__tests__|tests?|e2e|specs?)[\\/])/;

export function isTestFile(filename: string): boolean {
  return TEST_FILE.test(filename);
}

/** An issue or pull-request URL, or a Jira / Linear style key in a URL. */
const ISSUE_URL = /https?:\/\/\S+\/(?:issues|pull|pulls|merge_requests|browse|issue)\/[\w-]+/i;
/** A repo decision id: `D-107`, `D-20261123-slug`. */
const DECISION_ID = /\bD-\d+(?:-[\w-]+)?\b/;
const DATE = /\b\d{4}-\d{2}-\d{2}\b/;

export type Justification = { kind: 'issue' } | { kind: 'decision' } | { kind: 'until'; date: string; expired: boolean } | { kind: 'none' };

/**
 * What the comments on the node's first line, or the line above it, say for it. `today` is
 * `YYYY-MM-DD`; a date on or after it is still in force.
 */
export function justification(node: EsNode, sourceCode: SourceCode, today: string): Justification {
  // ESLint locates every node and comment it parses; `loc` is optional only in the ESTree type.
  const { line } = (node.loc as SourceLocation).start;
  const texts = sourceCode
    .getAllComments()
    .filter((c) => {
      const end = (c.loc as SourceLocation).end.line;
      return end === line || end === line - 1;
    })
    .map((c) => c.value);
  if (texts.some((t) => ISSUE_URL.test(t))) return { kind: 'issue' };
  if (texts.some((t) => DECISION_ID.test(t))) return { kind: 'decision' };
  for (const text of texts) {
    const match = DATE.exec(text);
    if (match) return { kind: 'until', date: match[0], expired: match[0] < today };
  }
  return { kind: 'none' };
}

/** Whether a justification excuses the finding outright (an issue or a decision). */
export function cited(why: Justification): boolean {
  return why.kind === 'issue' || why.kind === 'decision';
}

/** `YYYY-MM-DD`: the date part of an ISO timestamp. */
const ISO_DATE_LENGTH = 10;

/** Today as `YYYY-MM-DD`, in UTC. */
export function todayUtc(): string {
  return new Date().toISOString().slice(0, ISO_DATE_LENGTH);
}

export type Context = Rule.RuleContext;
