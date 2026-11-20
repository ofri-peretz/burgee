/**
 * What the live worker's own runner (runner.ts `runCollected`) does not do the way Vitest's run of a
 * file does. A file re-collected in a live worker is run by oxmutate: each suite's beforeAll and
 * afterAll, each test between its beforeEach and afterEach chain, stopping at the first failure. A
 * fresh worker runs it through Vitest, which also retries and repeats tests, inverts `test.fails`,
 * runs `concurrent` tests side by side, wraps tests in `aroundEach`/`aroundAll` hooks, runs the
 * handlers a test registers with `onTestFinished`/`onTestFailed`, and reads `context.skip()` as a
 * skip. A file that uses any of these is decided in a fresh worker instead, where Vitest runs it
 * (.sdlc/intents/oxmutate/confirm.qnt, `LIVE`).
 */

/** The fields of a collected Vitest task this check reads; Vitest 4.1 and 5 both set them. */
export interface CollectedTask {
  type: string;
  tasks?: CollectedTask[] | undefined;
  fails?: boolean | undefined;
  /** A count, or Vitest 5's `{ count, delay, condition }`. */
  retry?: number | { count?: number | undefined } | undefined;
  repeats?: number | undefined;
  concurrent?: boolean | undefined;
  /** Registered by `onTestFinished` / `onTestFailed` while the test ran; Vitest clears them after. */
  onFinished?: unknown[] | undefined;
  onFailed?: unknown[] | undefined;
  /** `pending`: the test called `context.skip()`. */
  result?: { pending?: boolean | undefined } | undefined;
}

/**
 * A suite's around-hooks (Vitest 5; absent on 4.1, which has none). Undefined for a suite Vitest
 * keeps no hooks for: a re-collected file whose import threw under the mutant (paratext, 2026-11-19).
 */
export type AroundHooks = (suite: CollectedTask) => { aroundEach?: unknown[] | undefined; aroundAll?: unknown[] | undefined } | undefined;

const retries = (retry: CollectedTask['retry']): number => (typeof retry === 'number' ? retry : (retry?.count ?? 0));

/** Why a test's verdict from the live runner could differ from Vitest's own run of it; undefined when it cannot. */
function testReason(t: CollectedTask): string | undefined {
  if (t.fails === true) return 'a test is marked `fails`';
  if (retries(t.retry) > 0) return 'a test is retried';
  if ((t.repeats ?? 0) > 0) return 'a test is repeated';
  if (t.concurrent === true) return 'a test runs concurrently';
  if ((t.onFinished?.length ?? 0) > 0 || (t.onFailed?.length ?? 0) > 0) return 'a test registered onTestFinished/onTestFailed';
  if (t.result?.pending === true) return 'a test skipped itself';
  return undefined;
}

/**
 * Why this collected file cannot be run by the live runner as Vitest would run it, or undefined.
 * Checked on the file as collected (what it declares) and again after each run (what its tests
 * registered while they ran).
 */
export function unmodeled(file: CollectedTask, hooksOf: AroundHooks): string | undefined {
  if (file.type === 'test') return testReason(file);
  const hooks = hooksOf(file);
  if ((hooks?.aroundEach?.length ?? 0) > 0 || (hooks?.aroundAll?.length ?? 0) > 0) return 'a suite has aroundEach/aroundAll hooks';
  for (const t of file.tasks ?? []) {
    const reason = unmodeled(t, hooksOf);
    if (reason !== undefined) return reason;
  }
  return undefined;
}
