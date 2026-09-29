/**
 * Which file events reload the entry (W5). `fs.watch` is replaced so each event is one the
 * test chooses: the real watcher cannot be made to report a `null` filename on this platform
 * (Linux and macOS name the file; some platforms and some events do not), and a recursive
 * watch over a temp directory would also report whatever else the machine writes there.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';

type Listener = (event: string, filename: string | Buffer | null) => void;
const watched = vi.hoisted(() => ({ listener: undefined as Listener | undefined, closed: 0 }));
vi.mock('node:fs', async (actual) => ({
  ...(await actual<typeof import('node:fs')>()),
  watch: (_dir: string, _opts: unknown, listener: Listener) => {
    watched.listener = listener;
    return { close: () => void (watched.closed += 1) };
  },
}));

const { dev } = await import('./dev.js');

const burgee = JSON.stringify(resolve(dirname(fileURLToPath(import.meta.url)), 'index.ts'));
const ENTRY = `import { defineCommand, defineProgram } from ${burgee};
export const program = defineProgram({ name: 'watched', commands: [defineCommand({ name: 'ping', effects: 'read_only', run: () => 'pong' })] });
`;

let dir = '';
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  vi.useRealTimers();
});

async function started(debounceMs?: number): Promise<{ loads: () => number; close: () => void }> {
  dir = mkdtempSync(join(tmpdir(), 'burgee-watch-'));
  const entry = join(dir, 'cli.ts');
  writeFileSync(entry, ENTRY);
  const logged: string[] = [];
  const handle = dev({ entry, input: new PassThrough(), output: new PassThrough(), log: { write: (s) => logged.push(s) }, ...(debounceMs === undefined ? {} : { debounceMs }) });
  await handle.ready;
  return { loads: () => logged.filter((l) => /^(re)?loaded /.test(l)).length, close: handle.close };
}

/**
 * How long a scheduled reload may take to land. A reload is a fresh import of the entry and of
 * burgee under it, which takes tens of milliseconds idle and seconds inside a loaded pre-push
 * battery; the wait is on the event, so an idle run pays nothing for the margin.
 */
const SETTLE = { timeout: 20_000, interval: 10 };

const fire = (filename: string | null): void => (watched.listener as Listener)('change', filename);

describe('the watcher reloads on source files only (W5)', () => {
  it('ignores a file that is not source, and anything under node_modules', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { loads, close } = await started(5);
    fire('README.md');
    fire('node_modules/dep/index.js');
    // Nothing scheduled: an ignored event never reaches the debounce.
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(50);
    expect(loads()).toBe(1);
    fire('cli.ts');
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(50);
    await vi.waitFor(() => expect(loads()).toBe(2), SETTLE);
    close();
  });

  it('reloads when the platform does not name the file, since it may be the entry', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { loads, close } = await started(5);
    fire(null);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(50);
    await vi.waitFor(() => expect(loads()).toBe(2), SETTLE);
    close();
  });

  it('coalesces saves inside the default 50 ms window into one reload', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { loads, close } = await started();
    fire('cli.ts');
    await vi.advanceTimersByTimeAsync(40);
    fire('cli.ts');
    await vi.advanceTimersByTimeAsync(40);
    // Still waiting: the second save restarted the 50 ms window rather than adding a reload.
    expect(vi.getTimerCount()).toBe(1);
    expect(loads()).toBe(1);
    await vi.advanceTimersByTimeAsync(20);
    await vi.waitFor(() => expect(loads()).toBe(2), SETTLE);
    close();
    expect(watched.closed).toBeGreaterThan(0);
  });
});
