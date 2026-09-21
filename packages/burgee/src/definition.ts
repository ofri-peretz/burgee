/**
 * What must be true of a command's declaration before it is added — whoever declared it.
 *
 * Split out of `validate.ts` on 2026-09-16, and the weight lock is what asked for it. That
 * file holds two unrelated jobs: these checks, which run once when a program is built, and
 * the run-time half — relations, numbers, choices, Standard Schema — which runs on every
 * invocation and is four fifths of the bytes. Nothing minded while the only caller was
 * `defineCommand`, because the engine carries both anyway.
 *
 * The plugin host is what made it matter. `Manifest.use()` has to run these checks, so
 * `plugin.ts` imports them, so **every** graph that reaches the manifest now reaches them —
 * and that includes the commander and yargs front-ends, which reach the manifest and nothing
 * else of the engine. Importing `validate.js` for `checkDefinition` put 6,409 bytes of
 * run-time coercion into both front-ends to get 1,600 bytes of definition checking, and took
 * `./commander` over 128,000 — the budget that exists to prove the front-end is no heavier
 * than commander's own `lib/`. One file per job, and the front-ends pay for the job they use.
 */
import { type OptionSpec } from './manifest.js';
import { camel, kebab } from './names.js';

const TYPES = new Set(['string', 'boolean', 'number']);

/**
 * The three answers about the world. Data rather than a second copy of {@link Effects} —
 * `mcp.ts` maps each one to its MCP hints and this file refuses anything else.
 */
const EFFECTS: readonly string[] = ['read_only', 'idempotent', 'non_idempotent'];

/**
 * The fourth answer, which is not about the world: *this command is not offered to agents*.
 *
 * Exported because `mcp.ts` filters on it and a second spelling of a magic string is a
 * second thing to keep in step. See `DeclaredEffects` in `manifest.ts` for why the word is
 * `withheld` and not `none`.
 */
export const WITHHELD = 'withheld';

const DECLARED: readonly string[] = [...EFFECTS, WITHHELD];

/** Reserved names a command may not redefine (V5): the surfaces every program serves. */
const RESERVED = new Set(['json', 'help', 'schema', 'mcp', 'version', 'explain']);

/**
 * What must be true of one option's spec, as opposed to its name: a numeric bound only on a
 * number, and relations that name options this command declares. The name's own checks —
 * type, short alias, reserved surface, canonical key — stay in {@link checkDefinition}'s
 * loop, which is where `flag` is computed.
 *
 * `dependsOn` and `exclusive` may only name options this command declares, and never
 * themselves.
 *
 * Both mistakes are silent at run time, in opposite directions, which is why they are refused
 * here. A misspelt `dependsOn` compiles to an `implies` whose consequent is never set, so
 * *every* invocation naming the option is refused for want of a flag the program does not
 * have. A misspelt `exclusive` — and a self-reference, which is the same shape, since
 * `conflicts: ['a', 'a']` sees one set option and not two — compiles to a constraint that can
 * never fire, so the one the author wrote is simply absent.
 */
function checkSpec(name: string, key: string, spec: OptionSpec, options: Record<string, OptionSpec>): void {
  if ((spec.minimum !== undefined || spec.maximum !== undefined || spec.integer !== undefined) && spec.type !== 'number') {
    throw new Error(`burgee: option "${key}" of "${name}" declares a numeric bound but is not a number`);
  }
  for (const field of ['dependsOn', 'exclusive'] as const) {
    for (const other of spec[field] ?? []) {
      if (other !== key && other in options) continue;
      const why = other === key ? 'itself' : `not an option of "${name}"`;
      throw new Error(`burgee: option "${key}" of "${name}" declares ${field} "${other}", which is ${why}`);
    }
  }
}

/**
 * What must be true of a declaration before anything runs (yargs #1198, #887, #1679):
 * a known type, one short alias per command, no two keys that meet on the command line, and
 * none of V5's reserved surfaces.
 *
 * The reserved names used to be a second loop over the same keys in {@link checkCommand},
 * and the numeric bound used to be a fourth branch in this one. Both moved to pay for the
 * canonical-key check below without raising a weight ceiling — `./plugin` had 5 bytes of
 * headroom — and both are better where they are now: `flag` is computed once here and
 * `kebab` is the identity on every reserved name, and a numeric bound is a fact about a
 * spec rather than about a name. The file is 51 bytes smaller than before the check existed.
 */
