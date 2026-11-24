import { ExitCode } from 'burgee';
import { runBurgee } from 'burgee/testing';
import { beforeAll, describe, expect, it } from 'vitest';

import { carryFix, carryingFix, Refusal } from './cli.js';
import { UsageError } from './run-config.js';

import { program } from './index.js';

/** Each command still planned by the spine, with the roadmap phase that delivers it and what it does to the user's files. */
const COMMANDS = [['check', 'Phase 7', 'read_only']] as const;

/** The commands the spine runs for real (run-command.ts): both write files, and a rerun is safe. */
const WORKING = [
  ['gen', 'idempotent'],
  ['extract', 'idempotent'],
] as const;

/** The commands whose lanes are under way: their effects are fixed here, their behaviour by their lane. */
const LANE_COMMANDS = [
  ['explain', 'read_only'],
  ['diff', 'idempotent'],
  ['migrate', 'idempotent'],
  ['plugin', 'idempotent'],
  ['props', 'idempotent'],
] as const;

describe('contractdiff, Phase 0', () => {
  // burgee's first run loads its renderers lazily; paying that here keeps each case under 5 s.
  beforeAll(async () => {
    await runBurgee(program, { argv: ['--version'] });
  });

  it.each(COMMANDS)('declares `%s` and fails it with a fix line naming %s', async (command, phase) => {
    const r = await runBurgee(program, { argv: [command, '--json'] });
    expect(r.code).toBe(ExitCode.RUNTIME);
    expect((r.json as { error: { fix: string } }).error.fix).toContain(`it lands in ${phase}`);
  });

  it('leads with the two commands that are the product: spec to code, and code to spec', async () => {
    const r = await runBurgee(program, { argv: ['--schema'] });
    const { commands } = JSON.parse(r.stdout) as { commands: { name: string }[] };
    expect(commands.map((c) => c.name).slice(0, 2)).toEqual(['gen', 'extract']);
  });

  it('declares what each command does to files: the ones that write say so, the rest are read-only for an agent', async () => {
    const r = await runBurgee(program, { argv: ['--schema'] });
    expect(r.code).toBe(ExitCode.OK);
    const { commands } = JSON.parse(r.stdout) as { commands: { name: string; effects?: string }[] };
    const effects = Object.fromEntries(commands.map((c) => [c.name, c.effects]));
    for (const [name, , effect] of COMMANDS) expect(effects[name], name).toBe(effect);
    for (const [name, effect] of WORKING) expect(effects[name], name).toBe(effect);
    for (const [name, effect] of LANE_COMMANDS) expect(effects[name], name).toBe(effect);
  });
});

describe('a refusal with its fix (carryFix)', () => {
  it('moves the one fix of a plain Error onto a refusal burgee reads it from, at exit 1', () => {
    const cause = new Error('the thing broke. fix: mend it, then run again');
    const carried = carryFix(cause) as Refusal;
    expect(carried).toBeInstanceOf(Refusal);
    expect(carried).toMatchObject({ name: 'Refusal', message: 'the thing broke', fix: 'mend it, then run again', cause });
    expect((Refusal as unknown as Record<symbol, unknown>)[Symbol.for('burgee.exitCode')]).toBe(ExitCode.RUNTIME);
  });

  it('keeps an error burgee names by its code, with the fix put on it', () => {
    const usage = new UsageError('--x is wrong. fix: pass --y');
    expect(carryFix(usage)).toBe(usage);
    expect(usage).toMatchObject({ code: 'USAGE', message: '--x is wrong', fix: 'pass --y' });
  });

  it('leaves alone what is not one fix: no fix, two fixes, a fix already carried, a value that is not an Error', () => {
    for (const message of ['nothing to do', 'two. fix: one\n  - and. fix: two', 'fix: with nothing before it', 'no dot fix: here']) {
      const error = new Error(message);
      expect(carryFix(error)).toBe(error);
      expect(error.message).toBe(message);
    }
    const carried = Object.assign(new Error('a. fix: b'), { fix: 'c' });
    expect(carryFix(carried)).toBe(carried);
    expect(carried.message).toBe('a. fix: b');
    expect(carryFix('a. fix: b')).toBe('a. fix: b');
  });

  it('wraps a command\'s run, and leaves a command with none as it is', async () => {
    const group: { name: string; run?: undefined } = { name: 'g' };
    expect(carryingFix(group)).toBe(group);
    const failing = carryingFix({
      name: 'f',
      run: () => {
        throw new Error('no. fix: yes');
      },
    });
    await expect((failing.run as (context: never) => Promise<unknown>)(undefined as never)).rejects.toMatchObject({ message: 'no', fix: 'yes' });
    const working = carryingFix({ name: 'w', run: () => 1 });
    expect(await (working.run as unknown as (context: never) => Promise<unknown>)(undefined as never)).toBe(1);
  });

  it('prints a failed run\'s fix once, as burgee\'s fix line, and no usage block after it', async () => {
    const text = await runBurgee(program, { argv: ['diff', 'missing-old.yaml', 'missing-new.yaml'] });
    expect(text.code).toBe(ExitCode.USAGE);
    expect(text.stderr.startsWith('error: there is no file missing-old.yaml\nfix: pass the path of a contract file, or git:<ref>:<path> for one at a ref\n')).toBe(true);
    expect(text.stderr).not.toContain('usage:');
    const json = await runBurgee(program, { argv: ['check', '--json'] });
    expect(json.json).toEqual({ ok: false, error: { kind: 'runtime', code: ExitCode.RUNTIME, message: '`contractdiff check` is not implemented yet', fix: 'it lands in Phase 7 (.sdlc/intents/contractdiff/roadmap.md)' } });
  });
});
