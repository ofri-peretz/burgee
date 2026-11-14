// Copies a value while it loads: a test that reads `BETA_TIMEOUT` never reads `HOSTS`, so its
// mutant must keep every loader (static-readers.md, rule 2).
import { HOSTS } from './hosts.js';
export const BETA_TIMEOUT = HOSTS[1]?.timeoutMs;
