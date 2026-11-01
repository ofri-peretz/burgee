import { defineConfig } from 'vitest/config';

// The test timeout sits where caique's 30 s does against its budgets: past the isolated run's budget
// (2 s with timeoutMS 500), inside the 3x re-run's (6 s). So before idle stops were Timeouts, the hung
// mutant was stopped at 2 s, re-run, and came out Killed when this timeout failed the test.
export default defineConfig({ test: { include: ['src/**/*.spec.ts'], testTimeout: 2500 } });
