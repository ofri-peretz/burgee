/**
 * `seniority/dotenv/config` — dotenv's `import 'dotenv/config'` and `node -r dotenv/config`.
 *
 * Importing it *is* the call: it loads `./.env` (or whatever `DOTENV_PATH` names) into the
 * process's environment, as dotenv 18's `config.js` does, and it is **quiet unless asked** —
 * a side-effect import should not print. `DOTENV_QUIET` (or the older `DOTENV_CONFIG_QUIET`)
 * in the starting environment overrides that, `false` included; a `DOTENV_QUIET` inside the
 * `.env` file does not, because the entry point has already said.
 */
// eslint-disable-next-line import-next/no-unused-modules -- a side-effect entry exports nothing, as `dotenv/config` exports nothing; importing it is the call.
import { config } from './dotenv.js';
import { ambientEnv } from './runtime.js';

/** What this entry passes as `quiet`: the starting environment's say, else quiet. */
function entryQuiet(env: Record<string, string | undefined> = ambientEnv() ?? {}): string | boolean {
  return env['DOTENV_QUIET'] ?? env['DOTENV_CONFIG_QUIET'] ?? true;
}

config({ quiet: entryQuiet() });
