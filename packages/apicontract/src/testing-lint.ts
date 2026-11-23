/**
 * The conformance suite's rules for a plugin's `lint` rules (apicontract-lint R4–R6): a rule finds
 * exactly what its sample says, finds the same thing twice, and reads nothing but what it is
 * given. A rule is synchronous, so a run is a plain call between swapping `fetch` out and back.
 *
 * ponytail: only `fetch` is stubbed. A rule that reads files through an import it made itself is
 * not caught here; the fix line of every other I/O failure says the same thing it would.
 */
import { type Host } from './host.js';
import { findingsOn, type Rule, type SampleFinding } from './lint-engine.js';
import { failureOf, type Failure } from './testing-rules.js';

/** What a rule found on one document, whether it reached for the network, or what it threw. */
type Ran = ({ readonly findings: readonly SampleFinding[] } | { readonly error: unknown }) & { readonly fetched: boolean };

const NO_IO = 'a rule reads only the node and the contract it is given: no network, no files, no model';

/** One run of `rule` on `document`, with `fetch` swapped for one that records the call and refuses it. */
const runOn = (host: Host, rule: Rule, document: unknown): Ran => {
  const real = globalThis.fetch;
  let fetched = false;
  globalThis.fetch = (() => {
    fetched = true;
    // Stryker disable next-line all: equivalent, the call is recorded either way; the refusal only stops the rule there
    throw new Error(NO_IO);
  }) as typeof fetch;
  try {
    return { findings: findingsOn(rule, host.read(document)), fetched };
  } catch (error) {
    return { error, fetched };
  } finally {
    globalThis.fetch = real;
  }
};

const show = (findings: readonly SampleFinding[]): string => JSON.stringify(findings);

/** Every failure of one rule: on its sample, run twice, and on each corpus document, run twice. */
const checkRule = (host: Host, id: string, rule: Rule, corpus: readonly unknown[]): Failure[] => {
  const where = `rule "${id}"`;
  const sample = rule.sample as NonNullable<Rule['sample']>;
  const documents = [{ where: `${where} on its sample`, document: sample.document }, ...corpus.map((document, index) => ({ where: `${where} on corpus document ${String(index)}`, document }))];
  return documents.flatMap(({ where: at, document }, index): Failure[] => {
    const first = runOn(host, rule, document);
    const again = runOn(host, rule, document);
    if (first.fetched || again.fetched) return [{ rule: 'no-io', where: at, message: 'it called fetch', fix: NO_IO }];
    if ('error' in first) return [failureOf('sample', at, first.error, 'make the rule run on any document an adapter reads, without throwing')];
    const failures: Failure[] = [];
    if (index === 0 && show(first.findings) !== show(sample.findings)) {
      failures.push({ rule: 'sample', where: at, message: `it finds ${show(first.findings)}; the sample says ${show(sample.findings)}`, fix: 'make `sample.findings` exactly what the rule finds on `sample.document`, or fix the rule' });
    }
    // Stryker disable next-line StringLiteral: equivalent, a run that threw has no findings, and `show` of none differs from any list
    if ('error' in again || show(again.findings) !== show(first.findings)) {
      failures.push({ rule: 'deterministic', where: at, message: 'two runs found different things', fix: 'remove whatever changes between runs: time, random values, iteration order, state kept between calls' });
    }
    return failures;
  });
};

/** The failures of every rule a plugin contributes. */
export const ruleFailures = (host: Host, rules: Readonly<Record<string, Rule>>, corpus: readonly unknown[]): Failure[] =>
  Object.entries(rules).flatMap(([id, rule]) => checkRule(host, id, rule, corpus));
