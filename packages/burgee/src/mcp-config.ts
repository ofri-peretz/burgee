/**
 * mcp-current R6 — `--mcp --print-config`: the `mcpServers` block a client's configuration takes
 * to start this program as an MCP server, generated for the program that printed it rather than
 * copied from a template that names `mytool`.
 *
 * The command is read from `process.argv` and the owning package.json's `bin`: a program started
 * as one of its package's bins — through the symlink npm puts on `PATH` or by its own path — is
 * started by that name, which is how an installed CLI is found; anything else is `node` and the
 * script's own path. The server's key is the program's name, the one `initialize` reports.
 *
 * On Windows npm installs a bin as a `.cmd` shim, and a client starts `command` directly, with no
 * shell, which cannot run one: there the bin is started through `cmd /c`.
 *
 * Its own chunk, imported only when `--print-config` is typed beside `--mcp`, so neither the
 * server nor a run without the flag carries it.
 */
import { dirname, resolve } from 'node:path';

import { type Manifest } from './manifest.js';
import { type Package } from './pkg.js';
import { builtin, host } from './runtime.js';

/** A path with its symlinks resolved, or as given when it does not exist. */
function real(path: string): string {
  const { existsSync, realpathSync } = builtin('node:fs');
  return existsSync(path) ? realpathSync(path) : path;
}

/** `bin` as name to file: a string is the package's own name, without its scope. */
function binsOf(pkg: Package): Record<string, string> {
  const { bin, name } = pkg.data;
  return typeof bin === 'string' ? { [String(name).replace(/^@[^/]+\//, '')]: bin } : ((bin ?? {}) as Record<string, string>);
}

/** The bin of `pkg` that `script` is, if it is one. */
function binOf(pkg: Package | undefined, script: string): string | undefined {
  if (pkg === undefined) return undefined;
  const dir = dirname(pkg.path);
  const bins = binsOf(pkg);
  return Object.keys(bins).find((name) => real(resolve(dir, bins[name] as string)) === script);
}

/** What starts the server: the bin by name, through `cmd /c` on Windows, or `node` and the script. */
function serverFor(bin: string | undefined, script: string): { command: string; args: string[] } {
  if (bin === undefined) return { command: 'node', args: [script, '--mcp'] };
  if (host.platform === 'win32') return { command: 'cmd', args: ['/c', bin, '--mcp'] };
  return { command: bin, args: ['--mcp'] };
}

export function clientConfig(manifest: Manifest, pkg: Package | undefined): string {
  const script = real(String(host.argv[1]));
  const server = serverFor(binOf(pkg, script), script);
  return `${JSON.stringify({ mcpServers: { [manifest.rootPath.join(' ') || 'burgee']: server } }, null, 2)}\n`;
}
