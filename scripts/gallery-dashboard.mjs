/**
 * The reference dashboard (`examples/dashboard`, controlroom R22) run in all five modes over
 * buffers and `manualClock()`, printed as one JSON object: what it wrote in `pipe`, `ci`,
 * `accessible` and `json`, and in `tty` the bytes at two moments — mid-run on the Status tab, and
 * after → on the Tail logs tab — for `gallery-page.ts` to replay onto a screen.
 *
 * Its own process, because the dashboard registers a flagstaff plugin (its `◼ ◻ ▶` marks) when it
 * is imported, and flagstaff's registry is the process's: run inside `gallery-page.ts` it would
 * restyle every flagstaff sample on the page.
 */
import { PassThrough } from 'node:stream';

import { manualClock } from 'flagstaff/loop';

// eslint-disable-next-line import-next/no-relative-packages -- by path: the boilerplate is a private workspace with no exports, run here exactly as the file a reader copies
import { run, STEPS, TICK } from '../examples/dashboard/dashboard.mjs';

const ENV = { tty: {}, pipe: {}, ci: { CI: 'true' }, json: {}, accessible: { CLI_ACCESSIBLE: '1' } };
const SIZE = { columns: 80, rows: 24 };

/** A world for one mode: buffers for the streams, a manual clock, a stdin that goes raw on a terminal. */
function world(mode) {
  const out = [];
  const tty = mode === 'tty';
  const stdin = Object.assign(new PassThrough(), tty ? { isTTY: true, isRaw: false, setRawMode: () => undefined } : {});
  const clock = manualClock();
  const write = (s) => void out.push(s);
  const rt = { env: ENV[mode], isTTY: { stdout: tty }, stdout: { write, isTTY: tty, ...SIZE }, stderr: { write }, stdin, clock };
  return { rt, out, stdin, clock };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

/** `tty`: the bytes after the second step starts, and again after → switches to the log tab. */
async function terminal() {
  const w = world('tty');
  const done = run(w.rt);
  w.clock.tick(0);
  w.clock.tick(TICK);
  const status = w.out.join('');
  w.stdin.write('\u001B[C');
  await flush();
  const logs = w.out.join('');
  w.stdin.write('q');
  await done;
  return { status, logs };
}

/** Every other mode: the whole run, to the end, as a pipe or an agent reads it. */
async function projected(mode) {
  const w = world(mode);
  const done = run(w.rt, mode === 'json' ? ['--json'] : []);
  w.clock.tick(TICK * (STEPS.length + 1));
  await done;
  return w.out.join('');
}

const result = { size: SIZE, tty: await terminal() };
// eslint-disable-next-line reliability/no-await-in-loop -- one run at a time: every run shares flagstaff's registry
for (const mode of ['pipe', 'ci', 'json', 'accessible']) result[mode] = await projected(mode);
process.stdout.write(JSON.stringify(result));
