// The defect SC7 guards against, re-created on purpose (.sdlc/intents/oxmutate/intent.md, SC7).
//
// `@stryker-mutator/vitest-runner@10.0.0` names a test by joining its suite names with a space and
// runs each mutant with that name as `testNamePattern`. Vitest 5 matches the pattern against the
// test's full name, whose separator is ` > `. Nothing matches, every test is skipped, no test fails,
// and the mutant is recorded Survived (burgee, scripts/mutation-vitest-setup.ts, 2026-10-18).
//
// This setup file installs that filter in the mutant runs only. The dry run stays clean, so
// coverage is recorded as it would be without the fault. Loaded only by
// vitest.stryker-filter.config.mjs.
const strykerNames = [
  'parseHex a valid colour reads six digits as a number',
  'parseHex a valid colour reads upper-case digits',
  'parseHex rejects a value without the hash',
  'parseHex rejects text before the hash',
  'parseHex rejects a seventh digit',
  'parseHex rejects five digits',
  'parseHex rejects a digit outside hex',
];
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
const mode = process.env.OXMUTATE_MODE;
const state = globalThis.__vitest_worker__;
if (state?.config && (mode === 'mutant' || mode === 'isolated')) {
  state.config.testNamePattern = new RegExp(`^(?:${strykerNames.map(escape).join('|')})$`);
}

export {};
