/**
 * burgee runs truemark on itself: the four rules at error over its tests, the existing findings
 * held in ESLint's suppressions file as a ratchet, and `truemark diff` as a pre-push step.
 * Each assertion below goes red if one of those is unwired.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '..');
const read = (file: string): string => readFileSync(path.join(root, file), 'utf8');

type Suppressions = Record<string, Record<string, { count: number }>>;

describe('truemark is dogfooded', () => {
  it('the lint config turns on truemark.recommended over test files', () => {
    const config = read('eslint.config.mjs');
    expect(config).toContain('import { configs as truemark } from "truemark/eslint";');
    expect(config).toMatch(/\.\.\.truemark\.recommended,\s*\n\s*files: \["\*\*\/\*\.test\./);
  });

  it('the suppressions file holds truemark findings only, so it cannot hide another rule', () => {
    const suppressions = JSON.parse(read('eslint-suppressions.json')) as Suppressions;
    const rules = new Set(Object.values(suppressions).flatMap((byRule) => Object.keys(byRule)));
    expect([...rules].every((rule) => rule.startsWith('truemark/'))).toBe(true);
  });

  it('CI and `npm run lint` build truemark before ESLint loads it', () => {
    expect(read('.github/workflows/quality.yml')).toMatch(/- run: npm run lint:prereq\n\s+- run: npx eslint \. --max-warnings 0/);
    const scripts = (JSON.parse(read('package.json')) as { scripts: Record<string, string> }).scripts;
    expect(scripts['lint']).toMatch(/^npm run lint:prereq && eslint \./);
    expect(scripts['lint:prereq']).toContain('--filter=truemark');
  });

  it('pre-push runs truemark diff against origin/main', () => {
    expect(read('lefthook.yml')).toContain('run: node packages/truemark/dist/bin.js diff --base origin/main');
  });
});
