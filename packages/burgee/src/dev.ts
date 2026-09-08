/**
 * `burgee dev <entry>` — your agent is connected to your CLI while you write it
 * (dev-loop W1–W6). The entry is imported with a cache-busting query, so every reload is
 * a fresh module graph and a fresh runtime (W1); MCP is served on stdio the whole time
 * and `tools/list_changed` goes out on each reload (W2); the manifest diff and the
 * rendered help are printed on stderr on every save (W3), stdout being the MCP channel.
 *
 * Dev-time only and removable (W4): nothing here is reachable from `burgee`, and the
 * command lives behind a dynamic import in the package's own CLI. It watches the entry
 * it is given, never a directory convention (W5), and uses nothing but `fs.watch`.
 */
import { watch, type FSWatcher } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { execute } from './execute.js';
import { renderHelp } from './help.js';
import { Manifest } from './manifest.js';
import { type Invoke, startMcp, toolsOf } from './mcp.js';
import { commandSchemaOf } from './schema.js';

export interface Writer {
  write: (s: string) => unknown;
}

export interface DevOptions {
  /** The module that exports the program: `program` (or `default`) as a burgee manifest, a commander `Command` or a yargs instance. */
  entry: string;
  /** The MCP channel. */
  input: NodeJS.ReadableStream;
  output: Writer;
  /** Where the reload report goes: never stdout, which carries MCP. */
  log: Writer;
  /** Off for tests that drive `reload()` themselves. */
  watch?: boolean;
  /** Files changed within this window coalesce into one reload. */
  debounceMs?: number;
}

export interface Loaded {
  manifest: Manifest;
  invoke: Invoke;
  kind: 'burgee' | 'commander' | 'yargs';
  /** Milliseconds from the trigger to the manifest being served (W6). */
  ms: number;
}

export interface DevHandle {
  ready: Promise<Loaded>;
  /** Re-import the entry, print the diff and the help, swap the served manifest. */
  reload: () => Promise<Loaded>;
  /** Settles when the MCP input closes. */
  done: Promise<void>;
  close: () => void;
}

const DEFAULT_DEBOUNCE_MS = 50;
const SOURCE = /\.(m?[jt]s|c[jt]s|json)$/;

interface Seam {
  stdout: Writer;
  stderr: Writer;
  exit: (code: number) => void;
}

interface CommanderLike {
  manifest: Manifest;
  parseAsync: (argv: string[], opts: { from: 'user' } & Seam) => Promise<unknown>;
}

interface YargsLike {
  manifest: Manifest;
  burgee: (seam: Seam) => { parseAsync: (argv: string[]) => Promise<unknown> };
}

function isManifest(x: unknown): x is Manifest {
  return x instanceof Manifest || (typeof x === 'object' && x !== null && Array.isArray((x as Manifest).commands) && Array.isArray((x as Manifest).rootPath));
}

function isYargs(x: unknown): x is YargsLike {
  return typeof x === 'object' && x !== null && typeof (x as YargsLike).burgee === 'function' && typeof (x as YargsLike).manifest === 'object';
}

function isCommander(x: unknown): x is CommanderLike {
  return typeof x === 'object' && x !== null && typeof (x as CommanderLike).parseAsync === 'function' && typeof (x as CommanderLike).manifest === 'object';
}

/** A tool call is the same run a `--json` caller gets, with the streams captured (N4). */
function invokeOn(program: Manifest | CommanderLike | YargsLike, kind: Loaded['kind'], entry: string): Invoke {
  return async (argv) => {
    const out: string[] = [];
    const err: string[] = [];
    let code = 0;
    const seam: Seam = { stdout: { write: (s) => out.push(s) }, stderr: { write: (s) => err.push(s) }, exit: (c) => void (code = c) };
    if (kind === 'burgee') await execute(program as Manifest, { argv, from: 'user', entry, ...seam });
    else if (kind === 'yargs') await (program as YargsLike).burgee(seam).parseAsync(argv);
    else await (program as CommanderLike).parseAsync(argv, { from: 'user', ...seam });
    return { stdout: out.join(''), stderr: err.join(''), code };
  };
}

/**
 * Import the entry as a fresh module graph. The query is what discards the previous
 * graph: the same URL would hand back the cached module and its stale handlers.
 */
