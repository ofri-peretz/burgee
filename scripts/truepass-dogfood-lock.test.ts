/**
 * burgee runs truepass on itself: the four rules at error over its tests, the existing findings
 * held in ESLint's suppressions file as a ratchet, and `truepass diff` as a pre-push step.
 * Each assertion below goes red if one of those is unwired.
 *
 * ESLint reads the suppressions file from the directory it runs in, keyed by paths relative to it.
 * A workspace's `eslint src` ran in the workspace, found no file there, and failed on every finding
 * the root file holds (six packages red under `turbo run lint` on 2026-11-24, while CI's
 * `npx eslint .` stayed green), so each workspace lints its src from the root instead.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '..');
const read = (file: string): string => readFileSync(path.join(root, file), 'utf8');

type Suppressions = Record<string, Record<string, { count: number }>>;

describe('truepass is dogfooded', () => {
  it('the lint config turns on truepass.recommended over test files', () => {
    const config = read('eslint.config.mjs');
    expect(config).toContain('import { configs as truepass } from "truepass/eslint";');
    expect(config).toMatch(/\.\.\.truepass\.recommended,\s*\n\s*files: \["\*\*\/\*\.test\./);
  });

  it('the suppressions file holds truepass findings only, so it cannot hide another rule', () => {
    const suppressions = JSON.parse(read('eslint-suppressions.json')) as Suppressions;
    const rules = new Set(Object.values(suppressions).flatMap((byRule) => Object.keys(byRule)));
    expect([...rules].every((rule) => rule.startsWith('truepass/'))).toBe(true);
  });

  it('CI and `npm run lint` build truepass before ESLint loads it', () => {
    expect(read('.github/workflows/quality.yml')).toMatch(/- run: npm run lint:prereq\n\s+- run: npx eslint \. --max-warnings 0/);
    const scripts = (JSON.parse(read('package.json')) as { scripts: Record<string, string> }).scripts;
    expect(scripts['lint']).toMatch(/^npm run lint:prereq && eslint \./);
    expect(scripts['lint:prereq']).toContain('--filter=truepass');
  });

  it('each workspace lints from the root, so its lint reads the suppressions `eslint .` reads', () => {
    const dirs = ['packages', 'apps'].flatMap((parent) => readdirSync(path.join(root, parent)).map((name) => `${parent}/${name}`));
    const linted = dirs.flatMap((dir) => {
      let manifest: { scripts?: Record<string, string> };
      try {
        manifest = JSON.parse(read(`${dir}/package.json`)) as typeof manifest;
      } catch {
        return [];
      }
      const lint = manifest.scripts?.['lint'];
      return lint === undefined ? [] : [[dir, lint]];
    });
    expect(linted.length).toBeGreaterThan(0);
    for (const [dir, lint] of linted) expect(lint, dir).toBe(`cd ../.. && eslint ${dir}/src --max-warnings 0`);
  });

  it('turbo lint builds truepass first and reruns when the root config or suppressions change', () => {
    const turbo = JSON.parse(read('turbo.json')) as { tasks: Record<string, { dependsOn?: string[]; inputs?: string[] }> };
    const lint = turbo.tasks['lint'];
    expect(lint?.dependsOn).toContain('truepass#build');
    expect(lint?.inputs).toEqual(expect.arrayContaining(['$TURBO_DEFAULT$', '$TURBO_ROOT$/eslint.config.mjs', '$TURBO_ROOT$/eslint-suppressions.json']));
  });

  it('pre-push runs truepass diff against origin/main', () => {
    expect(read('lefthook.yml')).toContain('run: node packages/truepass/dist/bin.js diff --base origin/main');
  });
});
