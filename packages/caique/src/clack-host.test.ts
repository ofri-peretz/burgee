/**
 * What `caique/clack` reads from the process it runs in: the glyph table, decided once at
 * import from the platform and the environment, and the streams a prompt falls back to when
 * it is handed none. Both come through `runtime.ts`, so each case here loads the engine fresh
 * against a runtime it wrote — the only way to test a decision made at import without
 * running on Windows.
 */
import { Readable, Writable } from 'node:stream';

import { afterEach, describe, expect, it, vi } from 'vitest';

class Output extends Writable {
  buffer: string[] = [];
  isTTY = false;
  columns = 80;
  rows = 20;
  override _write(chunk: Buffer | string, _encoding: BufferEncoding, done: (error?: Error | null) => void): void {
    this.buffer.push(chunk.toString());
    done();
  }
}

class Input extends Readable {
  override _read(): void {
    // Keys arrive as emitted `keypress` events, never as data.
  }
}

interface Host {
  platform?: string;
  env?: Record<string, string | undefined>;
  stdin?: Input;
  stdout?: Output;
}

/** `clack-core.ts` and `clack-prompts.ts`, loaded against a runtime of the test's choosing. */
async function loadWith({ platform = 'linux', env = {}, stdin = new Input(), stdout = new Output() }: Host) {
  vi.resetModules();
  vi.doMock('./runtime.js', () => ({
    processRuntime: () => ({ env, stdin, stdout, isTTY: { stdin: false, stdout: false } }),
    processFacts: () => ({ cwd: '/', platform }),
  }));
  const core = await import('./clack-core.js');
  const prompts = await import('./clack-prompts.js');
  return { core, prompts };
}

afterEach(() => {
  vi.doUnmock('./runtime.js');
  vi.resetModules();
});

describe('the glyph table', () => {
  it('draws box characters on a POSIX terminal', async () => {
    const { core } = await loadWith({ env: { TERM: 'xterm' } });
    expect(core.unicode).toBe(true);
    expect(core.S_BAR).toBe('│');
  });

  it("falls back to ASCII on the Linux console, which has no box characters", async () => {
    const { core } = await loadWith({ env: { TERM: 'linux' } });
    expect(core.unicode).toBe(false);
    expect(core.S_BAR).toBe('|');
    expect(core.S_STEP_SUBMIT).toBe('o');
    expect(core.unicodeOr('◆', '*')).toBe('*');
  });

  it('falls back to ASCII in a bare Windows console', async () => {
    const { core } = await loadWith({ platform: 'win32', env: {} });
    expect(core.unicode).toBe(false);
    expect(core.S_RADIO_ACTIVE).toBe('>');
  });

  // clack's own table, condition by condition: any one of these is a Windows terminal that draws unicode.
  const WINDOWS_UNICODE: Record<string, Record<string, string>> = {
    CI: { CI: 'true' },
    'Windows Terminal': { WT_SESSION: '1' },
    'VS Code': { TERM_PROGRAM: 'vscode' },
    xterm: { TERM: 'xterm-256color' },
    Alacritty: { TERM: 'alacritty' },
    JetBrains: { TERMINAL_EMULATOR: 'JetBrains-JediTerm' },
  };
  for (const [name, env] of Object.entries(WINDOWS_UNICODE)) {
    it(`draws box characters on Windows under ${name}`, async () => {
      const { core } = await loadWith({ platform: 'win32', env });
      expect(core.unicode).toBe(true);
      expect(core.S_BAR).toBe('│');
    });
  }
});

describe('the streams a prompt falls back to', () => {
  it("reads the process's stdin and draws on its stdout when it is handed neither", async () => {
    const stdin = new Input();
    const stdout = new Output();
    const { prompts } = await loadWith({ stdin, stdout });
    const answer = prompts.select({ message: 'pick', options: [{ value: 'a' }, { value: 'b' }] });
    stdin.emit('keypress', undefined, { name: 'down' });
    stdin.emit('keypress', '\r', { name: 'return' });
    expect(await answer).toBe('b');
    expect(stdout.buffer.join('')).toContain('pick');
  });
});
