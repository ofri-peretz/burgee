/**
 * An option key that is not already camelCase silently never reaches the handler.
 *
 * `toParseConfig` kebabs the declared key to build the flag and `canonical` camels every
 * parsed key back, so the flag layer handed to `resolveLayers` is keyed camelCase — while
 * the specs beside it are keyed as declared. Declare `'dry-run'` and the two never meet:
 * `--dry-run` parses, resolves to nothing, and the handler is given `undefined`. No error
 * anywhere, which is why this is refused where it is written rather than repaired at run
 * time — a second accepted spelling would have to be threaded through help, `--schema`,
 * Fig, the config and package.json layers and the relation names, for a key the engine
 * already has one canonical form of (S5, `names.ts`).
 *
 * Found while building `burgee migrate`: it showed up only through the built binary,
 * because every in-process case had been written in camelCase.
 */
import { describe, expect, it } from 'vitest';

import { program } from './cli.js';
import { checkDefinition, defineCommand, defineProgram } from './index.js';
import { camel, kebab } from './names.js';
import { runBurgee } from './testing.js';

/** The invariant: a key survives the round trip the engine actually performs on it. */
const canonical = (key: string): boolean => camel(kebab(key)) === key;

describe('option keys are canonical', () => {
  it('refuses a kebab-case declaration at definition time', () => {
    expect(() => checkDefinition('c', { 'dry-run': { type: 'boolean' } })).toThrow(/"dryRun" and "dry-run".*--dry-run/);
  });

  it('still accepts the canonical key, whose flag is kebab-case', async () => {
    const c = defineCommand({
      name: 'c',
      effects: 'read_only',
      options: { dryRun: { type: 'boolean' } },
      run: ({ options }) => ({ keys: Object.keys(options) }),
    });
    const p = defineProgram({ name: 'p', commands: [c] });
    const { json } = await runBurgee(p, { argv: ['c', '--json', '--dry-run'] });
    expect(json).toMatchObject({ data: { keys: ['dryRun'] } });
  });

  // The lock on the shipped CLI, walking the manifest so it grows with the program.
  // Three of these were live: --allow-low-contrast never suppressed the WCAG failure,
  // --bordure-width was always the default, and `burgee dev --no-watch` still watched.
  it('every command burgee itself ships declares only canonical keys', () => {
    const offenders = program.commands.flatMap((c) =>
      Object.keys(c.options ?? {})
        .filter((k) => !canonical(k))
        .map((k) => `${c.path.join(' ')} --${k}`),
    );
    expect(offenders).toEqual([]);
  });
});
