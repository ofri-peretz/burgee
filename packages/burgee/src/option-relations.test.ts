/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * PLAN 2.5.2 — `dependsOn` and `exclusive`, declared on the option that owns the constraint.
 *
 * These are `relations` under a different name, and the plan says so: `exclusive` is
 * `conflicts`, `dependsOn` is `implies`. The reason for the second spelling is not taste. A
 * command-level `relations: [{ implies: ['out', 'force'] }]` states the constraint somewhere
 * other than the option it constrains, so the declaration a reader is looking at — the entry
 * for `out` — does not mention it, and neither does the help line for `--out`. Both incumbents
 * we claim spell it on the option: commander's `.option(...).implies({...})` and
 * `.conflicts(...)`, yargs' `.implies()` / `.conflicts()` keyed by the option's own name. Fig,
 * one projection further out, declares exactly these two keys on `Option`: `dependsOn` and
 * `exclusiveOn`.
 *
 * Nothing here is a second engine. Both fields desugar to the `Relation` union `validate.ts`
 * has always enforced, so there is one order of evaluation (S6) and one error vocabulary (E3)
 * — which is the property this file's usage-error assertions pin.
 *
 * ## Written before the fields existed
 *
 * Every `it` below was run against the tree without `dependsOn`/`exclusive` first, and the
 * failures recorded in the commit message: the two parse-time cases exited 0 rather than 2
 * (nothing checked the fields), and the projection cases failed on the missing key. A test
 * that passes on the unfixed tree pins nothing.
 */
import { describe, expect, it } from 'vitest';

import { renderFigSpec } from './completions.js';
import { ExitCode } from './exit-code.js';
import { renderHelp } from './help.js';
import { defineCommand, defineProgram } from './index.js';
import { schemaOf } from './schema.js';
import { runBurgee } from './testing.js';

/**
 * One command carrying both spellings, so every surface below reads the same declaration.
 *
 * `--out` depends on `--force`; `--csv` and `--table` exclude each other. Declared one-sided
 * on purpose — `exclusive` names the other option once, and the constraint has to hold in
 * both argv orders anyway.
 */
const program = defineProgram({
  name: 'app',
  commands: [
    defineCommand({
      name: 'export',
      description: 'write the rows out',
      options: {
        out: { type: 'string', description: 'where to write', dependsOn: ['force'] },
        force: { type: 'boolean', description: 'overwrite what is there' },
        csv: { type: 'boolean', description: 'comma separated', exclusive: ['table'] },
        table: { type: 'boolean', description: 'a drawn table' },
      },
      effects: 'withheld',
      run: () => ({ ok: true }),
    }),
  ],
});

const run = async (argv: string[]) => await runBurgee(program, { argv });

describe('dependsOn is enforced at parse time', () => {
  it('refuses the option whose requirement is absent', async () => {
    const r = await run(['export', '--out', 'rows.csv']);
    expect(r.code).toBe(ExitCode.USAGE);
    expect(r.stderr).toContain('--out requires --force');
  });

  it('accepts it when the requirement is there', async () => {
    expect((await run(['export', '--out', 'rows.csv', '--force'])).code).toBe(ExitCode.OK);
  });

  it('says nothing when the depending option is not given at all', async () => {
    expect((await run(['export'])).code).toBe(ExitCode.OK);
  });
});

describe('exclusive is enforced at parse time', () => {
  // Declared one-sided, on `csv` only, so the order the two arrive in is the thing under test.
  it.each([
    [['export', '--csv', '--table']],
    [['export', '--table', '--csv']],
  ])('refuses both, whichever comes first: %j', async (argv) => {
    const r = await run(argv);
    expect(r.code).toBe(ExitCode.USAGE);
    expect(r.stderr).toContain('cannot be used together');
  });

  it('accepts either alone', async () => {
    expect((await run(['export', '--csv'])).code).toBe(ExitCode.OK);
    expect((await run(['export', '--table'])).code).toBe(ExitCode.OK);
  });
});

/**
 * The shape, not merely the code. A new constraint that invented its own error would be a
 * second vocabulary for an agent to learn, and E3's whole claim is that there is one.
 */
describe('the failure is a usage error in this CLI’s established shape', () => {
  it('exits 2, prints `error:` and a hint, and no stack', async () => {
    const r = await run(['export', '--out', 'rows.csv']);
    expect(r.code).toBe(ExitCode.USAGE);
    expect(r.stderr).toBe('error: --out requires --force\nhint: pass --force\n');
    expect(r.stderr).not.toContain('at ');
  });

  it('--json carries it in the same envelope every other usage error uses', async () => {
    const r = await run(['export', '--json', '--csv', '--table']);
    expect(r.code).toBe(ExitCode.USAGE);
    expect(r.stderr).toBe('');
    expect(JSON.parse(r.stdout)).toEqual({
      ok: false,
      error: { code: ExitCode.USAGE, message: '--csv, --table cannot be used together', hint: 'drop one of them' },
    });
  });
});

