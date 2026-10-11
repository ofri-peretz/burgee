// A package at 1.x must not tell its readers it is pre-1.0. caique shipped 1.0.0 on 2026-10-08
// while its README and docs index still opened with "Released, pre-1.0.".
//
// SECURITY.md is held the same way. On 2026-10-10 its "Supported versions" still read
// "`linegauge` and `flagstaff` are 1.0 … Every other published package is pre-1.0", with all ten
// at 1.x: a list of the stable packages, typed in, goes stale the day one more reaches 1.0. So the
// section may name a published package only when that package is still pre-1.0 (and then it must
// name every one of them), and it may say "pre-1.0" only while one is. The versions are read from
// `packages/*/package.json`, never listed here.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..');
const PRE_1_0 = /\bpre-1\.0\b|\bpre-release\b|\breserved\b(?= package| name)/iu;

/** `pkg` for every package whose manifest is at 1.x or later yet whose README says pre-1.0. */
export function staleStatus(readmes: Record<string, { version: string; readme: string }>): string[] {
  return Object.entries(readmes)
    .filter(([, { version, readme }]) => Number(version.split('.')[0]) >= 1 && PRE_1_0.test(readme))
    .map(([pkg]) => pkg);
}

const stable = (version: string): boolean => Number(version.split('.')[0]) >= 1;

/** The body of `## Supported versions`, up to the next `## ` heading, or `undefined` when there is none. */
export function supportedVersions(security: string): string | undefined {
  const heading = /^## Supported versions$/mu.exec(security);
  if (heading === null) return undefined;
  const rest = security.slice(heading.index + heading[0].length);
  const end = rest.indexOf('\n## ');
  return end === -1 ? rest : rest.slice(0, end);
}

/**
 * What is wrong with SECURITY.md's support statement, given every published package's version.
 * It names a package only to say it is pre-1.0, it names every pre-1.0 package, and it says
 * "pre-1.0" only while one is.
 */
export function securityStatusProblems(security: string, versions: Record<string, string>): string[] {
  const section = supportedVersions(security);
  if (section === undefined) return ['SECURITY.md has no "## Supported versions" section, so the support statement is unchecked'];
  const out: string[] = [];
  const named = Object.keys(versions).filter((pkg) => section.includes(`\`${pkg}\``));
  for (const pkg of named.filter((p) => stable(versions[p]!))) {
    out.push(`SECURITY.md: "Supported versions" names \`${pkg}\`, which is at ${versions[pkg]!} — a typed list of stable packages goes stale; state the policy for all of them`);
  }
  const early = Object.keys(versions).filter((p) => !stable(versions[p]!));
  for (const pkg of early.filter((p) => !named.includes(p))) {
    out.push(`SECURITY.md: \`${pkg}\` is at ${versions[pkg]!} and "Supported versions" does not say it is pre-1.0`);
  }
  if (early.length === 0 && PRE_1_0.test(section)) {
    out.push(`SECURITY.md: "Supported versions" says "${PRE_1_0.exec(section)![0]}", and every published package is at 1.0 or later`);
  }
  return out;
}

const COUNT_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];

/**
 * What is wrong with the root README's release status, given every published package's version.
 * On 2026-10-10 it read "Nine are at 1.x … `controlroom@1.0.0` … its API can still move" with all
 * ten at 1.x: a hand-typed count and a stability caveat nobody re-read when controlroom cut 1.0.
 */
export function rootStatusProblems(readme: string, versions: Record<string, string>): string[] {
  const out: string[] = [];
  const atOne = Object.values(versions).filter(stable).length;
  const all = Object.keys(versions).length;
  for (const m of readme.matchAll(/\b(\w+) (?:are|is) at 1\.x\b/giu)) {
    const said = COUNT_WORDS.indexOf(m[1]!.toLowerCase());
    const n = said === -1 ? Number(m[1]) : said;
    if (Number.isInteger(n) && n !== atOne) out.push(`README.md says "${m[0]}", and ${String(atOne)} published packages are at 1.x`);
  }
  if (atOne === all && /\bcan still move\b/iu.test(readme)) out.push('README.md says an API "can still move", and every published package is at 1.0 or later, under semver');
  return out;
}

