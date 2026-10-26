/**
 * oxmutate's programmatic API. The CLI (`oxmutate run`) is this, declared on burgee.
 */
export { loadOptions, type Options, type Thresholds } from './config.js';
export { InstrumentFault, run, type MutantResult, type RunResult, type RunStats, type Status } from './coordinator.js';
export { changedLines, parseShard, shardOf } from './lanes.js';
export { native } from './native.js';
export { sarifReport, strykerReport, textSummary, VERSION } from './reports.js';
