/**
 * `paratext/terminal-link` — the three fallbacks, and the default export's two streams.
 *
 * `hyperlinks.test.ts` grades *where* the façade links against the real `supports-hyperlinks`.
 * This file is what it prints where it does not, which is `terminal-link`'s own `fallback`
 * option, and that `terminalLink.stderr` asks about stderr rather than about stdout — a
 * façade that decided both from one stream would answer the wrong question for half its API.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { terminalLinkFor } from './terminal-link.js';

const OSC8 = '\u001B]8;;https://x.dev\u0007docs\u001B]8;;\u0007';

/** A runtime `supports-hyperlinks` refuses: no tty. */
const piped = { env: { TERM: 'xterm-256color', TERM_PROGRAM: 'iTerm.app', TERM_PROGRAM_VERSION: '3.1.0' }, isTTY: { stdout: false }, argv: [], platform: 'linux' };

describe('where the terminal cannot link', () => {
  it('prints upstream’s `text url` by default, the URL bare so a linkifier can find it', () => {
    expect(terminalLinkFor(piped)('docs', 'https://x.dev')).toBe('docs https://x.dev');
  });

  it('`fallback: false` prints the text alone', () => {
    expect(terminalLinkFor(piped)('docs', 'https://x.dev', { fallback: false })).toBe('docs');
  });

  it('a `fallback` function is called with the text and the url, and its answer is printed', () => {
    const fallback = vi.fn((text: string, url: string) => `[${text}](${url})`);
    expect(terminalLinkFor(piped)('docs', 'https://x.dev', { fallback })).toBe('[docs](https://x.dev)');
    expect(fallback).toHaveBeenCalledWith('docs', 'https://x.dev');
  });

  it('`fallback: true` is not a function and not `false`, so it is the default', () => {
    expect(terminalLinkFor(piped)('docs', 'https://x.dev', { fallback: true })).toBe('docs https://x.dev');
  });
});

/** Put a stream's `isTTY` back as it was — absent, on a stream that is not a terminal. */
function restore(stream: NodeJS.WriteStream, descriptor: PropertyDescriptor | undefined): void {
  if (descriptor === undefined) Reflect.deleteProperty(stream, 'isTTY');
  else Object.defineProperty(stream, 'isTTY', descriptor);
}

describe('the default export, over the real process', () => {
  const saved = {
    env: process.env,
    argv: process.argv,
    stdout: Object.getOwnPropertyDescriptor(process.stdout, 'isTTY'),
    stderr: Object.getOwnPropertyDescriptor(process.stderr, 'isTTY'),
  };

  afterEach(() => {
    process.env = saved.env;
    process.argv = saved.argv;
    restore(process.stdout, saved.stdout);
    restore(process.stderr, saved.stderr);
    vi.resetModules();
  });

  /**
   * A process whose stderr is a terminal and whose stdout is not — `program 2>&1 | less`
   * turned around, and the ordinary shape of a CLI whose output is piped. Windows Terminal
   * with truecolor links on every platform, so the answer does not depend on the runner.
   */
  it('terminalLink.stderr links where stderr is a terminal, while terminalLink on a piped stdout does not', async () => {
    process.env = { WT_SESSION: 'x', COLORTERM: 'truecolor' };
    process.argv = [process.execPath, 'cli.js'];
    Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });
    Object.defineProperty(process.stderr, 'isTTY', { value: true, configurable: true });
    vi.resetModules();
    const { default: terminalLink } = await import('./terminal-link.js');

    expect(terminalLink.isSupported).toBe(false);
    expect(terminalLink.stderr.isSupported).toBe(true);
    expect(terminalLink('docs', 'https://x.dev')).toBe('docs https://x.dev');
    expect(terminalLink.stderr('docs', 'https://x.dev')).toBe(OSC8);
  });
});
