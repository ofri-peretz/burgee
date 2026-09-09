/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Every flag a shell offers is a flag the parser accepts.
 *
 * The completions had two ways of being wrong at once, and neither showed up in a test that
 * only asked whether the scripts were generated:
 *
 *   - **fish emitted the declaration name, not the CLI form** — `-l dryRun` where the flag
 *     is `--dry-run`. Every camelCase option, in the one shell that builds its own spelling
 *     instead of going through `flags()`.
 *   - **negations did not exist**, and once they did, the naive version offered `--no-json`
 *     and `--no-help`: `toParseConfig` registers `no-<name>` for a command's *declared*
 *     options and not for the reserved ones, but by the time the generators see an option
 *     the two have been merged.
 *
 * A completion that offers a flag the parser refuses is worse than a missing one — it is an
 * instruction to type something that fails. So the check runs the parser.
 */
import { describe, expect, it } from 'vitest';

import { renderCompletion, SHELLS } from './completions.js';
import { defineCommand, defineProgram, ExitCode } from './index.js';
import { runBurgee } from './testing.js';

const program = defineProgram({
  name: 'app',
  commands: [
    defineCommand({
      name: 'go',
      options: { dryRun: { type: 'boolean', description: 'no writes' }, quiet: { type: 'boolean', short: 'q' }, name: { type: 'string' } },
      run: () => 'ok',
    }),
  ],
});

/** Long flags a script offers, in either the `--x` form or fish's `-l x`. */
function offered(script: string): string[] {
  const dashed = script.match(/--[a-z][a-z0-9-]*/g) ?? [];
  const fish = (script.match(/-l ([a-z][a-z0-9-]*)/g) ?? []).map((m) => `--${m.slice(3)}`);
  return [...new Set([...dashed, ...fish])];
}

/** The reserved surfaces, which every program answers and no command declares. */
const RESERVED = new Set(['--json', '--help', '--version', '--explain', '--schema', '--mcp', '--config', '--no-config']);

describe.each(SHELLS)('%s completions', (shell) => {
  const flags = offered(renderCompletion(program, shell)).filter((f) => !RESERVED.has(f));

  it('offers something', () => {
    expect(flags.length).toBeGreaterThan(0);
  });

  it.each(['--dry-run', '--no-dry-run', '--quiet', '--no-quiet', '--name'])('offers %s', (flag) => {
    expect(flags).toContain(flag);
  });

  it('offers no flag the parser refuses', async () => {
    // A string option needs a value; a boolean must not be given one.
    const runs = flags.map((flag) => runBurgee(program, { argv: flag === '--name' ? ['go', flag, 'x'] : ['go', flag] }).then((r) => ({ flag, r })));
    const results = await Promise.all(runs);
    for (const { flag, r } of results) {
      expect(r.code, `${shell} offers ${flag}, which the parser answers with ${String(r.code)}: ${r.stderr ?? ''}`).not.toBe(ExitCode.USAGE);
    }
  });
});
