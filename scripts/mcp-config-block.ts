/**
 * mcp-current R6 — the client configuration on `/docs/agent-surfaces` is the demo's own
 * `--mcp --print-config`, not a template naming `mytool`. This writes the output between the
 * page's `mcp-config:start` and `mcp-config:end` markers; `--check` exits 1 when the page
 * differs. `apps/docs/tests/mcp-config.test.ts` starts the server from the block on the page.
 *
 *   npx tsx scripts/mcp-config-block.ts [--check]
 *
 * Run after `npm run build`. The demo is started by its bin's name on `PATH`, as a client starts
 * an installed CLI, from a scratch directory holding what npm would install there: a symlink on
 * POSIX, a `.cmd` shim on Windows, which only a shell can start. `npm ci` links no workspace bin
 * whose target is not built yet, so `node_modules/.bin` cannot be relied on for it.
 */
import { execSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const PAGE = join(REPO, 'apps', 'docs', 'content', 'docs', 'agent-surfaces.mdx');
const DEMO = join(REPO, 'examples', 'demo-cli-burgee', 'dist', 'bin.js');
/** Windows starts a bin through npm's `.cmd` shim, which needs a shell; POSIX execs the symlink. */
export const SHELL = process.platform === 'win32';
/** `rwxr-xr-x`: the mode npm gives a bin it links. */
const EXECUTABLE = 0o755;
const START = '{/* mcp-config:start — `demo-burgee --mcp --print-config`, written by scripts/mcp-config-block.ts */}';
const END = '{/* mcp-config:end */}';

/** Run `use` with `demo-burgee` on `PATH`, then take the scratch directory away. */
export async function withDemoOnPath<T>(use: (env: NodeJS.ProcessEnv) => T | Promise<T>): Promise<T> {
  const bin = mkdtempSync(join(tmpdir(), 'demo-bin-'));
  if (SHELL) {
    writeFileSync(join(bin, 'demo-burgee.cmd'), `@node "${DEMO}" %*\r\n`);
  } else {
    chmodSync(DEMO, EXECUTABLE);
    symlinkSync(DEMO, join(bin, 'demo-burgee'));
  }
  try {
    return await use({ ...process.env, PATH: `${bin}${delimiter}${process.env['PATH'] ?? ''}` });
  } finally {
    rmSync(bin, { recursive: true, force: true });
  }
}

/** What the demo prints, started as its bin. */
export const printed = async (): Promise<string> => await withDemoOnPath((env) => execSync('demo-burgee --mcp --print-config', { encoding: 'utf8', env }));

interface Server {
  command: string;
  args: string[];
}

/**
 * The block as Windows prints it: the bin through `cmd /c`, because a client starts `command`
 * with no shell and npm's `.cmd` shim needs one. The page carries the POSIX form; the Windows
 * lane checks this one against what it prints.
 */
export function onWindows(config: string): string {
  const { mcpServers } = JSON.parse(config) as { mcpServers: Record<string, Server> };
  const servers = Object.fromEntries(Object.entries(mcpServers).map(([name, s]) => [name, s.command === 'node' ? s : { command: 'cmd', args: ['/c', s.command, ...s.args] }]));
  return `${JSON.stringify({ mcpServers: servers }, null, 2)}\n`;
}

/** The `json` block between the page's markers. */
export function blockOf(page: string): string {
  const block = /mcp-config:start[^\n]*\n\n```json\n([\s\S]*?)```/u.exec(page)?.[1];
  if (block === undefined) throw new Error(`${PAGE} has no mcp-config block`);
  return block;
}

/** The page with the block between the markers replaced by `config`. */
export function withBlock(page: string, config: string): string {
  const from = page.indexOf(START);
  const to = page.indexOf(END);
  if (from === -1 || to < from) throw new Error(`${PAGE} has no mcp-config:start / mcp-config:end markers`);
  return `${page.slice(0, from)}${START}\n\n\`\`\`json\n${config}\`\`\`\n\n${page.slice(to)}`;
}

/** Write the page, or with `--check` say whether it is current. */
async function main(): Promise<void> {
  // The page carries the POSIX form, which a Windows run does not print.
  if (SHELL) throw new Error('write the page on Linux or macOS: Windows prints the cmd /c form (see onWindows)');
  const page = readFileSync(PAGE, 'utf8');
  const next = withBlock(page, await printed());
  if (!process.argv.includes('--check')) return writeFileSync(PAGE, next);
  if (next === page) return;
  process.stderr.write(`${PAGE}: the client configuration is not the demo's --print-config. Run npx tsx scripts/mcp-config-block.ts.\n`);
  process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
