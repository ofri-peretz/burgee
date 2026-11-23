/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Specification coverage lock — `spec-release-watch` R6.
 *
 * D-20261122-open-formats: "a format is supported when it is on the watch list and an adapter
 * reads it; a format that is not watched is not supported." This is that sentence as a check.
 *
 *   1. every built-in adapter in `packages/contractdiff/src/inputs.ts` is named by an entry of
 *      `packages/contractdiff/specs.json`, so a format added to apicontract adds its watch in the
 *      same PR (a new reader with no watch is a reader that goes stale in silence);
 *   2. every official test suite a grader vendors has an entry with `kind: 'test-suite'`, because a
 *      new suite release moves a published score as surely as a new spec does;
 *   3. every adapter an entry names is a file that exists, so the issue body never points at one
 *      that does not.
 *
 * The checks are one pure function, `coverageProblems`, run on the real tree and on made-up trees
 * that break each rule, so a failing lock is shown failing rather than only claimed to.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// eslint-disable-next-line import-next/no-relative-packages -- by path, never by name: the corpus pins are the graders' own list of vendored suites
import { SOURCES } from '../benchmarks/apicontract/corpus/sources.js';
// eslint-disable-next-line import-next/no-relative-packages -- same: by path, a bare `compat-oracle/*` resolves from another checkout's dist/ in an uninstalled worktree (compat-oracle R6)
import { adapterFile, parseSpecs, type Spec } from '../packages/compat-oracle/src/specs.js';
// eslint-disable-next-line import-next/no-relative-packages -- same: the adapter list is read from the source, not from a published build
import { builtinAdapters } from '../packages/contractdiff/src/inputs.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const OWNER = 'contractdiff';
const SPECS_FILE = join(ROOT, 'packages', OWNER, 'specs.json');

/** A repository named like a test suite: `JSON-Schema-Test-Suite`, `json-schema-test-suite`. */
const SUITE = /test-suite/iu;

/** The GitHub repo of every link in a fixtures README that points at a test suite. */
const LINKED = /github\.com\/([\w.-]+\/[\w.-]*test-suite[\w.-]*)/giu;

/** `owner/name`, as GitHub spells it, lower-cased so a link and a pin compare equal. */
const same = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

/**
 * Every test-suite repo a grader of ours vendors: the corpus' pinned sources, and each upstream a
 * fixtures `SOURCES.md` credits. Both are where a suite's files enter this repository.
 */
export function vendoredSuites(sources: Record<string, { repo: string }>, notes: string[]): string[] {
  const repos = new Set<string>();
  for (const [name, source] of Object.entries(sources)) {
    if (SUITE.test(name) || SUITE.test(source.repo)) repos.add(source.repo);
  }
  for (const note of notes) {
    for (const match of note.matchAll(LINKED)) repos.add(match[1] as string);
  }
  return [...repos].sort();
}

/** What is wrong with a watch list, one sentence each, each ending in what to do. */
export function coverageProblems(specs: Spec[], adapters: string[], suites: string[], exists: (file: string) => boolean): string[] {
  const problems: string[] = [];
  for (const adapter of adapters) {
    if (!specs.some((s) => (s.adapters ?? []).includes(adapter))) {
      problems.push(`the \`${adapter}\` adapter in apicontract/src/inputs.ts has no specs.json entry naming it. fix: add { name, repo, source, reads, adapters: ["${adapter}"] } for its format to packages/${OWNER}/specs.json`);
    }
  }
  for (const suite of suites) {
    if (!specs.some((s) => s.kind === 'test-suite' && same(s.repo, suite))) {
      problems.push(`a grader vendors ${suite} and specs.json has no \`kind: "test-suite"\` entry for it. fix: add { name, repo: "${suite}", kind: "test-suite", source: "releases", reads: [...] }`);
    }
  }
  for (const spec of specs) {
    for (const adapter of spec.adapters ?? []) {
      if (!exists(adapterFile(adapter))) problems.push(`${spec.name} names the adapter \`${adapter}\`, and packages/${OWNER}/src/${adapterFile(adapter)} does not exist. fix: name the file that reads the format`);
    }
  }
  return problems;
}

const specs = parseSpecs(JSON.parse(readFileSync(SPECS_FILE, 'utf8')) as unknown, `packages/${OWNER}/specs.json`);

/** Every `SOURCES.md` under a package's fixtures, read as text. */
function fixtureNotes(): string[] {
  const notes: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(join(dir, entry.name));
      else if (entry.name === 'SOURCES.md') notes.push(readFileSync(join(dir, entry.name), 'utf8'));
    }
  };
  walk(join(ROOT, 'packages', OWNER, 'src', '__fixtures__'));
  return notes;
}

const REAL_ADAPTERS = Object.keys(builtinAdapters);
const REAL_SUITES = vendoredSuites(SOURCES, fixtureNotes());
const present = (): boolean => true;
const real = (): string[] => coverageProblems(specs, REAL_ADAPTERS, REAL_SUITES, (file) => existsSync(join(ROOT, 'packages', OWNER, 'src', file)));

describe('the watch list covers what apicontract reads and what its graders vendor (R6)', () => {
  it('sees the adapters and the suite it is supposed to cover, so a green run is not an empty one', () => {
    expect(REAL_ADAPTERS).toEqual(expect.arrayContaining(['openapi', 'swagger2', 'asyncapi', 'mcp', 'jsonschema']));
    expect(REAL_SUITES.map((r) => r.toLowerCase())).toContain('json-schema-org/json-schema-test-suite');
  });

  it('has an entry for every built-in adapter, one for every vendored test suite, and a file behind every adapter it names', () => {
    expect(real()).toEqual([]);
  });

  it('fails when an adapter loses its entry', () => {
    const without = specs.filter((s) => !(s.adapters ?? []).includes('mcp'));
    const problems = coverageProblems(without, REAL_ADAPTERS, REAL_SUITES, present);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('the `mcp` adapter');
    expect(problems[0]).toContain('fix: add');
  });

  it('fails when a vendored test suite loses its entry, or has one that is not marked a test suite', () => {
    const without = specs.filter((s) => s.kind !== 'test-suite');
    expect(coverageProblems(without, [], REAL_SUITES, present)[0]).toContain('json-schema-org/JSON-Schema-Test-Suite and specs.json has no `kind: "test-suite"` entry');
    const unmarked = specs.map((s) => (s.kind === 'test-suite' ? { ...s, kind: 'spec' as const } : s));
    expect(coverageProblems(unmarked, [], REAL_SUITES, present)).toHaveLength(1);
  });

  it('fails when a new adapter is added to inputs.ts and not to the list', () => {
    expect(coverageProblems(specs, [...REAL_ADAPTERS, 'graphql'], [], present)[0]).toContain('the `graphql` adapter');
  });

  it('fails when an entry names an adapter file that does not exist', () => {
    const problems = coverageProblems(specs, [], [], () => false);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems[0]).toContain('does not exist');
  });

  it('finds a suite by its name in the corpus pins and by its link in a fixtures SOURCES.md', () => {
    expect(vendoredSuites({ 'some-test-suite': { repo: 'a/b' }, other: { repo: 'c/d' }, x: { repo: 'e/f-Test-Suite' } }, ['[s](https://github.com/org/Thing-Test-Suite) and https://github.com/org/plain'])).toEqual(['a/b', 'e/f-Test-Suite', 'org/Thing-Test-Suite']);
  });

  it('lists every spec at most once, by repo and name', () => {
    const keys = specs.map((s) => `${s.repo}|${s.tagPattern ?? ''}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
