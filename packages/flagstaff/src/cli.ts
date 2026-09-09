#!/usr/bin/env node
/**
 * `flagstaff check <file>` (R8, U9): load a plugin file, validate it against the schema,
 * and print every contribution in all five output modes side by side, so an author — or an
 * agent that just wrote one — sees the static projection next to the animation before
 * anything ships. Exit 1 on a refusal, with the code and the fix.
 *
 * Three things this command owes an author, learned from #59: it says **what it found**
 * (`0 spinners, 0 components` is how a misspelled key tells on itself, since the schema
 * allows unknown keys on purpose); it says **which state** a component was rendered with,
 * rather than inventing one silently; and it never prints `ok` before the rendering that
 * would justify it — the verdict is the last line, and a component that throws is a
 * refusal with a code, a fix, and the modes it broke in.
 *
 * This is the package's command line, so it owns the process by definition; everything it
 * renders goes through the same `hoist()` a program uses, over buffers and a manual clock.
 */
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { hoist, manualClock, type Runtime } from './loop.js';
import { type Component, PluginError, type PluginErrorCode, register, registered, type Plugin } from './plugin.js';
import { spinner, type SpinnerState } from './spinner.js';

const MODES = ['tty', 'pipe', 'ci', 'json', 'accessible'] as const;
type Mode = (typeof MODES)[number];
const ENV: Record<Mode, Record<string, string>> = { tty: {}, pipe: {}, ci: { CI: 'true' }, json: {}, accessible: { CLI_ACCESSIBLE: '1' } };
const LABEL_WIDTH = 12;
const FRAMES_SHOWN = 3;
/**
 * E1, declared here rather than imported: flagstaff is an independent product and does not
 * depend on burgee, so the family's exit contract is restated by each package that has a
 * command line. `scripts/exit-code-lock.test.ts` is what keeps the three restatements from
 * drifting — it refuses a value that is not one of the six, and refuses a bare literal at
 * an exit site, which is what line 186 used to be.
 */
const EXIT_OK = 0;
const EXIT_RUNTIME = 1;
const EXIT_USAGE = 2;

/** The keys flagstaff itself reads. Everything else is another package's, or a typo. */
// `$schema` is not read either, but it is the pointer an author adds when they write the
// plugin against `flagstaff/schema.json` — which the package's own eval tells them to do —
// so reporting it as unknown would flag the recommended practice.
const KNOWN = ['$schema', 'name', 'contract', 'tokens', 'glyphs', 'spinners', 'borders', 'components'];
/** The five that carry contributions, in the order the census reports them. */
const KINDS = ['spinners', 'borders', 'components', 'glyphs', 'tokens'] as const;

interface Sample {
  running: unknown;
  done: unknown;
}

/** What a component is shown with when it declares no `sample` of its own — stated, never assumed silently. */
const ASSUMED: Sample = { running: { phase: 'running' }, done: { phase: 'done' } };
const SPIN: Sample = { running: { text: 'working' } satisfies SpinnerState, done: { text: 'done', status: 'ok' } satisfies SpinnerState };

const FIX_NO_CONTRIBUTION =
  'flagstaff reads spinners, borders, components, glyphs and tokens; check those spellings. A key another package in the family reads is allowed in the same object, but `flagstaff check` cannot grade one.';
const FIX_THREW = '`static(state)` must return a string for the state it is rendered with; give the component a `sample: { running, done }` of the shape it expects';

const visible = (s: string): string => s.replaceAll('\u001B', '␛').replaceAll('\r', '␍').replaceAll('\n', '⏎ ');

/** One mode's transcript for one component, escapes made visible — or the throw that mode produced. */
function render(component: Component, mode: Mode, sample: Sample): { text: string; threw: boolean } {
  const out: string[] = [];
  const err: string[] = [];
  const clock = manualClock();
  const rt: Runtime = { env: ENV[mode], isTTY: { stdout: mode === 'tty' }, stdout: { write: (s: string) => out.push(s) }, stderr: { write: (s: string) => err.push(s) }, clock };
  try {
    const flag = hoist(component, rt, sample.running, { json: mode === 'json' });
    for (let i = 0; i < FRAMES_SHOWN; i += 1) clock.tick(component.interval ?? 0);
    flag.lower(sample.done);
  } catch (e) {
    // A `static` that cannot survive the state it is handed is a defect in the plugin, and
    // this is the command that exists to find it: report the mode, keep going, refuse at the end.
    return { text: `threw: ${e instanceof Error ? e.message : String(e)}`, threw: true };
  }
  return { text: visible([...out, ...err].join('')), threw: false };
}

