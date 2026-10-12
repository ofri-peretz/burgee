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

export function clientConfig(manifest: Manifest, pkg: Package | undefined): string {
  const script = real(String(host.argv[1]));
  const bins = pkg === undefined ? {} : binsOf(pkg);
  const bin = Object.keys(bins).find((name) => real(resolve(dirname((pkg as Package).path), bins[name] as string)) === script);
  const server = bin === undefined ? { command: 'node', args: [script, '--mcp'] } : { command: bin, args: ['--mcp'] };
  return `${JSON.stringify({ mcpServers: { [manifest.rootPath.join(' ') || 'burgee']: server } }, null, 2)}\n`;
}
