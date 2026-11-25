/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * The five-second gate's one exemption list and its advice (D-20261101-tests-under-5s). The gate
 * itself is truepass's budget reporter (`packages/truepass/src/vitest-reporter.ts`), which every
 * suite loads from source through `vitest-timeouts.config.ts`; `scripts/case-budget.ts` judges a
 * battery's deferred candidates with the same list and advice.
 *
 * `NIGHTLY_ONLY` is the only exemption, and it is not for a slow case that runs on a pull
 * request: a case belongs there only when it was moved behind BURGEE_NIGHTLY, which only the weekly
 * local run (`npm run mutation:weekly`) sets, and the reason says what heavy operation it needs
 * (D-20261101-heavy-ci-runs-nightly; D-20261101-no-mutation-in-gha moved the run out of CI).
 */

/** The owner's number. A case at exactly the budget is within it. */
export const CASE_BUDGET_MS = 5_000;

/**
 * Cases that run only on the nightly schedule, keyed `<repo-relative file> > <full name>`, each
 * with the heavy operation that keeps it off a pull request. Empty is the goal; an entry leaves
 * by getting fast, never by being explained again.
 */
const E2E = 'packages/oxmutate/src/e2e.test.ts';
/** Why every oxmutate entry below is here; each adds what its own run does. */
const MUTATION_RUN = 'a whole oxmutate run on a fixture — the CLI, its Vitest servers, every mutant — 6.5–15 s on a contended CI runner, and only oxmutate source can make it faster (follow-up in the PR that moved it)';
export const NIGHTLY_ONLY: Readonly<Record<string, string>> = {
  [`${E2E} > keeps a test file's dry run until its source, its test, its mutants or the config change`]: `${MUTATION_RUN}, eight runs in a row over one fixture, each changing what one test file depends on`,
  [`${E2E} > queues a stopped mutant's 3x run while the first stage is still running`]: `${MUTATION_RUN}, one mutant stalled 8 s on purpose beside one running 7 s; 22 s`,
  [`${E2E} > stops a mutant at the limit of the test it hangs, not of the slowest test that covers it`]: `${MUTATION_RUN}, two mutants blocking a worker for ever, stopped and re-run; 35 s`,
  [`${E2E} > says how the worker ended when a mutant takes it down`]: `${MUTATION_RUN}, a mutant killing its worker's process with SIGKILL; about 6 s`,
  [`${E2E} > runs a mutant whose worker went down once alone: a neighbour's crash is not its verdict`]: `${MUTATION_RUN}, a mutant killing every worker of the run beside a 4 s test; about 25 s`,
  [`${E2E} > gives a blocked warm run its 3x in place, with no server restart and the same verdicts`]: `${MUTATION_RUN}, its mutant blocking 1.2 s past its budget on purpose; 8.5 s`,
  [`${E2E} > takes the processes a test started with a server the watchdog kills`]: `${MUTATION_RUN}, through a watchdog kill and its 3x re-run, each starting a child; 20.3 s`,
  [`${E2E} > restarts a polluted context and judges later mutants from a clean state`]: `${MUTATION_RUN}; 8.2 s`,
  [`${E2E} > keeps the pool the project’s Vitest config asks for: tests that call process.chdir run in forks`]: `${MUTATION_RUN}; unmeasured`,
  [`${E2E} > re-runs file-level beforeEach hooks between mutants, so they read as no pollution`]: `${MUTATION_RUN}; 7.1 s`,
  [`${E2E} > decides no kill on a previous mutant's leftovers that a test cleaned up in finally`]: `${MUTATION_RUN}; 11.4 s`,
  [`${E2E} > kills a mutant a beforeEach hook reaches in the warm run, with no isolated run`]: `${MUTATION_RUN}; 6.6 s`,
  [`${E2E} > runs a run-once test file (ESLint's RuleTester) from fresh collections, with no restart`]: `${MUTATION_RUN}; unmeasured`,
  [`${E2E} > static mutants keep their fresh-worker verdicts > an import-time constant decides its mutants; an unread one survives`]: `${MUTATION_RUN}, every static mutant in a fresh worker; 6.9 s`,
  [`${E2E} > static mutants keep their fresh-worker verdicts > a global set at import does not carry one mutant value into the next`]: `${MUTATION_RUN}, every static mutant in a fresh worker; 9.3 s`,
  [`${E2E} > runs a mutant the warm run stopped busy once, at 3x, not at 1x and again at 3x`]: `${MUTATION_RUN}, whose fixture loops for ever on purpose so the watchdog's 3x stop is what decides; 12.6 s`,
  [`${E2E} > confirms a watchdog stop with 3x the budget before reporting a timeout`]: `${MUTATION_RUN}, whose fixture stalls 8 s twice on purpose so the 3x confirmation is what decides; 14.6 s`,
  [`${E2E} > the frozen oracle (R14, SC10) > reports the mutants a change stopped detecting when it weakens a test, and exits 1`]: `${MUTATION_RUN}, twice: the frozen base and the change; 9.7 s`,
  [`${E2E} > the frozen oracle (R14, SC10) > reports no drop when a change only adds a test`]: `${MUTATION_RUN}, twice: the frozen base and the change; 7.7 s`,
  [`${E2E} > the command runner (testRunner: command) > runs the command once per mutant in a sandbox and scores what the warm runner scores`]: `${MUTATION_RUN}, \`npx vitest run\` once per mutant; 9.3 s`,
  ['packages/oxmutate/src/sensitivity.test.ts > sensitivity (SC5) > a weak suite produces survivors, every one of them covered by a test that ran']: `${MUTATION_RUN}; 8.9 s`,
  ['packages/oxmutate/src/sensitivity.test.ts > sensitivity (SC5) > the closed suite produces none, over the same mutants']: `${MUTATION_RUN}; 16.1 s`,
  ['packages/oxmutate/src/vitest5-regression.test.ts > the Vitest 5 regression (SC7) > reports no killed mutant as Survived: every mutant is Killed by a test that ran']: `${MUTATION_RUN}, under the fixture's own Vitest 5; 6.4 s`,
  [
    "packages/oxmutate/src/vitest5-regression.test.ts > the Vitest 5 regression (SC7) > reproduces the defect: with Stryker 10.0.0's name filter put back, the same mutants are Survived having run no test"
  ]: `${MUTATION_RUN}, twice, the second with every mutant surviving into its confirmation run; 28.7 s`,
  [`${E2E} > survivor confirmation in a live worker > kills the cross-test mutant and keeps the survivors, with no fresh worker`]: `${MUTATION_RUN}; 2.9–4.3 s`,
  [`${E2E} > survivor confirmation in a live worker > gives the same verdicts live (OXMUTATE_LIVE_CONFIRM=1) and in fresh workers, the default`]: `${MUTATION_RUN}, twice: confirmations live and in fresh workers; 8.5 s`,
  [`${E2E} > pollution recovered in the worker > gives the verdicts a restart gives, in one worker, and runs a later test on the new collection`]: `${MUTATION_RUN}, twice: in-worker recovery and restarts; unmeasured`,
  [`${E2E} > pollution recovered in the worker > recovers in place when a test left process.cwd mocked, finding Vitest from where the project was`]: `${MUTATION_RUN}, twice: in-worker recovery and restarts; unmeasured`,
  [`${E2E} > pollution recovered in the worker > restarts when the worker's globals changed: a warm memo would hide the next test's mutant`]: `${MUTATION_RUN}, three times: recovery, restarts, and recovery without its guard; unmeasured`,
  [`${E2E} > pollution recovered in the worker > restarts when the unmutated test still fails on the new collection: leftovers a reset does not clear`]: `${MUTATION_RUN}, three times: recovery, restarts, and recovery without its proof; unmeasured`,
  [`${E2E} > warm state that hides a mutant > gives every mutant of a memoized computation the verdict of a fresh worker, wherever it sits in its unit`]: `${MUTATION_RUN}, twice: warm and every mutant armed in a fresh worker; unmeasured`,
  [`${E2E} > warm state that hides a mutant > reports a hidden mutant that takes the worker down as the RuntimeError a fresh worker gives it`]: `${MUTATION_RUN}, twice: warm and every mutant armed in a fresh worker, the mutant killing its worker; unmeasured`,
  [`${E2E} > warm state that hides a mutant > reports them Survived when the warm survivors are trusted, as 2.10 did: the check is what kills them`]: `${MUTATION_RUN}; unmeasured`,
  [`${E2E} > keeps a survivor whose confirmation run was only slow, not killed`]: `${MUTATION_RUN}, whose fixture stalls 6 s on purpose so the confirmation's 3x re-run is what decides; 5.8 s`,
  ['packages/oxmutate/src/checker.test.ts > the type checker > refuses the mutants that do not compile, with the error, and passes the ones that do']:
    'the real TypeScript compiler, `npx tsc` once per batch, over the fixture project; 15.1 s on a contended CI runner',
};

/** What the gate prints under the slow cases. */
export const CASE_BUDGET_HINT =
  'Make the case fast without weakening it (share a spawn in beforeAll, import instead of spawning, shrink the fixture), or, if it truly needs a heavy operation, move it behind BURGEE_NIGHTLY (npm run mutation:weekly runs it) and name it in NIGHTLY_ONLY (scripts/nightly-only.ts) with the reason. D-20261101-tests-under-5s.';
