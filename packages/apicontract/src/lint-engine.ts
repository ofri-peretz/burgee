/**
 * `apicontract lint`'s engine (apicontract-lint spec.md R1–R4, R8): rules are data, a ruleset maps
 * rule ids to levels, and a run applies every rule that is not `off` to every input, in rule-id
 * order. No rule sees another rule's output. Every finding names its rule, its level, a pointer and
 * a `fix:` line; every run also says how many nodes each rule checked, so a clean run is a count
 * and not only "0 problems" (R3).
 */
import { type Contract } from './core/model.js';
import { applyCode, type CodeIndex, type Handler, NO_HANDLER_FIX, NOT_FOUND_FIX } from './lint-code.js';
import { apply, type FunctionName } from './lint-functions.js';
import { CODE_FUNCTIONS, type CodeFunctionName, type ThenName } from './lint-names.js';
import { type Given, type LintNode, select } from './lint-select.js';

export const LEVELS = ['error', 'warn', 'off'] as const;
export type Level = (typeof LEVELS)[number];

export interface Then {
  /** A member of the node, dotted for a nested one (`info.description`); the node itself when absent. */
  readonly field?: string;
  readonly function: ThenName;
  readonly functionOptions?: Readonly<Record<string, unknown>>;
}

export interface LintContext {
  readonly contract: Contract;
}

export interface Rule {
  readonly description: string;
  readonly given: Given;
  /** What must hold, by the built-in functions; every entry must. */
  readonly then?: Then | readonly Then[];
  /** What must hold, when no built-in function says it: the problems on one node, each a message. Pure. */
  readonly check?: (node: LintNode, context: LintContext) => readonly string[];
  readonly fix: string;
  /**
   * A document and exactly what the rule finds on it (R4): the rule's own test, which the
   * conformance suite runs. Required of a rule a plugin contributes.
   */
  readonly sample?: RuleSample;
}

/** Where a rule finds a problem on its sample, and what it says. */
export interface SampleFinding {
  readonly pointer: string;
  readonly message: string;
}

export interface RuleSample {
  readonly document: unknown;
  readonly findings: readonly SampleFinding[];
}

export interface LintFinding {
  readonly rule: string;
  readonly level: Exclude<Level, 'off'>;
  readonly file: string;
  readonly pointer: string;
  readonly message: string;
  readonly fix: string;
  /** For a rule on code (R14): the handler's line, the finding's location; `file` and `pointer` are the spec's, related. */
  readonly code?: { readonly file: string; readonly line: number };
}

/** How a rule did on one run: the nodes it looked at and how many failed. */
export interface RuleCount {
  readonly checked: number;
  readonly failed: number;
}

/** The operations a run lints in full: their ids, and their pointers for a node that names no operation. */
export interface Touched {
  readonly ids: ReadonlySet<string>;
  readonly sources: readonly string[];
}

/** A pointer at or under `source`: the operation's own node, or one of its members. */
const under = (pointer: string, source: string): boolean => pointer === source || pointer.startsWith(`${source}/`);

/** Whether a node belongs to a touched operation: by its operation, else by where it is. */
export const touches = (touched: Touched, node: LintNode): boolean =>
  node.operation === undefined ? touched.sources.some((source) => under(node.pointer, source)) : touched.ids.has(node.operation.id);

export interface LintInput {
  readonly file: string;
  readonly contract: Contract;
  /** With `--since` (R12): the operations linted in full; a node of any other runs only `lint.legacy`. */
  readonly touched?: Touched;
  /** The handlers the user owns, for the rules on code (R14); none when absent. */
  readonly code?: CodeIndex;
}

export interface LintResult {
  /** Sorted by level (error first), then file, pointer and rule. */
  readonly findings: readonly LintFinding[];
  readonly counts: Readonly<Record<string, RuleCount>>;
  readonly inputs: readonly string[];
}

/** A member of a value by a dotted path; `undefined` where the path leaves the value. */
const fieldOf = (value: unknown, field: string | undefined): unknown =>
  field === undefined ? value : field.split('.').reduce<unknown>((at, key) => (typeof at === 'object' && at !== null ? (at as Record<string, unknown>)[key] : undefined), value);

/** A rule's `then`, as a list. */
const thensOf = (rule: Rule): readonly Then[] => {
  // Stryker disable next-line ArrayDeclaration: equivalent, a `then` that names no function finds nothing
  if (rule.then === undefined) return [];
  return Array.isArray(rule.then) ? (rule.then as readonly Then[]) : [rule.then as Then];
};

/** A `then`'s problem, if any, named by the field it read. */
const named = (then: Then, problem: string | undefined): string[] => {
  if (problem === undefined) return [];
  return [then.field === undefined ? problem : `\`${then.field}\` ${problem}`];
};

const isCode = (name: ThenName): name is CodeFunctionName => (CODE_FUNCTIONS as readonly string[]).includes(name);

/** One `then` on one node: what is wrong, named by the field it read. */
const problemOf = (then: Then, node: LintNode): string[] => {
  // A code function on a node that is not a handler is refused where the rule is read; here it finds nothing.
  // Stryker disable next-line ConditionalExpression: a value function by a code function's name finds nothing either; the check says so in the types.
  if (isCode(then.function)) return [];
  return named(then, apply(then.function, fieldOf('matched' in node ? node.matched : node.value, then.field), then.functionOptions as Record<string, unknown> | undefined));
};

/** What is wrong with one node under one rule, each a message. */
export const problemsOf = (rule: Rule, node: LintNode, context: LintContext): string[] => [
  ...thensOf(rule).flatMap((then) => problemOf(then, node)),
  ...(rule.check?.(node, context) ?? []),
];

