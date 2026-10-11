/**
 * agent-lint-conformance R6 — a runnable command with no examples is a warning, never a refusal.
 *
 * An example is the one line of help a reader can run as it stands, and `--schema` hands it to an
 * agent as data; a command without one leaves both to guess the shape of a call. A refusal would
 * break every program declared before examples were expected, so it is said — by `burgee dev`, on
 * every load, which is where an author is looking — and nothing stops.
 *
 * Beside `checkCommand` in `definition.ts` rather than inside it, which is where the spec put it:
 * that door is on every graph that reaches the manifest, the commander and yargs front-ends
 * included, and the sentence below cost `./plugin` 337 bytes against a budget with none to spare.
 * Only `dev.ts` reads this module.
 */
import { type Declared } from './definition.js';

export function missingExamples(name: string, declared: Declared & { examples?: readonly unknown[] }): string | undefined {
  const runs = declared.run !== undefined || declared.load !== undefined;
  if (!runs || (declared.examples?.length ?? 0) > 0) return undefined;
  return `command "${name}" declares no examples; add examples: [{ command: '…' }] so help and --schema show a call that works`;
}