/** Every package under `packages/` that has a README, with its manifest's version. */
const published = (): Record<string, { version: string; readme: string }> =>
  Object.fromEntries(
    readdirSync(join(ROOT, 'packages'))
      .filter((p) => existsSync(join(ROOT, 'packages', p, 'README.md')))
      .filter((p) => (JSON.parse(readFileSync(join(ROOT, 'packages', p, 'package.json'), 'utf8')) as { private?: boolean }).private !== true)
      .map((p) => [p, { version: (JSON.parse(readFileSync(join(ROOT, 'packages', p, 'package.json'), 'utf8')) as { version: string }).version, readme: readFileSync(join(ROOT, 'packages', p, 'README.md'), 'utf8') }]),
  );

describe('a 1.x package does not call itself pre-1.0', () => {
  it('flags a 1.x README that says pre-1.0, and passes a 0.x one', () => {
    expect(staleStatus({ a: { version: '1.0.0', readme: '**Released, pre-1.0.**' }, b: { version: '0.3.1', readme: 'pre-1.0' } })).toEqual(['a']);
  });

  it('holds for every published package', () => {
    expect(staleStatus(published())).toEqual([]);
  });
});

/** Every published package's manifest version, by name. */
const versions = (): Record<string, string> => Object.fromEntries(Object.entries(published()).map(([pkg, { version }]) => [pkg, version]));

describe("the root README's release status agrees with the manifests", () => {
  it('holds for README.md as it stands', () => {
    expect(rootStatusProblems(readFileSync(join(ROOT, 'README.md'), 'utf8'), versions())).toEqual([]);
  });

  it('fails the paragraph it was written against (origin/main, 2026-10-10), with all ten at 1.x', () => {
    const ten = Object.fromEntries(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'].map((p) => [p, '1.0.0']));
    const stale = 'All ten are released on npm. Nine are at 1.x, with their public API under semver;\n`controlroom@1.0.0` is built to its approved design, and its API can still move.';
    expect(rootStatusProblems(stale, ten)).toEqual([
      'README.md says "Nine are at 1.x", and 10 published packages are at 1.x',
      'README.md says an API "can still move", and every published package is at 1.0 or later, under semver',
    ]);
    expect(rootStatusProblems('All ten are released on npm at 1.x.', ten)).toEqual([]);
  });
});

describe("SECURITY.md's supported versions agree with the manifests", () => {
  it('reads every published package', () => {
    expect(Object.keys(versions()).length).toBeGreaterThanOrEqual(10);
  });

  it('holds for SECURITY.md as it stands', () => {
    expect(securityStatusProblems(readFileSync(join(ROOT, 'SECURITY.md'), 'utf8'), versions())).toEqual([]);
  });

  it('fails the section it was written against (origin/main, 2026-10-10), with all ten at 1.x', () => {
    const before = [
      '# Security policy',
      '',
      '## Supported versions',
      '',
      '`linegauge` and `flagstaff` are 1.0. Their public API is under semver. Every',
      'other published package is pre-1.0, and its API can still move between minors.',
      '',
      '## What reduces the attack surface here',
      '',
      'Nothing about `roundel` here is checked.',
    ].join('\n');
    const all = { bellpull: '1.0.4', flagstaff: '1.2.5', linegauge: '1.0.8', roundel: '1.0.4' };
    expect(securityStatusProblems(before, all)).toEqual([
      expect.stringMatching(/names `flagstaff`, which is at 1\.2\.5/u),
      expect.stringMatching(/names `linegauge`, which is at 1\.0\.8/u),
      expect.stringMatching(/says "pre-1\.0", and every published package/u),
    ]);
  });

  it('asks a section to name a package that is still 0.x, and passes one that does', () => {
    const policy = '## Supported versions\n\nOnly the latest release of each is supported.\n';
    expect(securityStatusProblems(policy, { a: '1.0.0', b: '0.4.0' })).toEqual([expect.stringMatching(/`b` is at 0\.4\.0/u)]);
    expect(securityStatusProblems(`${policy}\n\`b\` is pre-1.0.\n`, { a: '1.0.0', b: '0.4.0' })).toEqual([]);
    expect(securityStatusProblems(policy, { a: '1.0.0' })).toEqual([]);
  });

  it('fails a SECURITY.md with no support statement, rather than passing it', () => {
    expect(securityStatusProblems('# Security policy\n\n## Reporting\n', { a: '1.0.0' })).toEqual([expect.stringMatching(/no "## Supported versions"/u)]);
  });
});
