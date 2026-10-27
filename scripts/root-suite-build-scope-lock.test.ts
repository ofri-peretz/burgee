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
 *
 * A job runs the root suite without naming its config, too: `npm test` starts it, and the
 * control-band watcher times `npm test` for `test-duration-ms`. control-bands.yml built
 * `./packages/*` only, so `mcp-config-block.test.ts` failed there on the unbuilt demo and the band
 * lost its point on 2026-10-19 and 2026-10-26 (B-20261026-control-bands-demo-build-and-budget).
 * Which commands start the root suite is derived from `package.json` and `control-bands.json`.
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

const ROOT_CONFIG = 'vitest.root.config.ts';

/**
 * The text that marks a job as running the root suite: its config by name, `npm test` when the
 * root `test` script starts that config, and the band watcher when a band times `npm test`.
 */
export function rootSuiteRunners(testScript: string, durationCommands: readonly (readonly string[])[]): string[] {
  if (!testScript.includes(ROOT_CONFIG)) return [ROOT_CONFIG];
  const npmTest = ['npm test', 'npm run test'];
  const timed = durationCommands.some((command) => npmTest.includes(command.join(' ')));
  return [ROOT_CONFIG, ...npmTest, ...(timed ? ['scripts/control-bands.ts'] : [])];
}

/**
 * `job: filters` for every job that runs the root suite after a filtered `turbo run build`, with
 * what that build leaves out of `wanted` (package names). A job that builds unfiltered builds them all.
 */
export function unbuilt(workflows: Record<string, string>, wanted: readonly string[], runners: readonly string[] = [ROOT_CONFIG]): string[] {
  return Object.entries(workflows).flatMap(([file, text]) =>
    Object.entries(jobsOf(text)).flatMap(([job, body]) => {
      if (!runners.some((runner) => body.includes(runner))) return [];
      const builds = body.split('\n').filter((line) => /npx turbo run build\b/u.test(line) && line.includes('--filter'));
      return builds.flatMap((line) => {
        const missing = wanted.filter((name) => !line.includes(`--filter=${name}`) && !line.includes(`--filter='${name}'`));
        return missing.length === 0 ? [] : [`${file} › ${job}: ${line.trim().replace(/^(?:- )?run:\s*/u, '')} — does not build ${missing.join(', ')}`];
      });
    }),
  );
}

const rootSources = (): string[] => readdirSync(join(ROOT, 'scripts')).filter((f) => /\.m?ts$/u.test(f) && !f.endsWith('-lock.test.ts')).map((f) => readFileSync(join(ROOT, 'scripts', f), 'utf8'));
const runners = (): string[] => {
  const { scripts } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
  const { bands } = JSON.parse(readFileSync(join(ROOT, '.sdlc/bands/control-bands.json'), 'utf8')) as { bands: { collector: string; command?: string[] }[] };
  return rootSuiteRunners(scripts['test'] ?? '', bands.filter((b) => b.collector === 'command-duration').map((b) => b.command ?? []));
};
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

  it('counts `npm test`, and the band watcher that times it, as running the root suite', () => {
    expect(rootSuiteRunners('vitest run --config vitest.root.config.ts && turbo run test', [['npm', 'test']])).toEqual(['vitest.root.config.ts', 'npm test', 'npm run test', 'scripts/control-bands.ts']);
    expect(rootSuiteRunners('vitest run --config vitest.root.config.ts && turbo run test', [['npm', 'run', 'lint']])).toEqual(['vitest.root.config.ts', 'npm test', 'npm run test']);
    expect(rootSuiteRunners('turbo run test', [['npm', 'test']])).toEqual(['vitest.root.config.ts']);
    const watcher = "jobs:\n  watch:\n    steps:\n      - run: npx turbo run build --filter='./packages/*'\n      - run: npx tsx scripts/control-bands.ts --backfill-git\n";
    expect(unbuilt({ 'b.yml': watcher }, ['demo-cli-burgee'])).toEqual([]);
    expect(unbuilt({ 'b.yml': watcher }, ['demo-cli-burgee'], runners())).toEqual(["b.yml › watch: npx turbo run build --filter='./packages/*' — does not build demo-cli-burgee"]);
  });

  it('every workflow job that runs the root suite builds each example it reads', () => {
    const wanted = examplesRead(rootSources()).map(packageName);
    expect(wanted).toContain('demo-cli-burgee');
    expect(runners()).toContain('scripts/control-bands.ts');
    const files = Object.fromEntries(readdirSync(WORKFLOWS).filter((f) => f.endsWith('.yml')).map((f) => [f, readFileSync(join(WORKFLOWS, f), 'utf8')]));
    expect(unbuilt(files, wanted, runners())).toEqual([]);
  });
});
