/**
 * `controlroom check <plugin-file>` — the feedback loop for a plugin author (PRINCIPLES 7).
 * Load the file, validate it against the family schema, register it, and show what controlroom
 * does with it: each keymap as the hint line it generates and the keys it binds, each pane as
 * the component it draws with. A refusal carries a code and a fix; a plugin with nothing for
 * this host is refused too (`E_NO_CONTRIBUTION`), so a misspelled key tells on itself.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { PluginError, type PluginErrorCode, register, registered } from './plugin.js';
import { hints } from './tabs.js';

export const EXIT_OK = 0;
export const EXIT_RUNTIME = 1;
export const EXIT_USAGE = 2;

const USAGE = 'usage: controlroom check <plugin-file>\n';
const HELP = `${USAGE}
Load a plugin file, validate it against the family schema, register it, and report what
controlroom does with it. Exit 0 when it contributes, 1 on a refusal (with a code and a fix), 2 on
a usage error.

  -h, --help     show this help
  -V, --version  print the version
`;

function version(): string {
  return (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version;
}

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

function refuse(code: PluginErrorCode, message: string, fix: string, write: (s: string) => void): number {
  write(`${code}: ${message}\n  fix: ${fix}\n`);
  return EXIT_RUNTIME;
}

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
  register(plugin);
  const { name, keymaps = {}, panes = {} } = plugin as { name: string; keymaps?: Record<string, unknown>; panes?: Record<string, unknown> };
  const now = registered();
  const rows = [
    ...Object.keys(keymaps).map((key) => {
      const def = now.keymaps.get(key)!;
      return `keymap ${key}  ${String(Object.keys(def.keys).length)} keys  hint: ${hints(def.keys, def.labels) || '(no labels: bound, not advertised)'}`;
    }),
    ...Object.keys(panes).map((key) => {
      const def = now.panes.get(key)!;
      return `pane ${key}  drawn by flagstaff's "${def.component}"${def.label === undefined ? '' : `, labelled "${def.label}"`}`;
    }),
  ];
  write(`${name} — ${String(Object.keys(keymaps).length)} keymaps, ${String(Object.keys(panes).length)} panes\n`);
  if (rows.length === 0) {
    return refuse(
      'E_NO_CONTRIBUTION',
      `${name} registers, but contributes nothing controlroom reads`,
      'add a `keymaps` or `panes` section — a key another package in the family reads is allowed in the same object, but `controlroom check` cannot show it',
      write,
    );
  }
  for (const row of rows) write(`  ${row}\n`);
  write(`${name}: ok\n`);
  return EXIT_OK;
}
