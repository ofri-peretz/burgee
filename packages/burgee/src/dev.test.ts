/**
 * dev-loop W1–W6: a temp CLI, the watcher against a PassThrough stdio pair, an edit,
 * and then: the new tool appears in `tools/list`, `tools/list_changed` was emitted, and a
 * call is routed to the *new* handler rather than a cached one. That last assertion was
 * written first against a load without the cache-busting query and observed failing
 * (rule 4). W6 is measured on a generated 30-command CLI.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { dev, diffManifests, load } from './dev.js';

const pkgRoot = fileURLToPath(new URL('..', import.meta.url));
const fixtures = resolve(pkgRoot, '.dev-fixtures');
/** The framework, as the temp CLI imports it: the source entry, one path this test knows. */
const burgee = JSON.stringify(resolve(pkgRoot, 'src/index.ts'));

/**
 * W6's budget: save-to-callable under 500 ms, *or* under five imports of the same entry on the
 * same machine, whichever is larger (A30). The absolute number alone graded the host: 1,035 ms
 * on a Windows CI runner and 4,098 ms in a loaded local pre-push battery, for no change to the
 * code. The floor is comparable work, not a CPU loop — `migrate-bench.test.ts` records why a
 * regex yardstick does not cancel a contended runner. Calibrated on an Apple M4 Pro: the reload
 * measured 0.45-1.57 floors idle and 0.83-2.62 with four copies of this case running at once,
 * so five still fires on a reload that does several times the work of one import.
 */
const RELOAD_BUDGET_MS = 500;
const RELOAD_FLOORS = 5;
const WAIT_MS = 4000;

function cli(commands: string): string {
  return `import { defineCommand, defineProgram } from ${burgee};
export const program = defineProgram({ name: 'devdemo', description: 'the dev-loop demo', commands: [${commands}] });
`;
}

const greet = (word: string, description = 'Greet someone'): string =>
  `defineCommand({ name: 'greet', description: '${description}', effects: 'read_only', arguments: [{ name: 'name', required: true }], run: ({ positionals }) => \`${word}, \${positionals[0]}\` })`;
const ping = `defineCommand({ name: 'ping', description: 'Reply', effects: 'read_only', run: () => 'pong' })`;

interface Rpc {
  send: (body: Record<string, unknown>) => void;
  /** Resolve with the next line satisfying the predicate, from what was already written or what comes. */
  next: (test: (m: Record<string, unknown>) => boolean) => Promise<Record<string, unknown>>;
  input: PassThrough;
  output: { write: (s: string) => boolean };
  lines: Record<string, unknown>[];
}

function rpc(): Rpc {
  const input = new PassThrough();
  const lines: Record<string, unknown>[] = [];
  const waiting: { test: (m: Record<string, unknown>) => boolean; resolve: (m: Record<string, unknown>) => void }[] = [];
  const output = {
    write: (s: string): boolean => {
      for (const line of s.split('\n').filter((l) => l.trim() !== '')) {
        const m = JSON.parse(line) as Record<string, unknown>;
        lines.push(m);
        const i = waiting.findIndex((w) => w.test(m));
        if (i !== -1) (waiting.splice(i, 1)[0] as (typeof waiting)[number]).resolve(m);
      }
      return true;
    },
  };
  return {
    input,
    output,
    lines,
    send: (body) => void input.write(`${JSON.stringify({ jsonrpc: '2.0', ...body })}\n`),
    next: (test) =>
      new Promise((res, rej) => {
        const found = lines.find(test);
        if (found !== undefined) {
          res(found);
          return;
        }
        const timer = setTimeout(() => rej(new Error('no matching message within the wait')), WAIT_MS);
        waiting.push({ test, resolve: (m) => (clearTimeout(timer), res(m)) });
      }),
  };
}

const toolNames = (m: Record<string, unknown>): string[] => ((m['result'] as { tools: { name: string }[] }).tools ?? []).map((t) => t.name);
const text = (m: Record<string, unknown>): string => (m['result'] as { content: { text: string }[] }).content[0]?.text ?? '';

let dir = '';
afterEach(() => {
  if (dir !== '') rmSync(dir, { recursive: true, force: true });
  dir = '';
});

