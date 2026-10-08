/**
 * `caique check <plugin-file>` — load a plugin, validate it, register it, and show what caique
 * does with it (PRINCIPLES 7, `plugin-contract` R8).
 *
 * PRINCIPLES 7 asks three things of an extension surface and only the first was built
 * family-wide: the plugin is **data validated against one published schema**. The second is a
 * **`check` command that renders it every way it can be seen**, and until 2026-09-22 that existed
 * in `flagstaff` alone — so an author writing for any other host found out what their plugin did
 * by running a program that used it. A surface nobody can check is a surface nobody outside this
 * repository can write against.
 *
 * Two things this owes an author, learned by `flagstaff check` in #59 and kept here:
 *
 *   - it says **what it found**. The schema allows unknown keys on purpose, so the same object
 *     registers into every host in the family — which means a misspelled key is silent. `0 widgets`
 *     is how that typo tells on itself, and it is a refusal here rather than an `ok`.
 *   - `ok` is **the last line**, after everything that would justify it.
 *
 * `flagstaff check` also says what each contribution replaced. This does not: it registers one
 * plugin into a registry it has just reset, so there is nothing for it to replace. The helper
 * that would have said so was never called, and was removed with the coverage pass.
 *
 * Pure: it takes argv and a writer and returns an exit code. `cli.ts` is the ten lines that own
 * the process, so this file can be driven by a test without spawning anything.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { PluginError, type PluginErrorCode, register, reset, validate, type Widget } from './plugin.js';

/**
 * E1, restated rather than imported: caique is an independent product and depends on nobody in
 * the family for its exit contract. `scripts/exit-code-lock.test.ts` keeps the restatements in
 * step.
 */
export const EXIT_OK = 0;
export const EXIT_RUNTIME = 1;
export const EXIT_USAGE = 2;

const USAGE = 'usage: caique check <plugin-file>\n';
const HELP = `${USAGE}
Load a plugin file, validate it against the family schema, register it, and report what
caique does with it. Exit 0 when it contributes, 1 on a refusal (with a code and a fix), 2 on
a usage error.

  -h, --help     show this help
  -V, --version  print the version
`;

/** The package's own version, read when asked for rather than on every run. */
function version(): string {
  return (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version;
}

/**
 * The plugin file, or the exit code when the argument is not one. A flag is never a plugin path:
 * before this, `caique --help` reached the `import()` and failed as `Cannot find module '…/--help'`
 * — the first thing a new user types, read as a file.
 */
function target(arg: string | undefined, write: (s: string) => void): string | number {
  if (arg === '--help' || arg === '-h') {
    write(HELP);
    return EXIT_OK;
  }
  if (arg === '--version' || arg === '-V') {
    write(`${version()}\n`);
    return EXIT_OK;
  }
  if (arg === undefined || arg.startsWith('-')) {
    write(arg === undefined ? USAGE : `unknown option ${arg}\n${USAGE}`);
    return EXIT_USAGE;
  }
  return arg;
}

/** Every way this command says no, in the family's vocabulary: the code, then the fix. */
function refuse(code: PluginErrorCode, message: string, fix: string, write: (s: string) => void): number {
  write(`${code}: ${message}\n  fix: ${fix}\n`);
  return EXIT_RUNTIME;
}

/**
 * Every refusal leaves through here, wherever it was raised: `register()`, or a plugin file that
 * registers itself on import — which throws inside the `import()`, before any line of `inspect`
 * could catch it, and used to reach the bin as a bare message with no code and no fix (R8).
 */
export async function check(argv: readonly string[], write: (s: string) => void): Promise<number> {
  try {
    return await inspect(argv, write);
  } catch (error) {
    if (!(error instanceof PluginError)) throw error;
    return refuse(error.code, error.message, error.fix, write);
  }
}

async function inspect(argv: readonly string[], write: (s: string) => void): Promise<number> {
  const file = target(argv[0], write);
  if (typeof file === 'number') return file;
  // eslint-disable-next-line node-security/no-dynamic-dependency-loading -- the file to check is the user's own, named on the command line
  const loaded = (await import(pathToFileURL(resolve(file)).href)) as { default?: unknown };
  const plugin: unknown = loaded.default ?? loaded;
  reset();
  validate(plugin);
  register(plugin);
  const name = (plugin as { name: string }).name;
  const threw: string[] = [];
  const rows = Object.entries((plugin as { widgets?: Record<string, Widget> }).widgets ?? {}).map(([kind, w]) => {
    // The static projection is the one every widget must have — it is what a pipe, a CI log and
    // an agent see — so it is the one shown. Rendered with the widget's own sample when it has
    // one; without one there is nothing honest to render it with, and the row says so.
    if (w.sample === undefined) return `${kind}  (no sample — give the widget a \`sample\` to preview its static projection)`;
    try {
      return `${kind}  static ${JSON.stringify(w.static({ kind, message: 'preview', ...(w.sample.done as object) } as Parameters<Widget['static']>[0]))}`;
    } catch (error) {
      // A `static` that throws on the widget's own sample is a widget with no static projection
      // on exactly the surfaces that need one, so it is refused below, never followed by `ok`.
      const said = error instanceof Error ? error.message : String(error);
      threw.push(`plugin "${name}": widget "${kind}"’s static projection threw on its own sample: ${said}`);
      return `${kind}  static projection threw: ${said}`;
    }
  });
  write(`${name} — ${String(rows.length)} widgets\n`);
  if (rows.length === 0) {
    return refuse(
      'E_NO_CONTRIBUTION',
      `${name} registers, but contributes nothing caique reads`,
      'add a `widgets` section — a key another package in the family reads is allowed in the same object, but `caique check` cannot show it',
      write,
    );
  }
  for (const row of rows) write(`  ${row}\n`);
  if (threw.length > 0) {
    for (const message of threw) {
      refuse('E_NO_STATIC_PROJECTION', message, 'make `static` return a string for its `sample.done` — it is what a pipe, an agent and a screen reader get, and a throw leaves them nothing', write);
    }
    return EXIT_RUNTIME;
  }
  write(`${name}: ok\n`);
  return EXIT_OK;
}