const RANK: Readonly<Record<Exclude<Level, 'off'>, number>> = { error: 0, warn: 1 };

/** One rule to run: its id, its level, and whether it is one `lint.legacy` names (R12). */
interface Run {
  readonly id: string;
  readonly rule: Rule;
  readonly level: Exclude<Level, 'off'>;
  readonly legacy: boolean;
}

/** The nodes a rule checks on one input: under `--since`, only a touched operation's, unless the rule is a legacy one. */
const nodesOf = (input: LintInput, run: Run): LintNode[] => {
  const nodes = select(input.contract, run.rule.given);
  const { touched } = input;
  return run.legacy || touched === undefined ? nodes : nodes.filter((node) => touches(touched, node));
};

/** One thing a rule checked: where, what is wrong with it, and, for a handler, its line and its own fix. */
interface Check {
  readonly pointer: string;
  /** What each message is about: a property's or a parameter's name, a handler's symbol. */
  readonly name?: string | undefined;
  readonly problems: readonly string[];
  readonly fix?: string;
  readonly code?: { readonly file: string; readonly line: number };
}

/** What every `then` finds on one handler: a code function reads it, a value function reads its summary. */
const handlerProblems = (rule: Rule, handler: Handler, contract: Contract): string[] =>
  thensOf(rule).flatMap((then) => {
    const options = (then.functionOptions ?? {}) as Readonly<Record<string, unknown>>;
    const problem = isCode(then.function) ? applyCode(then.function, handler, contract, options) : apply(then.function, fieldOf(handler.summary, then.field), options);
    return named(then, problem);
  });

/** A rule on code over one operation: each handler the map names for it, or what is missing (R14, R15). */
const codeChecks = (rule: Rule, node: LintNode, input: LintInput): Check[] => {
  const operation = node.operation as NonNullable<LintNode['operation']>;
  const handlers = input.code?.handlersOf(operation.id) ?? [];
  if (handlers.length === 0) {
    return [{ pointer: node.pointer, problems: [`map-has-no-handler: \`${operation.id}\` has no handler you own in apicontract.map.json`], fix: NO_HANDLER_FIX }];
  }
  return handlers.map((handler): Check => {
    const where = { pointer: node.pointer, name: handler.symbol };
    if (handler.summary === undefined) return { ...where, problems: [`handler-not-found: ${handler.missing as string}`], fix: NOT_FOUND_FIX };
    return { ...where, problems: handlerProblems(rule, handler, input.contract), code: { file: handler.file, line: handler.line as number } };
  });
};

/** Everything one rule checks on one input. */
const checksOf = (input: LintInput, run: Run): Check[] =>
  nodesOf(input, run).flatMap((node) =>
    run.rule.given.implementation === true ? codeChecks(run.rule, node, input) : [{ pointer: node.pointer, name: node.name, problems: problemsOf(run.rule, node, { contract: input.contract }) }],
  );

/** A check's problems as findings of one rule on one input. */
const findingsOf = (check: Check, of: Pick<LintFinding, 'rule' | 'level' | 'file' | 'fix'>): LintFinding[] =>
  check.problems.map((message) => ({
    ...of,
    pointer: check.pointer,
    message: check.name === undefined ? message : `${check.name}: ${message}`,
    fix: check.fix ?? of.fix,
    ...(check.code === undefined ? {} : { code: check.code }),
  }));

/** One rule over every input: its findings, and how many nodes it checked and failed. */
const runRule = (run: Run, inputs: readonly LintInput[]): { findings: LintFinding[]; count: RuleCount } => {
  const { id, rule, level } = run;
  const findings: LintFinding[] = [];
  let checked = 0;
  let failed = 0;
  for (const input of inputs) {
    for (const check of checksOf(input, run)) {
      checked += 1;
      if (check.problems.length > 0) failed += 1;
      findings.push(...findingsOf(check, { rule: id, level, file: input.file, fix: rule.fix }));
    }
  }
  return { findings, count: { checked, failed } };
};

/**
 * Run `rules` at `levels` over every input. A rule at `off`, or absent from `levels`, is not run.
 * On an input with `touched`, only the rules in `legacy` see the untouched operations (R12).
 */
export const lint = (
  inputs: readonly LintInput[],
  rules: Readonly<Record<string, Rule>>,
  levels: Readonly<Record<string, Level>>,
  legacy: ReadonlySet<string> = new Set(),
): LintResult => {
  const runs = Object.entries(levels)
    .flatMap(([id, level]) => {
      const rule = new Map(Object.entries(rules)).get(id);
      return level === 'off' || rule === undefined ? [] : [{ id, ...runRule({ id, rule, level, legacy: legacy.has(id) }, inputs) }];
    })
    .sort((a, b) => a.id.localeCompare(b.id, 'en'));
  const findings = runs.flatMap((run) => run.findings);
  findings.sort((a, b) => RANK[a.level] - RANK[b.level] || a.file.localeCompare(b.file, 'en') || a.pointer.localeCompare(b.pointer, 'en') || a.rule.localeCompare(b.rule, 'en'));
  return { findings, counts: Object.fromEntries(runs.map((run) => [run.id, run.count])), inputs: inputs.map((input) => input.file) };
};

/** What one rule finds on one contract, as a sample states it: pointer and message, in pointer order. */
export const findingsOn = (rule: Rule, contract: Contract): SampleFinding[] =>
  // Stryker disable next-line StringLiteral: equivalent, the file name and the level are dropped from what this returns
  lint([{ file: 'sample', contract }], { rule }, { rule: 'warn' }).findings.map(({ pointer, message }) => ({ pointer, message }));
