/**
 * Lock — a plugin's lifecycle closes on every front end, not just the engine.
 *
 * The plugin contract is three hooks, and the contract between them is what makes them usable:
 * `preRun` opens, and **exactly one of `postRun` or `onError` closes**. A plugin that starts a
 * span, opens a file, takes a lock or writes an audit line in `preRun` has nowhere to finish it
 * otherwise, and "nowhere" is not an edge case — it is every command that throws.
 *
 * The engine holds that contract: `dispatch` fires `preRun`, runs, fires `postRun`, and a throw
 * unwinds to `report`, which fires `onError`. **The two façades did not.** Both ran
 * `preRun → handler → postRun` as a `.then` chain, so a handler that threw skipped `postRun`
 * *and* never reached `onError` — a plugin got an opening hook and no closing one at all.
 *
 * That is the worse half of the defect. The plainer half: `onError` was never fired by either
 * façade under any circumstances, so a plugin declaring it was **silently dead** on a
 * commander- or yargs-syntax program. Those are the two drop-in front ends this package exists
 * for, and neither commander nor yargs has a plugin system of its own — so the hook a user came
 * here for was the one that did not run.
 *
 * Every case below fails on the `.then`-only chain.
 */
import { describe, expect, it } from 'vitest';

import { Command } from './commander.js';
import { definePlugin } from './plugin.js';
import yargs from './yargs.js';

/** Records which hooks it was given, in order, for whichever front end runs it. */
function recorder(log: string[]) {
  return definePlugin({
    name: 'recorder',
    hooks: {
      preRun: { handler: ({ command }) => void log.push(`pre:${command}`) },
      postRun: { handler: ({ command }) => void log.push(`post:${command}`) },
      onError: { handler: ({ command }) => void log.push(`error:${command}`) },
    },
  });
}

const BOOM = 'the handler came apart';

describe('a plugin gets a closing hook on every front end', () => {
  it('commander: postRun closes a command that succeeds', async () => {
    const log: string[] = [];
    const program = new Command('app').use(recorder(log));
    program.command('ship').action(() => undefined);
    await program.parseAsync(['ship'], { from: 'user' });
    expect(log).toEqual(['pre:ship', 'post:ship']);
  });

  it('commander: onError closes a command that throws', async () => {
    const log: string[] = [];
    const program = new Command('app').use(recorder(log));
    program.command('ship').action(() => {
      throw new Error(BOOM);
    });
    await expect(program.parseAsync(['ship'], { from: 'user' })).rejects.toThrow(BOOM);
    expect(log, 'a plugin opened in preRun and was never given a hook to close in').toEqual(['pre:ship', 'error:ship']);
  });

  it('yargs: postRun closes a command that succeeds', async () => {
    const log: string[] = [];
    const cli = yargs(['ship']).use(recorder(log)).command('ship', 'send it', {}, () => undefined);
    await cli.parseAsync();
    expect(log).toEqual(['pre:ship', 'post:ship']);
  });

  it('yargs: onError closes a command that throws', async () => {
    const log: string[] = [];
    const cli = yargs(['ship'])
      .use(recorder(log))
      .command('ship', 'send it', {}, () => {
        throw new Error(BOOM);
      })
      .fail(false);
    await expect(cli.parseAsync()).rejects.toThrow(BOOM);
    expect(log, 'a plugin opened in preRun and was never given a hook to close in').toEqual(['pre:ship', 'error:ship']);
  });

  it('closes exactly once, never both ways', async () => {
    const log: string[] = [];
    const program = new Command('app').use(recorder(log));
    program.command('ship').action(() => {
      throw new Error(BOOM);
    });
    await expect(program.parseAsync(['ship'], { from: 'user' })).rejects.toThrow(BOOM);
    expect(log.filter((l) => l.startsWith('post:')), 'postRun ran on a command that failed').toEqual([]);
  });
});
