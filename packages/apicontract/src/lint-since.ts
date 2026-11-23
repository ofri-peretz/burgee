/**
 * `lint --since <ref>` (apicontract-lint spec.md R12): forwards-only adoption. The full ruleset
 * runs only on the operations `diff` reports as added or changed since the ref, whatever the
 * verdict; the rest run `lint.legacy` (default: no rules). A member is an operation, so a rule on a
 * shared schema runs when an operation that uses it changed, and the document's own nodes (`info`,
 * a JSONPath outside every operation) count as untouched.
 */
import { type Contract } from './core/model.js';
import { compareContracts } from './diff-contract.js';
import { type LintInput, type Touched } from './lint-engine.js';
import { commitOf, type LintGit, SHORT } from './lint-history.js';

/** The operations of `nu` that are new since `old`, or changed in any way `diff` sees. */
export const touchedOf = (old: Contract, nu: Contract): Touched => {
  const changed = new Set(compareContracts(old, nu).findings.map((finding) => finding.operation));
  const operations = nu.operations.filter((operation) => changed.has(operation.id));
  return { ids: new Set(operations.map((operation) => operation.id)), sources: operations.map((operation) => operation.source) };
};

/** How many of a contract's operations `--since` leaves to `lint.legacy`. */
export const skippedOf = (contract: Contract, touched: Touched): number => contract.operations.filter((operation) => !touched.ids.has(operation.id)).length;

/**
 * What `--since` did, for the coverage line: the ref it read and how many operations it left to
 * `lint.legacy`, or why it linted every operation.
 */
export type Since = { readonly from: string; readonly skipped: number } | { readonly unapplied: string };

export interface SinceRun {
  readonly git: LintGit;
  /** `--since`, or the config's `lint.since`. */
  readonly ref: string;
  /** Each input with its path relative to the folder git runs in. */
  readonly inputs: readonly { readonly input: LintInput; readonly path: string }[];
  /** A document's text read as a contract; `undefined` when no adapter reads it. */
  readonly read: (text: string) => Contract | undefined;
}

/**
 * The inputs with what each touched since the ref. A file that is not at the ref, or that no
 * adapter read there, is new: all of it is linted in full.
 */
export const sinceOf = async (run: SinceRun): Promise<{ readonly inputs: LintInput[]; readonly since: Since }> => {
  const commit = await commitOf(run.git, '--since', run.ref);
  if (commit === undefined) return { inputs: run.inputs.map((each) => each.input), since: { unapplied: 'not a git repository, so every operation is linted' } };
  const inputs = await Promise.all(
    run.inputs.map(async ({ input, path }): Promise<LintInput> => {
      const text = await run.git.show(commit, path);
      // Stryker disable next-line ConditionalExpression: equivalent, `contractAt` reads no contract from no text either
      const old = text === undefined ? undefined : run.read(text);
      return old === undefined ? input : { ...input, touched: touchedOf(old, input.contract) };
    }),
  );
  const skipped = inputs.reduce((sum, input) => sum + (input.touched === undefined ? 0 : skippedOf(input.contract, input.touched)), 0);
  return { inputs, since: { from: `${run.ref} (${commit.slice(0, SHORT)})`, skipped } };
};
