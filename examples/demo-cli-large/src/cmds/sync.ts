/** A lazily loaded handler: importing this module is the event the lock counts (M2). */
import { type RunContext } from 'burgee';

import { loaded } from './loads.js';

loaded.push('sync');

export function run({ options, positionals }: RunContext): unknown {
  return { command: 'sync', target: positionals[0] ?? null, verbose: options['verbose'] === true, dryRun: options['dryRun'] === true, changed: options['dryRun'] !== true };
}
