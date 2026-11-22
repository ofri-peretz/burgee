// What a failed dry run tells the user to do. The dry run is the first time the project's own tests
// run under oxmutate, so its failures are mostly about the project and where it runs, not about a
// mutant: each message names the one thing to set.

/** Starts a line the test server writes to stderr for each error Vitest returned instead of throwing. */
export const VITEST_SAID = 'oxmutate-vitest: ';

const NETWORK = /ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ENETUNREACH|fetch failed/u;
const BUILD_OUTPUT = /Cannot find module|ERR_MODULE_NOT_FOUND|Failed to resolve (?:entry for package|import)/u;
const THREAD_POOL = /minThreads and options\.maxThreads/u;

/** The `fix:` of a dry run whose tests (or test files) failed with these first lines of their errors. */
export function dryFix(errors: readonly string[], inContainer: boolean, fallback: string): string {
  if (inContainer && errors.some((e) => NETWORK.test(e))) {
    return 'the run container has no network (--network=none by default); set container.network, or stub the network in the tests';
  }
  if (inContainer && errors.some((e) => BUILD_OUTPUT.test(e))) {
    return 'the tests import files the checkout does not have (build output git ignores); build it in the install (container.install: "<the install> && <your build, such as yarn build>"), or send it with container.include';
  }
  return fallback;
}

/** The message of a dry run that ran no test: what Vitest said, when it said something. */
export function emptyDryRun(stderr: string): string {
  const said = stderr.split('\n').filter((l) => l.startsWith(VITEST_SAID)).map((l) => l.slice(VITEST_SAID.length).trim());
  const first = said[0];
  if (first === undefined) return 'the dry run ran no tests. fix: check the Vitest config the run used, or set allowEmpty';
  const fix = THREAD_POOL.test(first) ? 'oxmutate supports Vitest 4.1 or later (its peerDependency), and this project is on an older one: upgrade vitest' : 'check the Vitest config the run used, or set allowEmpty';
  return `the dry run ran no tests: Vitest said ${first}. fix: ${fix}`;
}

/** The first error of the first failing test, on one line and cut: the clue the test names alone do not give. */
export function firstError(errors: readonly string[]): string {
  const first = errors[0]?.split('\n').find((l) => l.trim() !== '');
  return first === undefined ? '' : ` First error: ${first.trim().slice(0, FIRST_ERROR_CHARS)}.`;
}

const FIRST_ERROR_CHARS = 200;
