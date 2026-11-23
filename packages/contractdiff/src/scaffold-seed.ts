/**
 * `plugin new --kind rules --from <finding.json>` (apicontract-lint R7): the same mistake twice
 * becomes a rule. A finding names a file and a pointer; the seed is that document, the kind of node
 * at the pointer, and a rule that flags exactly that node, with what it finds there as its sample.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { readInput } from './command-lint.js';
import { findingsOn, type Rule } from './lint-engine.js';
import { select, SELECTS } from './lint-select.js';
import { UsageError } from './run-config.js';
import { type RuleSeed } from './scaffold.js';

const SHAPE = 'fix: pass one finding from `contractdiff lint --json`, shaped { "file", "pointer", "message", "fix" }, or the whole output';

/** An object to read members of; an array reads as one with no `file`, so it is refused all the same. */
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/** The finding a file holds: the object itself, or the first of a lint run's `findings`. */
const findingOf = (text: string, from: string): Record<string, unknown> => {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new UsageError(`${from} is not JSON: ${(error as Error).message}. ${SHAPE}`);
  }
  const finding = isRecord(value) && Array.isArray(value.findings) ? (value.findings[0] as unknown) : value;
  if (!isRecord(finding) || typeof finding.file !== 'string' || typeof finding.pointer !== 'string' || typeof finding.message !== 'string') {
    throw new UsageError(`${from} holds no finding with a \`file\`, a \`pointer\` and a \`message\`. ${SHAPE}`);
  }
  return finding;
};

/** The seed for a rule from the finding in `from`, its `file` read from `cwd`. */
export const seedOf = (from: string, cwd: string): RuleSeed => {
  let text: string;
  try {
    text = String(readFileSync(resolve(cwd, from)));
  } catch {
    throw new UsageError(`there is no finding file ${from}. fix: save one with \`contractdiff lint <spec> --json > ${from}\``);
  }
  const finding = findingOf(text, from);
  const [file, pointer] = [finding.file as string, finding.pointer as string];
  const { contract } = readInput(file, cwd);
  const [found] = SELECTS.flatMap((kind) => select(contract, { select: kind }).flatMap((node) => (node.pointer === pointer ? [{ kind, node }] : [])));
  if (found === undefined) throw new UsageError(`${file} has no node at ${pointer} a rule can select. fix: lint ${file} again and pass a finding from that run`);
  const { name } = found.node;
  const raw = finding.message as string;
  // The engine names a named node itself, so the seed's message leaves the name off.
  // Stryker disable next-line ConditionalExpression: equivalent, a nameless node's message starts with "undefined: " only by accident
  const message = name !== undefined && raw.startsWith(`${name}: `) ? raw.slice(name.length + 2) : raw;
  const fix = typeof finding.fix === 'string' ? finding.fix : 'say what to change so the node is no longer this mistake';
  const rule: Rule = { description: message, given: { select: found.kind }, check: (node) => (node.pointer === pointer ? [message] : []), fix };
  return { document: contract.document, select: found.kind, pointer, message, fix, findings: findingsOn(rule, contract) };
};