export function checkDefinition(name: string, options: Record<string, OptionSpec>): void {
  const shorts = new Map<string, string>();
  const flags = new Map<string, string>();
  for (const [key, spec] of Object.entries(options)) {
    if (!TYPES.has(spec.type)) throw new Error(`burgee: option "${key}" of "${name}" has unknown type "${String(spec.type)}"`);
    if (spec.short !== undefined) {
      const owner = shorts.get(spec.short);
      if (owner !== undefined) throw new Error(`burgee: options "${owner}" and "${key}" of "${name}" both use -${spec.short}`);
      shorts.set(spec.short, key);
    }
    const flag = kebab(key);
    // V5's reserved surfaces, checked on the flag rather than the key: `kebab` is the
    // identity on every name in the set, so one test covers both spellings.
    if (RESERVED.has(flag)) throw new Error(`burgee: option "${key}" is reserved and cannot be redefined`);
    // The engine keys options camelCase and only camelCase (S5, `names.ts`): `toParseConfig`
    // kebabs the declared name to build the flag and `canonical` camels every parsed key back,
    // so the flag layer reaching `resolveLayers` is camelCase while the specs beside it are
    // keyed as declared. Declare `'dry-run'` and the two never meet — `--dry-run` parses,
    // resolves to nothing, and the handler is handed `undefined` with no error anywhere.
    //
    // It is the same defect as the clash beside it, so it throws through the same sentence
    // rather than growing a second one: two keys that meet on the command line, one of them
    // written by `kebab()` rather than by the author. That framing is also what makes it
    // affordable — a separate message cost 187 bytes against 5 of headroom on `./plugin`.
    // Refused here rather than repaired at run time: a second accepted spelling would have
    // to be carried through help, --schema, Fig, the env, config and package.json layers and
    // the relation names, to reach a key the engine already has one canonical form of.
    const clash = flags.get(flag) ?? (camel(flag) === key ? undefined : camel(flag));
    if (clash !== undefined) throw new Error(`burgee: options "${clash}" and "${key}" of "${name}" are both --${flag}`);
    flags.set(flag, key);
    checkSpec(name, key, spec, options);
  }
}

/**
 * A command that runs says what running it does — or says that agents may not run it (N6).
 *
 * The refusal, not the filter, is the change. `toolsOf` serves only a command that declared
 * its `effects`, and that stays: an agent gaining shell-equivalent power over a CLI nobody
 * meant to publish is a security posture, not a convenience. What was wrong is that the
 * filter's input had one spelling for two different things. *I decided agents should not
 * have this* and *I forgot* both arrived as `undefined`, so the second shipped as the first:
 * the tool an author built for an agent was silently absent from `tools/list`, with a
 * shorter list than expected as the only evidence. `.sdlc/intents/burgee/design.md` called
 * it the quieter of the two failures, and quiet is why it lasted.
 *
 * So there is no default, and therefore nothing to forget. Declining stays possible and
 * becomes a thing an author writes down. **Breaking**: a runnable command declared without
 * `effects` used to be accepted and is now refused where it is declared.
 *
 * The three projections then disagree on purpose, each correctly: `--schema` publishes
 * `effects: "withheld"`, because an agent reading a program as data is better served by
 * *this exists and is not for you* than by a gap; `tools/list` omits it; Fig and the shell
 * completions carry it unchanged, because withholding is about agents and a person typing at
 * a terminal is not one.
 */
function checkEffects(name: string, effects: unknown, runs: boolean): void {
  if (effects === undefined) {
    if (!runs) return;
    throw new Error(`burgee: command "${name}" is runnable and declares no effects; declare ${EFFECTS.join(', ')} — or ${WITHHELD}, which serves it to people and keeps it out of the MCP tool list`);
  }
  if (!DECLARED.includes(effects as string)) {
    throw new Error(`burgee: command "${name}" declares effects ${JSON.stringify(effects)}, which is not an effects; use ${DECLARED.join(', ')}`);
  }
}

/**
 * The whole door: {@link checkDefinition} — which carries V5's reserved names — and
 * {@link checkEffects}.
 *
 * This exists as one function because it was two. `defineCommand` ran both; `Manifest.use()`
 * ran neither, so a plugin's command was admitted unread — and a plugin option named `json`
 * did not clash with the envelope flag, it replaced it in the parse config. The fix is not a
 * second copy of the guard beside `use()`; it is that there is one guard and both callers
 * reach it, which is the only arrangement a reader can check by looking.
 *
 * `effects` and `runs` are required rather than optional for exactly that reason. An optional
 * third argument would be a check a caller can decline by writing nothing, which is the shape
 * of the defect `checkEffects` exists to remove, one level up.
 */
export function checkCommand(name: string, options: Record<string, OptionSpec>, effects: unknown, runs: boolean): void {
  checkDefinition(name, options);
  checkEffects(name, effects, runs);
}
