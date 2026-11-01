/**
 * Not a pair: a workload for `runtime.test.ts` that writes 2 MiB of cursor sequences to stderr,
 * about twice what flagstaff/log-update writes over its 21 rounds (~1.1 MB). It holds `sample()`
 * to reading a child's whole output, the defect that killed B2–B4 on 2026-10-05 with `ENOBUFS`,
 * in milliseconds instead of the 16.7 s of timing log-update for real (D-20261101-tests-under-5s).
 */
const HIDE = '\u001B[?25l';
const BYTES = 2 * 1024 * 1024;

export default {
  n: 1,
  check() {
    process.stderr.write(HIDE.repeat(Math.ceil(BYTES / HIDE.length)));
  },
  ours: () => 1,
  theirs: () => 1,
};
