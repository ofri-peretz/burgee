/**
 * Stryker's `progress` reporters, one implementation: the phase, its own count and the time so
 * far, on stderr. On a terminal the line rewrites itself every second (`progress`); anywhere else,
 * or with `progress-append-only` (Stryker's `ci` alias), a new line every few seconds, so a CI log
 * shows the run moving without a carriage-return mess. Off unless a progress reporter is named.
 */
const REPORTERS = new Set(['progress', 'progress-append-only', 'ci', 'dots']);
// Stryker disable next-line NumericLiteral: a repaint interval; no test can see 1,000 ms against 1,001
const TTY_EVERY_MS = 1000;
const APPEND_EVERY_MS = 10_000;
const MS_PER_S = 1000;

export interface Progress {
  /** Start a phase; `detail` is read at every tick (e.g. "412 of 1,332 mutants killed so far"). */
  phase(name: string, detail?: () => string): void;
  stop(): void;
}

interface Out {
  write(s: string): unknown;
  isTTY?: boolean | undefined;
}

export function startProgress(reporters: readonly string[], out: Out, now: () => number = () => performance.now()): Progress {
  const enabled = reporters.some((r) => REPORTERS.has(r));
  const rewrite = Boolean(out.isTTY) && reporters.includes('progress');
  const start = now();
  // Stryker disable next-line StringLiteral: line() runs only after phase() has set the name, so the initial value is never printed
  let name = '';
  let detail: (() => string) | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  const line = (): string => `oxmutate: ${name}${detail ? `, ${detail()}` : ''}, ${((now() - start) / MS_PER_S).toFixed(0)} s`;
  const tick = (): void => {
    out.write(rewrite ? `\r\u001B[2K${line()}` : `${line()}\n`);
  };
  return {
    phase(next, nextDetail) {
      if (!enabled) return;
      name = next;
      detail = nextDetail;
      tick();
      timer ??= setInterval(tick, rewrite ? TTY_EVERY_MS : APPEND_EVERY_MS);
      timer.unref();
    },
    stop() {
      clearInterval(timer);
      if (enabled && rewrite) out.write('\n');
    },
  };
}
