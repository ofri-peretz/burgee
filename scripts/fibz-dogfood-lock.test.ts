/**
 * burgee runs fibz on itself: the four rules at error over its tests, the existing findings
 * held in ESLint's suppressions file as a ratchet, and `fibz diff` as a pre-push step.
 * Each assertion below goes red if one of those is unwired.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '..');
const read = (file: string): string => readFileSync(path.join(root, file), 'utf8');

type Suppressions = Record<string, Record<string, { count: number }>>;

describe('fibz is dogfooded', () => {
  it('the lint config turns on fibz.recommended over test files', () => {
    const config = read('eslint.config.mjs');
    expect(config).toContain('import { configs as fibz } from "fibz/eslint";');
    expect(config).toMatch(/\.\.\.fibz\.recommended,\s*\n\s*files: \["\*\*\/\*\.test\./);
  });

  it('the suppressions file holds fibz findings only, so it cannot hide another rule', () => {
    const suppressions = JSON.parse(read('eslint-suppressions.json')) as Suppressions;
    const rules = new Set(Object.values(suppressions).flatMap((byRule) => Object.keys(byRule)));
    expect([...rules].every((rule) => rule.startsWith('fibz/'))).toBe(true);
  });

  it('CI and `npm run lint` build fibz before ESLint loads it', () => {
    expect(read('.github/workflows/quality.yml')).toMatch(/- run: npm run lint:prereq\n\s+- run: npx eslint \. --max-warnings 0/);
    const scripts = (JSON.parse(read('package.json')) as { scripts: Record<string, string> }).scripts;
    expect(scripts['lint']).toMatch(/^npm run lint:prereq && eslint \./);
    expect(scripts['lint:prereq']).toContain('--filter=fibz');
  });

  it('pre-push runs fibz diff against origin/main', () => {
    expect(read('lefthook.yml')).toContain('run: node packages/fibz/dist/bin.js diff --base origin/main');
  });
});
