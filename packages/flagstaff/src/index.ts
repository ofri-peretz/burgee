/**
 * flagstaff — the staff the flag flies from. Re-exports only; each subpath is its own entry
 * and costs only itself, so prefer `flagstaff/spinner` when that is all you need.
 *
 * `./loop.js` is first on purpose. esbuild emits modules in import order, and its renamer hands
 * out the one-character names in that order, so `import { hoist } from 'flagstaff'` came out 2
 * bytes off the same import from `flagstaff/loop` once the loop reached `linegauge` through
 * `box.js`'s edge before its own. Same code, different names: `tree-shake-fixture.test.ts`
 * holds the two equal, and loop-first keeps them equal.
 */
export * from './loop.js';
export * from './box.js';
export * from './import.js';
export * from './plugin.js';
export * from './progress.js';
export * from './spinner.js';
export * from './table.js';
export * from './tasks.js';