function scratch(name: string): string {
  dir = join(fixtures, `${name}-${process.pid}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('burgee dev: reload, serve, notify (W1–W3, W5)', () => {
  it('serves the entry over MCP, and after an edit the new command is listed, announced, and called on its new handler', async () => {
    const at = scratch('reload');
    const entry = join(at, 'cli.ts');
    writeFileSync(entry, cli(greet('Hello')));
    const io = rpc();
    const logged: string[] = [];
    const handle = dev({ entry, input: io.input, output: io.output, log: { write: (s) => logged.push(s) }, watch: false });
    const first = await handle.ready;
    expect(first.kind).toBe('burgee');
    expect(logged.join('')).toContain('loaded devdemo');
    expect(logged.join('')).toContain('Usage:');

    io.send({ id: 1, method: 'initialize', params: {} });
    io.send({ id: 2, method: 'tools/list' });
    expect(toolNames(await io.next((m) => m['id'] === 2))).toEqual(['greet']);
    io.send({ id: 3, method: 'tools/call', params: { name: 'greet', arguments: { name: 'ada' } } });
    expect(JSON.parse(text(await io.next((m) => m['id'] === 3)))).toMatchObject({ ok: true, data: 'Hello, ada' });

    // The edit: a new command, and the old one's handler and description changed. The diff
    // reads schemas, so the description is what marks greet as changed; the handler is what
    // the stale-handler call below is about.
    writeFileSync(entry, cli(`${greet('Hi', 'Greet someone warmly')}, ${ping}`));
    const second = await handle.reload();
    expect(second.manifest.commands.map((c) => c.path.join(' '))).toEqual(['devdemo', 'devdemo greet', 'devdemo ping']);
    await io.next((m) => m['method'] === 'notifications/tools/list_changed');
    expect(logged.at(-1)).toContain('+ devdemo ping');
    expect(logged.at(-1)).toContain('~ devdemo greet');

    io.send({ id: 4, method: 'tools/list' });
    expect(toolNames(await io.next((m) => m['id'] === 4))).toEqual(['greet', 'ping']);
    // The stale-handler assertion: the reloaded greet answers, not the cached one.
    io.send({ id: 5, method: 'tools/call', params: { name: 'greet', arguments: { name: 'ada' } } });
    expect(JSON.parse(text(await io.next((m) => m['id'] === 5)))).toMatchObject({ ok: true, data: 'Hi, ada' });
    io.send({ id: 6, method: 'tools/call', params: { name: 'ping', arguments: {} } });
    expect(JSON.parse(text(await io.next((m) => m['id'] === 6)))).toMatchObject({ ok: true, data: 'pong' });

    io.input.end();
    await handle.done;
  });

  it('reloads on its own when the watched entry changes', async () => {
    const at = scratch('watch');
    const entry = join(at, 'cli.ts');
    writeFileSync(entry, cli(greet('Hello')));
    const io = rpc();
    const handle = dev({ entry, input: io.input, output: io.output, log: { write: () => undefined }, debounceMs: 10 });
    await handle.ready;
    writeFileSync(entry, cli(`${greet('Hello')}, ${ping}`));
    await io.next((m) => m['method'] === 'notifications/tools/list_changed');
    io.send({ id: 1, method: 'tools/list' });
    expect(toolNames(await io.next((m) => m['id'] === 1))).toEqual(['greet', 'ping']);
    handle.close();
    io.input.end();
    await handle.done;
  });

  it('names the diff between two manifests by command path', async () => {
    const at = scratch('diff');
    const entry = join(at, 'cli.ts');
    writeFileSync(entry, cli(greet('Hello')));
    const a = await load(entry, 1);
    writeFileSync(entry, cli(`${greet('Hello')}, ${ping}`));
    const b = await load(entry, 2);
    expect(diffManifests(a.manifest, b.manifest)).toEqual({ added: ['devdemo ping'], removed: [], changed: [] });
    expect(diffManifests(undefined, a.manifest).added).toEqual(['devdemo', 'devdemo greet']);
  });
});

/** Thirty commands whose handlers all answer `word`, so a reload is visible from any of them. */
const thirty = (word: string): string =>
  Array.from({ length: 30 }, (_, i) => `defineCommand({ name: 'c${i}', description: 'command ${i}', effects: 'read_only', options: { a: { type: 'string' }, b: { type: 'boolean' } }, run: () => '${word} ${i}' })`).join(', ');

describe('burgee dev: save-to-callable under 500 ms, or five imports of the entry, on a 30-command CLI (W6)', () => {
  it('reloads thirty commands within the budget', async () => {
    const at = scratch('bench');
    const entry = join(at, 'cli.ts');
    writeFileSync(entry, cli(thirty('one')));
    const io = rpc();
    const handle = dev({ entry, input: io.input, output: io.output, log: { write: () => undefined }, watch: false });
    await handle.ready;
    // One call first: the first call of a session imports `seniority/config` lazily
    // (execute.ts), a one-off cost that is not a reload's. A cold disk put it at 1,538 ms.
    io.send({ id: 0, method: 'tools/call', params: { name: 'c29', arguments: {} } });
    await io.next((m) => m['id'] === 0);
    writeFileSync(entry, cli(thirty('two')));
    // The floor: one fresh import of the very file the reload is about to import.
    const floor = (await load(entry, 1_000)).ms;
    const started = performance.now();
    const loaded = await handle.reload();
    io.send({ id: 1, method: 'tools/call', params: { name: 'c29', arguments: {} } });
    const answer = JSON.parse(text(await io.next((m) => m['id'] === 1))) as { data: string };
    const elapsed = performance.now() - started;
    expect(loaded.manifest.commands).toHaveLength(31);
    expect(answer.data).toBe('two 29');
    const budget = Math.max(RELOAD_BUDGET_MS, RELOAD_FLOORS * floor);
    expect(elapsed, `${elapsed.toFixed(1)} ms — ${(elapsed / floor).toFixed(2)} imports of the entry (${floor.toFixed(1)} ms each here)`).toBeLessThan(budget);
    io.input.end();
    await handle.done;
  });
});
