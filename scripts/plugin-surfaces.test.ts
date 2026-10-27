/**
 * flagstaff criterion 8 — one plugin object, registered with each host that reads it, shows up on
 * the three surfaces a person or an agent sees: in **help** (its tokens, through the theme seam), in
 * a **prompt's spinner** (its `spinners` entry, in caique's spinner) and as **events under
 * `--json`** (its component, hoisted by a burgee handler). One conformance case per surface.
 *
 * No package requires another for this (D-20261027-prompt-spinner-composed): roundel's tokens
 * reach burgee's help through `HelpOptions.theme`, flagstaff's registered spinner reaches caique's
 * through `style` as data, and burgee hands a handler `ctx.json`, which flagstaff's `hoist` reads
 * as its mode. This file is the family's side of that composition, which is where Principle 8
 * says family integration is documented.
 */
import { Writable } from 'node:stream';

import { afterEach, describe, expect, it, vi } from 'vitest';

// eslint-disable-next-line import-next/no-relative-packages -- see above
import { renderHelp } from '../packages/burgee/src/help.js';
// eslint-disable-next-line import-next/no-relative-packages -- the source, by path, on purpose: the package-name form resolves to `dist/`, which would check the last build rather than the tree
import { defineCommand, defineProgram, runCommand } from '../packages/burgee/src/index.js';
// eslint-disable-next-line import-next/no-relative-packages -- see above
import { spinner } from '../packages/caique/src/clack-output.js';
// eslint-disable-next-line import-next/no-relative-packages -- see above
import { hoist, manualClock } from '../packages/flagstaff/src/loop.js';
// eslint-disable-next-line import-next/no-relative-packages -- see above
import { lookupSpinner, register as registerWithFlagstaff, registered } from '../packages/flagstaff/src/plugin.js';
// eslint-disable-next-line import-next/no-relative-packages -- see above
import { register as registerWithRoundel, theme } from '../packages/roundel/src/plugin.js';
// eslint-disable-next-line import-next/no-relative-packages -- see above
import { fly } from '../packages/roundel/src/theme.js';
// eslint-disable-next-line import-next/no-relative-packages -- see above
import { command, flag, heading, value } from '../packages/roundel/src/tokens.js';

interface DeployState {
  step: string;
}

/** The plugin: a brand colour, a spinner and a component, each with what a pipe prints instead. */
const harbor = {
  name: 'harbor',
  contract: 1,
  tokens: { flag: '#79c0ff' },
  spinners: { harbor: { frames: ['⠁', '⠂', '⠄'], interval: 80, static: '⠿' } },
  components: { 'harbor-deploy': { static: (s: DeployState) => `deploy: ${s.step}`, sample: { running: { step: 'build' }, done: { step: 'live' } } } },
} as const;

registerWithRoundel(harbor);
registerWithFlagstaff(harbor);
afterEach(() => {
  vi.useRealTimers();
});

/** A stream that keeps what is written to it, a terminal or not. */
class Screen extends Writable {
  text = '';
  constructor(readonly isTTY: boolean) {
    super();
  }
  override _write(chunk: Buffer | string, _encoding: BufferEncoding, done: () => void): void {
    this.text += chunk.toString();
    done();
  }
}

const deploy = (events: string[]): ReturnType<typeof defineProgram> =>
  defineProgram({
    name: 'ship',
    commands: [
      defineCommand({
        name: 'deploy',
        description: 'Ship it',
        effects: 'non_idempotent',
        options: { target: { type: 'string', description: 'where to' } },
        // The handler draws the plugin's component the way a program does: `ctx.runtime` for the
        // policy, `ctx.json` for the mode — the only part of this that burgee had to grow.
        run: (ctx) => {
          const component = registered().components.get('harbor-deploy');
          if (component === undefined) throw new Error('harbor-deploy is not registered');
          const writer = { write: (s: string) => events.push(s) };
          const flown = hoist(component, { ...ctx.runtime, stdout: writer, stderr: writer, clock: manualClock() }, { step: 'build' }, { json: ctx.json });
          flown.lower({ step: 'live' });
          return { shipped: true };
        },
      }),
    ],
  });

describe('one plugin, registered with each host that reads it, on all three surfaces (flagstaff criterion 8)', () => {
  it('help: its token colours the flags burgee lists, through the theme seam', () => {
    fly(theme(), { env: { FORCE_COLOR: '3' }, isTTY: { stdout: true } });
    const program = deploy([]);
    const node = program.commands.find((c) => c.path.at(-1) === 'deploy');
    if (node === undefined) throw new Error('no deploy command');
    const help = renderHelp(program, node, { color: true, theme: { flag, command, value, heading } });
    // #79c0ff as a 24-bit foreground: the plugin's colour, not burgee's default cyan.
    expect(help).toContain('\u001B[38;2;121;192;255m--target');
    expect(help).not.toContain('\u001B[36m--target');
  });

  it('a prompt’s spinner: its frames turn on a terminal, and its static line is what a pipe gets', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const style = lookupSpinner('harbor');
    const terminal = new Screen(true);
    const spin = spinner({ output: terminal, withGuide: false, runtime: { env: {}, isTTY: { stdout: true } }, style });
    spin.start('waiting for the registry');
    vi.advanceTimersByTime(style.interval * 2);
    spin.stop('ready');
    expect(terminal.text).toContain('⠁  waiting for the registry');
    expect(terminal.text).toContain('⠂  waiting for the registry');
    expect(terminal.text).toContain('⠄  waiting for the registry');

    const pipe = new Screen(false);
    const piped = spinner({ output: pipe, withGuide: false, runtime: { env: {}, isTTY: { stdout: false } }, style });
    piped.start('waiting for the registry');
    piped.stop('ready');
    expect(pipe.text.split('\n')[0]).toBe('⠿  waiting for the registry...');
  });

  it('--json: its component arrives as one event per state, by its own name, and stdout is the envelope', async () => {
    const events: string[] = [];
    const r = await runCommand(deploy(events), ['deploy', '--json']);
    expect(JSON.parse(r.stdout)).toMatchObject({ ok: true, data: { shipped: true } });
    expect(events.map((e) => JSON.parse(e) as unknown)).toEqual([
      { event: 'harbor-deploy', state: { step: 'build' } },
      { event: 'harbor-deploy', state: { step: 'live' } },
    ]);
  });

  it('and without --json the same handler prints the component’s static line per state, not events', async () => {
    const events: string[] = [];
    await runCommand(deploy(events), ['deploy']);
    expect(events.join('')).toBe('deploy: build\ndeploy: live\n');
  });
});

