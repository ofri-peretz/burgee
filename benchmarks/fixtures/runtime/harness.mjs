/**
 * B5's timing core, spawned once per pair: `node --expose-gc harness.mjs <workload.mjs> <runs>`.
 *
 * A fresh process per pair, so one pair's JIT state and heap never colour another's — the
 * flagstaff workloads call into linegauge, and a linegauge that the previous pair had already
 * warmed would be a different measurement from one a user's program meets.
 *
 * Inside the process: the workload's `check()` first (ours and the incumbent must produce the
 * same output, or the number compares two different jobs), then warm-up, then `runs` paired
 * rounds. Each round times `n` iterations of ours and `n` of the incumbent back to back,
 * alternating which goes first, with a full collection before each block, so a burst of
 * background load or the other side's garbage lands on both and cancels in the ratio.
 *
 * **The terminal is a TTY.** Every workload is something a CLI does in front of a person, so
 * stdout and stderr say `isTTY` before any workload is imported, and the axis spawns this with
 * an iTerm2 `TERM_PROGRAM`, `FORCE_COLOR=3` and `FORCE_HYPERLINK=1`. On a pipe, chalk styles
 * nothing and paratext prints a link's static fallback while ansi-escapes still emits OSC 8 —
 * which would time two different jobs. Each workload's `check()` proves both sides produce the
 * same bytes, so a lost TTY stops the run instead of producing a flattering ratio.
 *
 * Prints one JSON line: `{ ours: [ns/op per round], theirs: [...], n }`. With `<runs>` 0 it
 * runs the parity check and nothing else.
 */
import { pathToFileURL } from 'node:url';

const WARMUP_ROUNDS = 3;
const collect = typeof globalThis.gc === 'function' ? globalThis.gc : () => undefined;

async function time(fn, n) {
  collect();
  const started = process.hrtime.bigint();
  for (let i = 0; i < n; i++) {
    const r = fn(i);
    if (r !== undefined && typeof r.then === 'function') await r;
  }
  return Number(process.hrtime.bigint() - started) / n;
}

export async function measure(workload, runs) {
  await workload.check();
  // `runs` 0 is the parity proof alone — what `runtime.test.ts` runs, and nothing is timed.
  if (runs === 0) return { ours: [], theirs: [], n: workload.n };
  for (let w = 0; w < WARMUP_ROUNDS; w++) {
    await time(workload.ours, workload.n);
    await time(workload.theirs, workload.n);
  }
  const ours = [];
  const theirs = [];
  for (let r = 0; r < runs; r++) {
    if (r % 2 === 0) {
      ours.push(await time(workload.ours, workload.n));
      theirs.push(await time(workload.theirs, workload.n));
    } else {
      theirs.push(await time(workload.theirs, workload.n));
      ours.push(await time(workload.ours, workload.n));
    }
  }
  return { ours, theirs, n: workload.n };
}

const [file, runs] = process.argv.slice(2);
if (file !== undefined) {
  process.stdout.isTTY = true;
  process.stderr.isTTY = true;
  const { default: workload } = await import(pathToFileURL(file).href);
  process.stdout.write(`${JSON.stringify(await measure(workload, Number(runs ?? '1')))}\n`);
}
