/**
 * `diff --transitive` (contractdiff-compat-depth R1): the new contract compared with every past
 * release, not only the last one, as a schema registry's `_TRANSITIVE` modes do. A change that
 * breaks a release two versions back breaks the callers still built on it.
 *
 * Each comparison is `compareContracts`'s; their findings are merged by where they are and what
 * they are, keeping the worst verdict and, among equals, the oldest release it is against.
 */
import { type Contract } from './core/model.js';
import { type CompareOptions, type Comparison, compareContracts, type Finding, overall, SEVERITY, sortFindings, summaryOf, type Transitive } from './diff-contract.js';

export interface Release {
  /** What the release is called in output: the path or `git:` spec it was read from. */
  readonly label: string;
  readonly contract: Contract;
}

/** A finding said once, wherever it was found: the change, where, and on which side. */
// Stryker disable next-line StringLiteral: equivalent, any separator keeps two different findings apart
const keyOf = (finding: Finding): string => [finding.id, finding.source, finding.payload ?? '', finding.pointer].join('\n');

/** Whether `a` is a worse verdict than `b`. */
const worse = (a: Finding, b: Finding): boolean => SEVERITY.indexOf(a.verdict) < SEVERITY.indexOf(b.verdict);

/**
 * `nu` compared with each of `releases`, oldest first: one comparison whose findings each carry
 * `against`, the release they were found against, and whose `transitive` names the oldest broken one.
 */
export const compareTransitive = (releases: readonly Release[], nu: Contract, options: CompareOptions = {}): Comparison & { readonly transitive: Transitive } => {
  const merged = new Map<string, Finding>();
  for (const release of releases) {
    for (const finding of compareContracts(release.contract, nu, options).findings) {
      const key = keyOf(finding);
      const seen = merged.get(key);
      if (seen === undefined || worse(finding, seen)) merged.set(key, { ...finding, against: release.label });
    }
  }
  const findings = sortFindings([...merged.values()]);
  const summary = summaryOf(findings);
  const broken = new Set(findings.filter((finding) => finding.verdict === 'breaking').map((finding) => finding.against));
  const oldestBroken = releases.find((release) => broken.has(release.label))?.label;
  return {
    mode: options.mode ?? 'backward',
    side: options.side ?? 'caller',
    verdict: overall(summary),
    summary,
    findings,
    transitive: { against: releases.map((release) => release.label), ...(oldestBroken === undefined ? {} : { oldestBroken }) },
  };
};
