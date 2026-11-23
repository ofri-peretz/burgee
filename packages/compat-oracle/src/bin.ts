import { main } from './report.js';

// The oracle's own CLI entry: the one file in this package that owns argv, the environment,
// stdout and the exit code. Everything else takes a writer.
// Stryker disable next-line ObjectLiteral: the entry runs only as the process, never under a test; report.test.ts asserts main hands env.GITHUB_TOKEN to the spec check
const env = { GITHUB_TOKEN: process.env.GITHUB_TOKEN };
process.exitCode = await main(
  process.argv.slice(2),
  (s) => {
    process.stdout.write(s);
  },
  undefined,
  env,
);
