/**
 * `diff --usage <file>` (contractdiff-compat-depth R3): a breaking change nobody uses breaks nobody.
 * The file says which operations, and which of their members, callers use, as a schema registry
 * with usage data does; it is data the user hands in, never collected here.
 *
 * Two shapes are read: `{ "operations": { "<id>": { "members"?: [...], "callers"?: [...] } } }`, and
 * an `apicontract.map.json` from a client generation, whose files are the callers. A member is a
 * parameter's name or a property's path (`owner.id`); an operation with no `members` uses all of them.
 */
import { type Comparison, type Finding, overall, sortFindings, summaryOf } from './diff-contract.js';
import { UsageError } from './run-config.js';

export interface OperationUsage {
  /** The members used; absent, every member is. */
  readonly members?: readonly string[];
  /** Who calls it: files, services, whatever the file names. */
  readonly callers?: readonly string[];
}

export type Usage = ReadonlyMap<string, OperationUsage>;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isStrings = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === 'string');

const SHAPE = 'fix: pass JSON shaped { "operations": { "<operationId>": { "members": ["name"], "callers": ["web"] } } }, or an apicontract.map.json';

/** One operation's entry: a usage object, or a contract map's list of generated symbols. */
const entryOf = (file: string, id: string, value: unknown): OperationUsage => {
  if (Array.isArray(value)) {
    const files = value.filter((item): item is { file: string } => isRecord(item) && typeof item.file === 'string').map((item) => item.file);
    return { callers: [...new Set(files)].sort() };
  }
  if (!isRecord(value) || (value.members !== undefined && !isStrings(value.members)) || (value.callers !== undefined && !isStrings(value.callers))) {
    throw new UsageError(`${file}: operation \`${id}\` is not an object of string lists. ${SHAPE}`);
  }
  return { ...(value.members === undefined ? {} : { members: value.members }), ...(value.callers === undefined ? {} : { callers: value.callers }) };
};

/** The usage a file says, by operation id. */
export const parseUsage = (text: string, file: string): Usage => {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new UsageError(`${file} is not JSON: ${(error as Error).message}. ${SHAPE}`);
  }
  if (!isRecord(value) || !isRecord(value.operations)) throw new UsageError(`${file} has no \`operations\` object. ${SHAPE}`);
  return new Map(Object.entries(value.operations).map(([id, entry]) => [id, entryOf(file, id, entry)]));
};

/** A JSON Pointer token read back: `~1` is `/`, `~0` is `~`. */
const untoken = (token: string): string => token.replaceAll('~1', '/').replaceAll('~0', '~');

/** The member a finding is about: the parameter's name, then each property down its pointer; empty for the whole payload. */
export const memberOf = (finding: Pick<Finding, 'payload' | 'pointer'>): string[] => {
  const parameter = finding.payload?.startsWith('param:') === true ? [finding.payload.split(':').slice(2).join(':')] : [];
  const tokens = finding.pointer.split('/');
  const properties: string[] = [];
  // Stryker disable next-line NumericLiteral: equivalent, the first token of a pointer is always the empty one before its `/`
  for (let index = 0; index + 1 < tokens.length; index += 1) {
    // A property's name follows `properties`, and is never itself a keyword.
    if (tokens[index] === 'properties') properties.push(untoken(tokens[(index += 1)] as string));
  }
  return [...parameter, ...properties];
};

/** Whether two member paths touch: one is the other, or lies under it. Their common length agrees, whichever is longer. */
const touches = (a: readonly string[], b: readonly string[]): boolean => a.slice(0, b.length).every((part, index) => part === b[index]);

/** Whether an operation's usage covers a finding's member. */
const isUsed = (finding: Finding, entry: OperationUsage): boolean => {
  if (entry.members === undefined) return true;
  const member = memberOf(finding);
  return entry.members.some((used) => touches(member, used.split('.')));
};

/** One finding under the usage: an unused breaking one is non-breaking, a used one names its callers. */
const withUsage = (finding: Finding, usage: Usage): Finding => {
  if (finding.verdict !== 'breaking') return finding;
  const entry = usage.get(finding.operation);
  if (entry === undefined || !isUsed(finding, entry)) return { ...finding, verdict: 'non-breaking', note: 'unused', fix: 'nothing to do: the usage file names no caller of it' };
  const callers = entry.callers ?? [];
  return callers.length === 0 ? finding : { ...finding, usedBy: callers };
};

/** `comparison` with its findings judged against who uses what. */
export const applyUsage = <C extends Comparison>(comparison: C, usage: Usage): C => {
  const findings = sortFindings(comparison.findings.map((finding) => withUsage(finding, usage)));
  const summary = summaryOf(findings);
  return { ...comparison, findings, summary, verdict: overall(summary) };
};
