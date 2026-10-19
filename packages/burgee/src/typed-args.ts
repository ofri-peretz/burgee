/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * typed-positionals R3 — each declared positional as its declared type, or the usage error an
 * option's value gets: exit 2, the catalog's words, and a `fix` when exactly one value is right.
 *
 * Imported by `execute.ts` only for a command whose arguments declare a `type` or `choices` (M2),
 * so a program whose positionals are plain words, which is every 1.x program, loads none of it.
 * S4's `-` is answered here too: standard input is only ever a `type: 'file'` argument's, and such a
 * command loads this chunk, so the engine's startup path carries one gate for both.
 *
 * R1's check of the declaration is here as well, and not in `definition.ts`'s door, for bytes that
 * are a published claim: every front-end reaches that door, and the 380 bytes it cost there took
 * `burgee ÷ cac` and `burgee/commander ÷ commander` over their downward-only ratchets (D-157).
 * TypeScript refuses both mistakes where the command is written (`DeclaredArgument`); this refuses
 * them for a caller it does not check, on the first run of that command, before any word is read.
 */
import { type Token } from './execute.js';
import { type ArgumentSpec, type CommandNode, type RunContext } from './manifest.js';
import { stdinFor } from './stdin-dash.js';
import { suggestSimilar } from './suggest.js';
import { UsageError } from './validate.js';

/**
 * Throws the refusal, carrying the one word its `fix` replaces as `swap`: the word's place counted
 * from the end of the line, which is where `rest` and the whole line agree (`failure.ts`, as
 * parse-refusals R4's `omit`), and the word to put there. Without a place or a word, no `fix`.
 */
function refuse(error: UsageError & { swap?: [number, string] }, at: number | undefined, put?: string): never {
  if (at !== undefined && put !== undefined) error.swap = [at, put];
  throw error;
}

/** R1 — a type the engine coerces to, and `choices` on a string one alone, as on an option. */
function checkDeclared(node: CommandNode, declared: readonly ArgumentSpec[]): void {
  for (const { name, type = 'string', choices } of declared) {
    const what = `burgee: argument "${name}" of "${node.path.join(' ')}"`;
    // A literal here and not a module constant: Stryker cannot re-run module initialisation, so a mutant there would pass untested.
    if (!['string', 'number', 'integer', 'boolean', 'file'].includes(type)) throw new Error(`${what} has unknown type "${type}"`);
    if (choices && type !== 'string') throw new Error(`${what} declares choices but is not a string`);
  }
}

/** One word as `a` declares it. `at` is its place from the end of the line, when the `fix` may name it. */
function valueOf(a: ArgumentSpec, word: string, at: number | undefined): unknown {
  if (a.choices !== undefined && !a.choices.includes(word)) {
    // The closest choice, only when there is exactly one: a fix is run as it is, so never a guess (E3).
    // Stryker disable next-line OptionalChaining: a match of a pattern with a named group always has `groups`
    const near = /Did you mean (?<word>[^ ?]+)\?/u.exec(suggestSimilar(word, [...a.choices]))?.groups?.['word'];
    refuse(new UsageError(`argument "${a.name}" must be one of ${a.choices.join(', ')}, got "${word}"`, near === undefined ? undefined : `did you mean ${near}?`), at, near);
  }
  if (a.type === 'boolean') return word === 'true' || (word === 'false' ? false : refuse(new UsageError(`argument "${a.name}" expects true or false, got "${word}"`), at));
  return a.type === 'number' || a.type === 'integer' ? numberOf(a, word, at) : word;
}

/** A `number` or `integer` argument's word as a number, by an option's rule, or its refusal. */
function numberOf(a: ArgumentSpec, word: string, at: number | undefined): number {
  // An option's number rule (S3, yargs #1079): blank is not 0, and NaN and Infinity never reach a handler.
  const n = word.trim() === '' ? Number.NaN : Number(word);
  if (Number.isFinite(n) && (a.type === 'number' || Number.isInteger(n))) return n;
  // Stryker disable next-line ConditionalExpression: a non-finite word fails both branches' tests the same way; the rounded fix below is what tells them apart
  return refuse(new UsageError(a.type === 'integer' ? `argument "${a.name}" expects an integer, got "${word}"` : `argument "${a.name}" expects a number, got "${word}"`), at, Number.isFinite(n) ? String(Math.round(n)) : undefined);
}

/**
 * `args` with every declared positional's words as its type, and the `stdin` a `-` names (S4). A
 * variadic argument's words are each checked in turn; an absent one keeps its default, coerced the
 * same way, and has no place to fix.
 */
// eslint-disable-next-line maintainability/max-parameters -- the call mirrors `parse-refusals.js`' `refuse`, the other chunk `execute.ts` loads beside it, plus the stdin S4 hands over: an options object would cost the startup path that calls it.
export function typedArgs(node: CommandNode, args: Record<string, unknown>, { tokens }: { tokens: readonly Token[] }, rest: readonly string[], typed: readonly string[], stdin: NodeJS.ReadableStream): Pick<RunContext, 'args' | 'stdin'> {
  // Never empty: `execute.ts` loads this chunk only for a command that declares a typed argument.
  const declared = node.arguments as readonly ArgumentSpec[];
  checkDeclared(node, declared);
  // The positionals before `--`, and where each was typed in `rest`: no places at all when the lazy
  // flags took words out of it (`typed` is the line before they did), as parse-refusals R4 decides.
  const positionals: string[] = [];
  const places: (number | undefined)[] = [];
  for (const token of tokens) {
    if (token.kind === 'option-terminator') break;
    if (token.kind !== 'positional') continue;
    positionals.push(token.value);
    places.push(rest.length === typed.length ? rest.length - token.index : undefined);
  }
  const out = new Map(Object.entries(args));
  for (const [i, a] of declared.entries()) {
    const raw = out.get(a.name);
    if (Array.isArray(raw)) out.set(a.name, raw.map((word: string, k) => valueOf(a, word, places[i + k])));
    else if (typeof raw === 'string') out.set(a.name, valueOf(a, raw, places[i]));
  }
  return { args: Object.fromEntries(out), ...(positionals.includes('-') ? stdinFor(declared, positionals, stdin) : {}) };
}