export async function load(entry: string, generation: number): Promise<Loaded> {
  const started = performance.now();
  const url = pathToFileURL(resolve(entry));
  url.searchParams.set('burgee-dev', String(generation));
  const mod = (await import(url.href)) as Record<string, unknown>;
  const exported = mod['program'] ?? mod['default'];
  if (isManifest(exported)) return { manifest: exported, invoke: invokeOn(exported, 'burgee', entry), kind: 'burgee', ms: performance.now() - started };
  if (isYargs(exported)) return { manifest: exported.manifest, invoke: invokeOn(exported, 'yargs', entry), kind: 'yargs', ms: performance.now() - started };
  if (isCommander(exported)) return { manifest: exported.manifest, invoke: invokeOn(exported, 'commander', entry), kind: 'commander', ms: performance.now() - started };
  throw new Error(`${entry} exports no program: export a burgee manifest, a commander Command or a yargs instance as \`program\` or default`);
}

/** What changed between two manifests, by command path: added, removed, or a different schema. */
export function diffManifests(before: Manifest | undefined, after: Manifest): { added: string[]; removed: string[]; changed: string[] } {
  const key = (m: Manifest): Map<string, string> => new Map(m.commands.map((c) => [c.path.join(' '), JSON.stringify(commandSchemaOf(c, m.rootPath))]));
  const was = before === undefined ? new Map<string, string>() : key(before);
  const now = key(after);
  return {
    added: [...now.keys()].filter((k) => !was.has(k)),
    removed: [...was.keys()].filter((k) => !now.has(k)),
    changed: [...now.keys()].filter((k) => was.has(k) && was.get(k) !== now.get(k)),
  };
}

/** The reload report: one save, every surface (W3). */
export function report(before: Manifest | undefined, loaded: Loaded): string {
  const { manifest } = loaded;
  const diff = diffManifests(before, manifest);
  const lines: string[] = [];
  lines.push(`${before === undefined ? 'loaded' : 'reloaded'} ${manifest.rootPath.join(' ')} (${loaded.kind}) in ${loaded.ms.toFixed(0)} ms — ${manifest.commands.length} commands, ${toolsOf(manifest).length} MCP tools`);
  for (const p of diff.added) lines.push(`  + ${p}`);
  for (const p of diff.removed) lines.push(`  - ${p}`);
  for (const p of diff.changed) lines.push(`  ~ ${p}`);
  const root = manifest.find(manifest.rootPath);
  if (root !== undefined) lines.push('', renderHelp(manifest, root).trimEnd());
  return `${lines.join('\n')}\n`;
}

export function dev(opts: DevOptions): DevHandle {
  let generation = 0;
  let current: Manifest | undefined;
  let server: ReturnType<typeof startMcp> | undefined;
  let watcher: FSWatcher | undefined;
  let timer: NodeJS.Timeout | undefined;
  let chain: Promise<unknown> = Promise.resolve();
  const entry = resolve(opts.entry);

  const reloadNow = async (): Promise<Loaded> => {
    generation += 1;
    const loaded = await load(entry, generation);
    opts.log.write(report(current, loaded));
    current = loaded.manifest;
    if (server === undefined) server = startMcp(loaded.manifest, { input: opts.input, output: opts.output, invoke: loaded.invoke });
    else server.swap(loaded.manifest, loaded.invoke);
    return loaded;
  };
  // Reloads are serialised: a save during a reload queues the next one instead of racing it.
  const reload = (): Promise<Loaded> => {
    const next = chain.then(reloadNow, reloadNow);
    chain = next.catch((err: unknown) => {
      opts.log.write(`reload failed: ${err instanceof Error ? err.message : String(err)}\n`);
    });
    return next;
  };

  const ready = reload();
  if (opts.watch !== false) {
    watcher = watch(dirname(entry), { recursive: true }, (_event, filename) => {
      const name = filename === null ? '' : String(filename);
      if (name !== '' && (!SOURCE.test(name) || name.includes('node_modules'))) return;
      clearTimeout(timer);
      timer = setTimeout(() => void reload(), opts.debounceMs ?? DEFAULT_DEBOUNCE_MS);
    });
  }
  const done = ready.then(() => (server as ReturnType<typeof startMcp>).done).finally(() => watcher?.close());
  return {
    ready,
    reload,
    done,
    close: () => {
      clearTimeout(timer);
      watcher?.close();
    },
  };
}
