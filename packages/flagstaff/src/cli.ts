#!/usr/bin/env node
/**
 * `flagstaff check <file>` (R8, U9): load a plugin file, validate it against the schema,
 * and print every contribution in all five output modes side by side, so an author — or an
 * agent that just wrote one — sees the static projection next to the animation before
 * anything ships. Exit 1 on a refusal, with the code and the fix.
 *
 * This is the package's command line, so it owns the process by definition; everything it
 * renders goes through the same `hoist()` a program uses, over buffers and a manual clock.
 */
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { hoist, manualClock, type Runtime } from './loop.js';
import { type Component, PluginError, register, registered, type Plugin } from './plugin.js';
import { spinner, type SpinnerState } from './spinner.js';

const MODES = ['tty', 'pipe', 'ci', 'json', 'accessible'] as const;
type Mode = (typeof MODES)[number];
const ENV: Record<Mode, Record<string, string>> = { tty: {}, pipe: {}, ci: { CI: 'true' }, json: {}, accessible: { CLI_ACCESSIBLE: '1' } };
const LABEL_WIDTH = 12;
const FRAMES_SHOWN = 3;
const EXIT_USAGE = 2;

interface Sample {
  running: unknown;
  done: unknown;
}

/** One mode's transcript for one component, escapes made visible. */
function render(component: Component, mode: Mode, sample: Sample): string {
  const out: string[] = [];
  const err: string[] = [];
  const clock = manualClock();
  const rt: Runtime = { env: ENV[mode], isTTY: { stdout: mode === 'tty' }, stdout: { write: (s: string) => out.push(s) }, stderr: { write: (s: string) => err.push(s) }, clock };
  const flag = hoist(component, rt, sample.running, { json: mode === 'json' });
  for (let i = 0; i < FRAMES_SHOWN; i += 1) clock.tick(component.interval ?? 0);
  flag.lower(sample.done);
  return [...out, ...err].join('').replaceAll('\u001B', '␛').replaceAll('\r', '␍').replaceAll('\n', '⏎ ');
}

function show(title: string, component: Component, sample: Sample, write: (s: string) => void): void {
  write(`${title}\n`);
  for (const mode of MODES) write(`  ${mode.padEnd(LABEL_WIDTH)}${render(component, mode, sample)}\n`);
}

async function main(argv: string[], write: (s: string) => void): Promise<number> {
  const file = argv[0];
  if (file === undefined) {
    write('usage: flagstaff check <plugin-file>\n');
    return EXIT_USAGE;
  }
  const before = new Set(registered().plugins);
  // eslint-disable-next-line node-security/no-dynamic-dependency-loading -- the file to check is the user's own, named on the command line
  const loaded = (await import(pathToFileURL(resolve(file)).href)) as { default?: unknown };
  const plugin = loaded.default ?? loaded;
  try {
    register(plugin);
  } catch (e) {
    if (!(e instanceof PluginError)) throw e;
    write(`${e.code}: ${e.message}\n  fix: ${e.fix}\n`);
    return 1;
  }
  const { name, spinners = {}, components = {} } = plugin as Plugin;
  write(`${name}: ok${before.has(name) ? ' (replaces an earlier registration)' : ''}\n`);
  const spin: Sample = { running: { text: 'working' } satisfies SpinnerState, done: { text: 'done', status: 'ok' } satisfies SpinnerState };
  for (const style of Object.keys(spinners)) show(`spinner ${style}`, spinner(style) as Component, spin, write);
  for (const [cname, def] of Object.entries(components)) show(`component ${cname}`, { ...def, name: cname }, { running: { phase: 'running' }, done: { phase: 'done' } }, write);
  return 0;
}

const [, , command, ...rest] = process.argv;
const args = command === 'check' ? rest : [command, ...rest].filter((a): a is string => a !== undefined);
main(args, (s) => process.stdout.write(s)).then(
  (code) => {
    process.exitCode = code;
  },
  (e: unknown) => {
    process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
    process.exitCode = 1;
  },
);
