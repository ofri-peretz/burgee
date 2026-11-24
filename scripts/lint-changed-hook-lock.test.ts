/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — a lint finding on a changed file fails the push, not only CI's separate lint job.
 *
 * `npm run lint` is not part of `ci:local`, and until 2026-11-24 CLAUDE.md carried a line asking
 * the agent to run it too. Pre-push now lints the files the push changes with the same eslint
 * (warnings fail, as in `npm run lint`) and markdownlint, so that line is gone.
 *
 * `npx --no --`: without the `--`, npm reads `--max-warnings` and `--no-warn-ignored` as its own
 * config and eslint never sees them (a warning then passed, 2026-11-24).
 *
 * What fails here: pre-push dropping either step, eslint tolerating warnings, or the steps running
 * before the battery has built the packages the eslint config imports.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { load as loadYaml } from 'js-yaml';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const read = (file: string): string => readFileSync(join(ROOT, file), 'utf8');

type Command = { run: string; priority?: number; glob?: string };

describe('pre-push lints the files a push changes', () => {
  const hook = (loadYaml(read('lefthook.yml')) as { 'pre-push': { commands: Record<string, Command> } })['pre-push'];
  const lint = (loadYaml(read('package.json')) as { scripts: Record<string, string> }).scripts['lint'];

  it('with the eslint `npm run lint` runs, at zero warnings', () => {
    expect(lint).toContain('eslint . --max-warnings 0');
    const step = hook.commands['lint-changed'];
    expect(step?.run).toMatch(/^npx --no -- eslint --max-warnings 0 --no-warn-ignored \{push_files\}$/);
    expect(step?.glob).toContain('ts');
  });

  it('with the markdownlint `npm run lint:md` runs', () => {
    expect(read('package.json')).toContain('"lint:md": "markdownlint-cli2');
    expect(hook.commands['lint-changed-md']?.run).toBe('npx --no -- markdownlint-cli2 {push_files}');
  });

  it('after the battery, which builds the packages the eslint config imports', () => {
    const battery = hook.commands['battery']?.priority ?? 0;
    expect(hook.commands['lint-changed']?.priority).toBeGreaterThan(battery);
    expect(hook.commands['lint-changed-md']?.priority).toBeGreaterThan(battery);
  });
});