/** A typo in a name is a definition error, because the alternative is a constraint that never fires. */
describe('a name that is not an option is refused when the command is declared', () => {
  it.each([
    ['dependsOn', { a: { type: 'string' as const, dependsOn: ['nope'] } }],
    ['exclusive', { a: { type: 'string' as const, exclusive: ['nope'] } }],
  ])('%s naming an undeclared option', (_field, options) => {
    expect(() => defineCommand({ name: 'x', options, effects: 'withheld', run: () => 'ok' })).toThrow(/"nope"/);
  });

  it('an option may not depend on or exclude itself', () => {
    expect(() => defineCommand({ name: 'x', options: { a: { type: 'string', exclusive: ['a'] } }, effects: 'withheld', run: () => 'ok' })).toThrow(/itself/);
  });
});

/**
 * oclif/core #1639, cited by `commander-env`'s intent: a `dependsOn` satisfied by a *default*
 * rather than by something the caller did. The engine's `isSet` already excludes a defaulted
 * value, and the second spelling inherits that rather than re-deciding it — which is the whole
 * argument for desugaring instead of writing a second checker.
 */
describe('what counts as “given” is the engine’s answer, not a second one', () => {
  const withDefault = defineProgram({
    name: 'app',
    commands: [
      defineCommand({
        name: 'push',
        options: {
          out: { type: 'string', dependsOn: ['force'] },
          force: { type: 'boolean', default: false, env: 'APP_FORCE' },
        },
        effects: 'withheld',
        run: () => ({ ok: true }),
      }),
    ],
  });

  it('a default does not satisfy it (oclif/core #1639)', async () => {
    const r = await runBurgee(withDefault, { argv: ['push', '--out', 'x'] });
    expect(r.code).toBe(ExitCode.USAGE);
    expect(r.stderr).toContain('--out requires --force');
  });

  it('an environment variable does, because the caller set it', async () => {
    const r = await runBurgee(withDefault, { argv: ['push', '--out', 'x'], env: { APP_FORCE: 'true' } });
    expect(r.code).toBe(ExitCode.OK);
  });
});

describe('the static projections carry them', () => {
  const exported = schemaOf(program).commands.find((c) => c.name === 'export');

  it('--schema publishes both on the option that declares them', () => {
    const props = exported?.inputSchema.properties;
    expect(props?.['out']).toMatchObject({ dependsOn: ['--force'] });
    expect(props?.['csv']).toMatchObject({ exclusive: ['--table'] });
  });

  it('and leaves the key off an option that declares neither', () => {
    // Absent means "none declared"; an empty array in every option is bytes on every read.
    expect(exported?.inputSchema.properties['force']).not.toHaveProperty('dependsOn');
    expect(exported?.inputSchema.properties['table']).not.toHaveProperty('exclusive');
  });

  it('they reach the relations list too, so one reader sees every constraint', () => {
    expect(exported?.relations).toEqual([{ implies: ['out', 'force'] }, { conflicts: ['csv', 'table'] }]);
  });

  it('survives the round trip an agent actually makes', async () => {
    const r = await run(['export', '--schema']);
    expect(JSON.parse(r.stdout)).toMatchObject({ relations: [{ implies: ['out', 'force'] }, { conflicts: ['csv', 'table'] }] });
  });

  it('the Fig spec spells them with Fig’s own key names', () => {
    const spec = renderFigSpec(program) as unknown as { subcommands?: { name: string; options?: Record<string, unknown>[] }[] };
    const options = spec.subcommands?.find((s) => s.name === 'export')?.options ?? [];
    expect(options.find((o) => (o['name'] as string[]).includes('--out'))).toMatchObject({ dependsOn: ['--force'] });
    expect(options.find((o) => (o['name'] as string[]).includes('--csv'))).toMatchObject({ exclusiveOn: ['--table'] });
  });

  it('help says it on the option’s own line', () => {
    const node = program.find(['app', 'export']);
    const text = renderHelp(program, node!, { width: 100 });
    expect(text).toMatch(/--out <value>\s+where to write \(requires --force\)/);
    expect(text).toMatch(/--csv\s+comma separated \(conflicts with --table\)/);
  });
});
