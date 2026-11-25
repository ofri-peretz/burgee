/**
 * burgee runs the Claude pack it ships (hookset): the vendored hooks are the canonical copies,
 * settings.json wires every one of them, and the verify skill is filled in. `hookset check` cannot
 * judge this repo (its lefthook.yml is the presets' source, not a consumer of them), so this lock
 * does the Claude half of that check here.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// eslint-disable-next-line import-next/no-relative-packages -- by path: the lock judges the source this checkout ships, not a built copy
import { checkSkill, expectedClaudeHooks, loadStations } from '../packages/hookset/src/core.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PKG = join(ROOT, 'packages/hookset');
const STATIONS = loadStations(PKG);
const read = (file: string): string => readFileSync(file, 'utf8');

describe("burgee's own Claude pack", () => {
  it.each(STATIONS.claude.files)('vendors %s byte for byte', (file) => {
    expect(read(join(ROOT, '.claude/hooks', file)), `.claude/hooks/${file} drifted: copy packages/hookset/claude/${file} over it`).toBe(read(join(PKG, 'claude', file)));
  });

  it('wires every pack hook in .claude/settings.json', () => {
    const settings = JSON.parse(read(join(ROOT, '.claude/settings.json'))) as { hooks: Record<string, { matcher?: string; hooks: { command: string }[] }[]> };
    const missing = expectedClaudeHooks(STATIONS).filter(
      (h) => !(settings.hooks[h.event] ?? []).some((g) => (g.matcher ?? '') === h.matcher && g.hooks.some((c) => c.command.includes(`.claude/hooks/${h.file}`))),
    );
    expect(missing, 'run the missing hooks from .claude/settings.json, as `hookset init --claude` writes them').toEqual([]);
  });

  it.each(STATIONS.claude.skills ?? [])('carries a filled-in $id skill', (skill) => {
    expect(checkSkill(ROOT, skill)).toEqual([]);
  });
});
