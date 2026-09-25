/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — C1. The majors each drop-in claims are the majors graded level, and the grading runs.
 *
 * `SUPPORTED_MAJORS` in `packages/burgee/src/compat.ts` is the published half of the claim:
 * `burgee migrate` reads it to decide whether a project's incumbent is on a major it may
 * rewrite. The measured half is `compat-oracle`'s `PREVIOUS_MAJORS` — each older major's own
 * suite, vendored at that major's last tag — with a baseline under `baseline/majors/` and a
 * control on the published page. Nothing held the two together before this: a range typed
 * into a data module is exactly the sentence the compatibility page used to carry ("programs
 * written for 12–14 run unchanged wherever 15 kept their API"), which no suite had run.
 *
 * So this holds four things, each of which fails alone:
 *
 * 1. the declaration covers exactly the incumbents `GRADED_VERSIONS` names, and each claims
 *    its graded major as its newest;
 * 2. every older major claimed has a graded row that is **level** — its baseline passes as
 *    many cases as the control the page publishes;
 * 3. every graded older major is really that major: an older release of a current host,
 *    pinned, installed as that release for the control, vendored at it, with a baseline;
 * 4. CI grades them — the ratchet job runs `--majors` and `--majors --control` before the
 *    page check, which is what keeps a claimed major level after today.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// eslint-disable-next-line import-next/no-relative-packages -- by path, never by name: a bare `burgee/*` resolves from another checkout's dist/ in an uninstalled worktree, and `compat.ts` is not an export
import { GRADED_VERSIONS, SUPPORTED_MAJORS } from '../packages/burgee/src/compat.js';
// eslint-disable-next-line import-next/no-relative-packages -- by path, never by name: compat-oracle is private and never installed as a dependency (compat-oracle R6, scripts/oracle-import-lock.test.ts)
import { hostNamed, PREVIOUS_MAJORS } from '../packages/compat-oracle/src/hosts.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const ORACLE = join(ROOT, 'packages/compat-oracle');
const MAJORS_BASELINE = join(ORACLE, 'baseline/majors');
const PAGE = readFileSync(join(ROOT, 'apps/docs/content/docs/compatibility.mdx'), 'utf8');
const WORKFLOW = readFileSync(join(ROOT, '.github/workflows/compat.yml'), 'utf8');

/** The leading number of a version — `14.0.3` is 14. */
const majorOf = (version: string): number => Number(/\d+/.exec(version)?.[0]);

const baselineOf = (key: string): { reference: number; passed: number } | undefined => {
  const at = join(MAJORS_BASELINE, `${key}.json`);
  return existsSync(at) ? (JSON.parse(readFileSync(at, 'utf8')) as { reference: number; passed: number }) : undefined;
};

/** The control count the page publishes for a row: `| **key** | `target` | ours | rate | control / n |`. */
const controlOf = (key: string): number | undefined => {
  const found = new RegExp(`^\\| \\*\\*${key}\\*\\* \\| \`[^\`]+\` \\| [^|]+ \\| [\\d.]+% \\| (\\d+) / \\d+ \\|`, 'mu').exec(PAGE);
  return found === null ? undefined : Number(found[1]);
};

/** The graded older major of `pkg` at `major`, if there is one. */
const graded = (pkg: string, major: number) => PREVIOUS_MAJORS.find((h) => (h.npmName ?? h.name) === pkg && majorOf(h.pinnedVersion ?? '') === major);

const packages = Object.keys(GRADED_VERSIONS);

describe('C1 — each drop-in declares the majors it claims', () => {
  it('declares a range for exactly the incumbents graded, so none is claimed by omission', () => {
    expect(Object.keys(SUPPORTED_MAJORS).sort()).toEqual([...packages].sort());
  });

  it.each(packages)('%s claims its graded major, as its newest', (pkg) => {
    const claimed = SUPPORTED_MAJORS[pkg] ?? [];
    const current = majorOf(GRADED_VERSIONS[pkg] ?? '');
    expect(claimed).toContain(current);
    expect(Math.max(...claimed)).toBe(current);
  });

  it.each(packages.flatMap((pkg) => (SUPPORTED_MAJORS[pkg] ?? []).filter((m) => m !== majorOf(GRADED_VERSIONS[pkg] ?? '')).map((m) => [pkg, m] as const)))(
    '%s %i is claimed only because its own suite grades it level',
    (pkg, major) => {
      const row = graded(pkg, major);
      expect(row, `${pkg} ${major} is claimed and no PREVIOUS_MAJORS row grades it`).toBeDefined();
      const measured = baselineOf(row?.name ?? '');
      const control = controlOf(row?.name ?? '');
      expect(measured, `baseline/majors/${row?.name ?? '?'}.json`).toBeDefined();
      expect(control, `the compatibility page publishes no control for ${row?.name ?? '?'}`).toBeDefined();
      expect(measured?.passed, `${pkg} ${major} is claimed below level: ${measured?.passed ?? 0} against a control of ${control ?? 0}`).toBeGreaterThanOrEqual(control ?? Number.POSITIVE_INFINITY);
    },
  );
});

describe('C1 — each older major graded is that major', () => {
  it('grades at least one, so nothing below passes vacuously', () => {
    expect(PREVIOUS_MAJORS.length).toBeGreaterThan(0);
  });

  it.each(PREVIOUS_MAJORS.map((h) => [h.name, h] as const))('%s is an older release of a current host, graded against the same front-end', (_name, host) => {
    const current = hostNamed(host.majorOf ?? '');
    const pkg = host.npmName ?? host.name;
    expect(current?.status, `${host.name}: majorOf must name an active host`).toBe('active');
    expect(current?.npmName ?? current?.name).toBe(pkg);
    expect(host.target).toBe(current?.target);
    expect(majorOf(host.pinnedVersion ?? '')).toBeLessThan(majorOf(GRADED_VERSIONS[pkg] ?? ''));
  });

  it.each(PREVIOUS_MAJORS.map((h) => [h.name, h] as const))('%s grades the real older package, installed beside its suite at the pin', (_name, host) => {
    // Without the incumbent in `suiteDeps` the control resolves the workspace's hoisted
    // current major, and the "older major" row grades the current one twice.
    expect(host.suiteDeps).toContain(`${host.npmName ?? host.name}@${host.pinnedVersion ?? '?'}`);
    const source = JSON.parse(readFileSync(join(ORACLE, 'vendor', host.name, '.source.json'), 'utf8')) as { version: string };
    expect(source.version).toBe(host.pinnedVersion);
  });

  it('keeps a baseline fragment for every older major graded, and for no other', () => {
    const fragments = readdirSync(MAJORS_BASELINE).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -'.json'.length));
    expect(fragments.sort()).toEqual(PREVIOUS_MAJORS.map((h) => h.name).sort());
    for (const host of PREVIOUS_MAJORS) expect(baselineOf(host.name)?.reference).toBeGreaterThan(0);
  });

  it.each(PREVIOUS_MAJORS.map((h) => [h.name] as const))('%s has its row on the compatibility page', (name) => {
    expect(controlOf(name), 'run `npm run compat:page` — the page is generated from hosts.ts').toBeDefined();
  });
});

describe('C1 — CI grades the older majors', () => {
  /** The ratchet job's body, up to the next top-level job. */
  const ratchet = /^ {2}ratchet:\n([\s\S]*?)(?=^ {2}\w[\w-]*:\n)/m.exec(WORKFLOW)?.[1] ?? '';

  it('reads the ratchet job, so the checks below cannot pass on an empty string', () => {
    expect(ratchet).toContain('compat-oracle/dist/bin.js');
  });

  it('grades them against burgee and against the real packages, before the page is checked', () => {
    const target = ratchet.search(/bin\.js --majors(?! --control)/);
    const control = ratchet.indexOf('bin.js --majors --control');
    const page = ratchet.indexOf('compat:page -- --check');
    expect(target, 'the ratchet job grades no previous major against burgee').toBeGreaterThan(-1);
    expect(control, 'the ratchet job grades no previous major against the real package').toBeGreaterThan(-1);
    expect(page).toBeGreaterThan(Math.max(target, control));
  });
});
