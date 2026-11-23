import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';

const HOLD_MS = 1000;
const CELL_BYTES = 4;

/**
 * What a runaway mutant does to a busy machine: the first time, it takes down every sibling worker of
 * this run (the children of the process that started them) while they are mid-test, as one process's
 * memory pressure can; then it takes down its own. Afterwards, run alone, it takes down only itself.
 * Not mutated: the fixture's mutants are in hog.ts.
 */
export const killSiblings = (): void => {
  const marker = new URL('../reports/hogged', import.meta.url);
  if (!existsSync(marker)) {
    writeFileSync(marker, '1');
    Atomics.wait(new Int32Array(new SharedArrayBuffer(CELL_BYTES)), 0, 0, HOLD_MS);
    const kids = execFileSync('pgrep', ['-P', String(process.ppid)], { encoding: 'utf8' }).split('\n').filter(Boolean).map(Number);
    for (const pid of kids) if (pid !== process.pid) process.kill(pid, 'SIGKILL');
  }
  process.kill(process.pid, 'SIGKILL');
};