const row = (label: string, text: string): string => `  ${label.padEnd(LABEL_WIDTH)}${text}\n`;

/** What a component is shown with, and where that came from — one argument, because they are one decision. */
interface Shown {
  sample: Sample;
  note: string;
}

/** One block: the title, the sample state when there is one to state, and the five modes. Returns the modes that threw. */
function show(title: string, component: Component, { sample, note }: Shown, write: (s: string) => void): Mode[] {
  write(`${title}\n`);
  if (note !== '') write(row('sample', note));
  const broke: Mode[] = [];
  for (const mode of MODES) {
    const { text, threw } = render(component, mode, sample);
    if (threw) broke.push(mode);
    write(row(mode, text));
  }
  return broke;
}

/** What the plugin actually contributes, counted from the object rather than from the registry. */
function census(plugin: Record<string, unknown>): { line: string; total: number } {
  let total = 0;
  const parts = KINDS.map((kind) => {
    const n = Object.keys((plugin[kind] ?? {}) as object).length;
    total += n;
    return `${n} ${n === 1 ? kind.slice(0, -1) : kind}`;
  });
  return { line: parts.join(', '), total };
}

/**
 * Every way this command says no. `code` is `PluginErrorCode`, not `string`, so a refusal
 * invented here rather than declared in `plugin.ts` fails `typecheck` (plugin-contract R8) —
 * the type is erased at build time, so the seam costs nothing on any subpath.
 */
function refuse(code: PluginErrorCode, message: string, fix: string, write: (s: string) => void): number {
  write(`${code}: ${message}\n  fix: ${fix}\n`);
  return EXIT_RUNTIME;
}

/** The sample a component is shown with, and the line that says where it came from. */
function sampleFor(def: Omit<Component, 'name'>): Shown {
  const own = def.sample;
  if (own === undefined) return { sample: ASSUMED, note: `assumed ${JSON.stringify(ASSUMED)} — give the component a \`sample\` to choose its own` };
  // The sample is the author's own data, and `JSON.stringify` throws on a circular object or
  // a BigInt. Printing the note is not worth killing the run over: `check` refuses in its own
  // vocabulary or it says nothing, and a bare "Converting circular structure to JSON" is the
  // shape of failure this command exists to remove.
  return { sample: own, note: `from the component: ${describe(own)}` };
}

/** `JSON.stringify`, or a plain word when the value will not serialize. */
function describe(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return '(not serializable — shown as given)';
  }
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
    return refuse(e.code, e.message, e.fix, write);
  }
  const { name, spinners = {}, components = {} } = plugin as Plugin;
  const { line, total } = census(plugin as Record<string, unknown>);
  write(`${name} — ${line}\n`);
  const unknown = Object.keys(plugin as object)
    .filter((key) => !KNOWN.includes(key))
    .sort();
  if (unknown.length > 0) write(row('unknown', `${unknown.join(', ')} — flagstaff reads none of these; a key another package in the family reads is allowed here`));
  if (total === 0) return refuse('E_NO_CONTRIBUTION', `${name} registers, but contributes nothing flagstaff can render`, FIX_NO_CONTRIBUTION, write);

  const broke: string[] = [];
  // `show()` returns the modes that threw. Dropping it for spinners would let a spinner block
  // print `threw:` rows and still reach `name: ok` with exit 0 — the very defect #59 was filed
  // for, one surface over. Unreachable today (a spinner's `static` is a string in the schema),
  // which is exactly when it is cheap to close.
  for (const style of Object.keys(spinners)) {
    const modes = show(`spinner ${style}`, spinner(style) as Component, { sample: SPIN, note: '' }, write);
    if (modes.length > 0) broke.push(`spinner ${style} threw in ${modes.join(', ')}`);
  }
  for (const [cname, def] of Object.entries(components)) {
    const modes = show(`component ${cname}`, { ...def, name: cname }, sampleFor(def), write);
    if (modes.length > 0) broke.push(`${cname} threw in ${modes.join(', ')}`);
  }
  if (broke.length > 0) return refuse('E_COMPONENT_THREW', broke.join('; '), FIX_THREW, write);
  write(`${name}: ok${before.has(name) ? ' (replaces an earlier registration)' : ''}\n`);
  return EXIT_OK;
}

const [, , command, ...rest] = process.argv;
const args = command === 'check' ? rest : [command, ...rest].filter((a): a is string => a !== undefined);
main(args, (s) => process.stdout.write(s)).then(
  (code) => {
    process.exitCode = code;
  },
  (e: unknown) => {
    process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
    process.exitCode = EXIT_RUNTIME;
  },
);
