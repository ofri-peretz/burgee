/**
 * A-20261027-yargs-parsesync-surfaces-throw: burgee's reserved surfaces answer a `burgee/yargs`
 * program that ends in `.parseSync()` exactly as they answer the same program ending in
 * `.parseAsync()`.
 *
 * `parseSync()` is yargs' documented synchronous entry, and it throws a `YError` on any promise
 * `parse()` hands back. `completion <shell>` and `--mcp` lazy-load their modules so neither sits on
 * the start-up path, and until this fix both returned that promise to `parseSync()`. So
 * `prog completion zsh` and `prog --mcp` printed a stack trace and exited 1 on every adopter that
 * uses it, open-cli-tools/concurrently among them. Every case here was red on `burgee@1.7.2`
 * (`completion foo` too: its branch answers `false`, but only after returning the promise);
 * `--schema` and `--json` were already green and stay pinned here.
 *
 * Each case is a child process running the built entry by name through the package's exports
 * map, which is the path a migrated program takes, and the program is the three lines an adopter
 * writes. `npm test` builds first.
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

import { scratchDirs } from '../__fixtures__/scratch-dir.js';
import { SHELLS } from '../completions.js';

const load = createRequire(fileURLToPath(new URL('../../package.json', import.meta.url)));
const entry = (spec: string): string => JSON.stringify(pathToFileURL(load.resolve(spec)).href);
const scratch = scratchDirs();

/**
 * The adopter's program: three lines, ending in `ending`. A `$0` handler, so `--mcp` has a tool.
 * Each in a directory of its own under one file name, so both print the same program name.
 */
function program(ending: 'parseSync' | 'parseAsync'): string {
  const file = join(scratch(`burgee-${ending}-`), 'prog.mjs');
  writeFileSync(
    file,
    [
      `import yargs from ${entry('burgee/yargs')}; import { hideBin } from ${entry('burgee/yargs/helpers')};`,
      "const y = yargs(hideBin(process.argv)).command('$0', 'count things', (b) => b.option('n', { type: 'number', describe: 'how many' }), (argv) => console.log(`n=${String(argv.n)}`));",
      `y.${ending}();`,
    ].join('\n'),
  );
  return file;
}

const programs = { parseSync: program('parseSync'), parseAsync: program('parseAsync') };

/** One run of `ending`'s program, with `input` on stdin. */
function run(ending: 'parseSync' | 'parseAsync', args: string[], input = ''): { stdout: string; stderr: string; status: number | null } {
  const child = spawnSync(process.execPath, [programs[ending], ...args], { encoding: 'utf8', input });
  return { stdout: child.stdout, stderr: child.stderr, status: child.status };
}

/** Runs both programs; the `parseSync()` one must not throw and must answer as the other does. */
function both(args: string[], input = ''): { stdout: string; status: number | null } {
  const sync = run('parseSync', args, input);
  const async = run('parseAsync', args, input);
  expect(sync.stderr).not.toMatch(/YError|must not be used with asynchronous/);
  expect({ stdout: sync.stdout, status: sync.status }).toEqual({ stdout: async.stdout, status: async.status });
  return { stdout: sync.stdout, status: sync.status };
}

const MCP = [
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"t","version":"0"}}}',
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}',
].join('\n');

