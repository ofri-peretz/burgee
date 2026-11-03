import { defineConfig } from 'vitest/config';

// The test timeout sits where caique's 30 s does against its budgets: past the isolated run's budget
// (4.5 s with timeoutMS 3000), inside the 3x re-run's (13.5 s). So before idle stops were Timeouts, the
// hung mutant was stopped at 4.5 s, re-run, and came out Killed when this timeout failed the test. The
// budget leaves a loaded runner seconds to load the test file before the stop: a stop that comes while
// the worker still loads is a slow machine, not a hang, and a 1.5 s budget made this flaky on CI.
export default defineConfig({ test: { include: ['src/**/*.spec.ts'], testTimeout: 7000 } });
