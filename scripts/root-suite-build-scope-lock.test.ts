/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — a job that runs the root suite builds what the root suite reads.
 *
 * The root suite (`vitest.root.config.ts`) runs whole on every compat cell, but on a pull request
 * the cell built only `./packages/*` ("Build every package (affected subset)"). Two root suites
 * read a built example: `clispec-document.test.ts` and `mcp-config-block.test.ts` start
 * `examples/demo-cli-burgee/dist/bin.js`. So every PR that changes no package's source (the
 * bench-series bot PRs #1143 and #1145, the docs PR #1155) went red on the Node 24 and 26 cells
 * with "examples/demo-cli-burgee/dist/bin.js is not built", and a full build hid it.
 *
 * Which examples are read is derived from the root suite's own sources, not listed here, so a
 * suite that starts reading another example's `dist/` is held to the same rule the day it does.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..');
const WORKFLOWS = join(ROOT, '.github', 'workflows');

/** An example's built output, as a path string or as `join` arguments. */
const READS_DIST = [/examples\/([\w-]+)\/dist\b/gu, /'examples',\s*'([\w-]+)',\s*'dist'/gu];

/** The examples whose `dist/` a root-suite source reads, by directory name. */
export function examplesRead(sources: readonly string[]): string[] {
  const names = new Set<string>();
  for (const text of sources) for (const pattern of READS_DIST) for (const m of text.matchAll(pattern)) names.add(m[1] as string);
  return [...names].toSorted();
}

/** Each job's text, keyed by its id: a two-space-indented key under `jobs:`. */
function jobsOf(workflow: string): Record<string, string> {
  const body = workflow.slice(workflow.search(/^jobs:\s*$/mu));
  const jobs: Record<string, string> = {};
  let current: string | undefined;
  for (const line of body.split('\n')) {
    const id = /^ {2}([\w-]+):\s*$/u.exec(line)?.[1];
    if (id !== undefined) current = id;
    else if (current !== undefined) jobs[current] = `${jobs[current] ?? ''}${line}\n`;
  }
  return jobs;
}

/**
 * `job: filters` for every job that runs the root suite after a filtered `turbo run build`, with
 * what that build leaves out of `wanted` (package names). A job that builds unfiltered builds them all.
 */
export function unbuilt(workflows: Record<string, string>, wanted: readonly string[]): string[] {
  return Object.entries(workflows).flatMap(([file, text]) =>
    Object.entries(jobsOf(text)).flatMap(([job, body]) => {
      if (!body.includes('vitest.root.config.ts')) return [];
      const builds = body.split('\n').filter((line) => /npx turbo run build\b/u.test(line) && line.includes('--filter'));
      return builds.flatMap((line) => {
        const missing = wanted.filter((name) => !line.includes(`--filter=${name}`) && !line.includes(`--filter='${name}'`));
        return missing.length === 0 ? [] : [`${file} › ${job}: ${line.trim().replace(/^(?:- )?run:\s*/u, '')} — does not build ${missing.join(', ')}`];
      });
    }),
  );
}

const rootSources = (): string[] => readdirSync(join(ROOT, 'scripts')).filter((f) => /\.m?ts$/u.test(f) && !f.endsWith('-lock.test.ts')).map((f) => readFileSync(join(ROOT, 'scripts', f), 'utf8'));
const packageName = (example: string): string => (JSON.parse(readFileSync(join(ROOT, 'examples', example, 'package.json'), 'utf8')) as { name: string }).name;

/** A workflow with one root-suite job that builds with `build`, and a job that does not run the root suite. */
const job = (build: string): string => `jobs:\n  cell:\n    steps:\n      - run: ${build}\n      - run: npx vitest run --config vitest.root.config.ts\n  other:\n    steps:\n      - run: npx turbo run build --filter=x\n`;

describe('the root suite runs on what it reads (compat cells, #1143 #1145 #1155)', () => {
  it('finds the examples a root suite reads, in either spelling', () => {
    expect(examplesRead(["join(REPO, 'examples', 'demo-cli-burgee', 'dist', 'bin.js')", '`examples/other/dist/bin.js is not built`', "join(root, 'examples/plugins/acme.mjs')"])).toEqual(['demo-cli-burgee', 'other']);
  });

  it('flags a filtered build in a root-suite job that leaves one out, and passes one that does not', () => {
    expect(unbuilt({ 'a.yml': job("npx turbo run build --filter='./packages/*'") }, ['demo-cli-burgee'])).toEqual(["a.yml › cell: npx turbo run build --filter='./packages/*' — does not build demo-cli-burgee"]);
    expect(unbuilt({ 'a.yml': job("npx turbo run build --filter='./packages/*' --filter=demo-cli-burgee") }, ['demo-cli-burgee'])).toEqual([]);
    expect(unbuilt({ 'a.yml': job('npm run build -- --concurrency=4') }, ['demo-cli-burgee'])).toEqual([]);
  });

  it('every workflow job that runs the root suite builds each example it reads', () => {
    const wanted = examplesRead(rootSources()).map(packageName);
    expect(wanted).toContain('demo-cli-burgee');
    const files = Object.fromEntries(readdirSync(WORKFLOWS).filter((f) => f.endsWith('.yml')).map((f) => [f, readFileSync(join(WORKFLOWS, f), 'utf8')]));
    expect(unbuilt(files, wanted)).toEqual([]);
  });
});