describe('the reserved surfaces under parseSync() (A-20261027-yargs-parsesync-surfaces-throw)', () => {
  it('completion zsh prints the script and exits 0', () => {
    const { stdout, status } = both(['completion', 'zsh']);
    expect(status).toBe(0);
    expect(stdout).toContain('#compdef');
  });

  // The façade names the shells before `completions.js` loads; a shell added there and not here falls through.
  it.each(SHELLS.filter((shell) => shell !== 'zsh'))('completion %s prints the script the engine renders', (shell) => {
    const { stdout, status } = both(['completion', shell]);
    expect(status).toBe(0);
    expect(stdout.length).toBeGreaterThan(100);
    expect(stdout).not.toBe('n=undefined\n');
  });

  it('completion fig prints the spec', () => {
    const { stdout, status } = both(['completion', 'fig']);
    expect(status).toBe(0);
    expect(JSON.parse(stdout)).toMatchObject({ name: expect.any(String) as unknown });
  });

  it('completion with an unknown shell is no surface: the program runs, as on yargs and the commander façade', () => {
    // Red under parseAsync() too before this fix: the branch resolved `false` only after it had
    // already been taken as served, so the program printed nothing and ran nothing.
    const { stdout, status } = both(['completion', 'foo']);
    expect(status).toBe(0);
    expect(stdout).toBe('n=undefined\n');
  });

  it('--mcp serves the program, and lists its handler as a tool', () => {
    const { stdout, status } = both(['--mcp'], MCP);
    expect(status).toBe(0);
    const replies = stdout.trim().split('\n').map((line) => JSON.parse(line) as { id: number; result: Record<string, unknown> });
    expect(replies.map((reply) => reply.id)).toEqual([1, 2]);
    expect(replies[1]?.result.tools).toHaveLength(1);
  });

  it('--schema prints the document', () => {
    const { stdout, status } = both(['--schema']);
    expect(status).toBe(0);
    expect(JSON.parse(stdout)).toHaveProperty('commands');
  });

  it('--json runs the handler under the envelope', () => {
    const { status } = both(['--json', '-n', '3']);
    expect(status).toBe(0);
  });
});

/**
 * A-20261027-yargs-parsesync-mcp-ended-by-exit: the program goes on after `parseSync()` returns,
 * as concurrently's `bin/index.ts` does — it reads the argv it got back and, finding nothing to
 * run, shows help and calls `process.exit()`. On `burgee@1.8.0` that exit ended the server
 * `parseSync()` had started before it read a line: help on stderr, exit 0, nothing on stdout.
 */
function exitsOnEmpty(ending: 'parseSync' | 'parseAsync', handler: boolean): string {
  const file = join(scratch(`burgee-exits-${ending}-${String(handler)}-`), 'prog.mjs');
  const command = handler ? ".command('$0 [things..]', 'count things', (b) => b, (argv) => console.log(`n=${String(argv.n)}`))" : '';
  writeFileSync(
    file,
    [
      `import yargs from ${entry('burgee/yargs')}; import { hideBin } from ${entry('burgee/yargs/helpers')};`,
      `const program = yargs(hideBin(process.argv)).option('n', { type: 'number', describe: 'how many' })${command};`,
      `const argv = ${ending === 'parseSync' ? 'program.parseSync()' : 'await program.parseAsync()'};`,
      "if (argv._.length === 0 && argv.things === undefined) { program.showHelp(); process.exit(); }",
    ].join('\n'),
  );
  return file;
}

function serve(file: string, input: string): { replies: { id: number; result: Record<string, unknown> }[]; stderr: string; status: number | null } {
  const child = spawnSync(process.execPath, [file, '--mcp'], { encoding: 'utf8', input });
  const replies = child.stdout.trim() === '' ? [] : child.stdout.trim().split('\n').map((line) => JSON.parse(line) as { id: number; result: Record<string, unknown> });
  return { replies, stderr: child.stderr, status: child.status };
}

describe('--mcp under parseSync() in a program that exits on an empty argv (A-20261027-yargs-parsesync-mcp-ended-by-exit)', () => {
  it('answers initialize and tools/list before the program’s own exit can run, as concurrently’s shape needs', () => {
    const { replies, stderr, status } = serve(exitsOnEmpty('parseSync', false), MCP);
    expect(stderr).not.toContain('how many');
    expect(status).toBe(0);
    expect(replies.map((reply) => reply.id)).toEqual([1, 2]);
    expect(replies[0]?.result).toMatchObject({ capabilities: { tools: {} } });
    expect(replies[1]?.result).toEqual({ tools: [] });
  });

  it('runs a tools/call and answers it as the parseAsync() program does', () => {
    const list = serve(exitsOnEmpty('parseAsync', true), MCP).replies[1]?.result.tools as { name: string }[];
    const call = `${MCP}\n{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"${list[0]?.name ?? ''}","arguments":{"n":3}}}`;
    const sync = serve(exitsOnEmpty('parseSync', true), call);
    const async = serve(exitsOnEmpty('parseAsync', true), call);
    expect(sync.stderr).not.toContain('how many');
    expect(sync.replies).toEqual(async.replies);
    expect(sync.status).toBe(0);
    expect(sync.replies[2]?.result).toMatchObject({ isError: false, content: [{ type: 'text' }, { type: 'text', text: 'n=3' }] });
  });
});
