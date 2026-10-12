/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * parse-refusals R1–R4 — input a native command would otherwise drop, refused.
 *
 * Imported by `execute.ts` only when argv holds more positionals than the command declares or
 * names one option twice (M2), so a line that can be neither pays nothing for this. Both drops
 * reached an agent as exit 0 with the wrong input, and nothing in a success triggers a retry.
 */
import { type Token } from './execute.js';
import { type CommandNode } from './manifest.js';
import { camel } from './names.js';
import { UsageError } from './validate.js';

type OptionToken = Extract<Token, { kind: 'option' }>;

/** The refusal, with the words its `fix` leaves out, counted from the end of the line (R4), when it can name them. */
class Dropped extends UsageError {
  constructor(
    message: string,
    readonly omit: number[] | undefined,
  ) {
    super(message);
  }
}

/** Where a refusal's `fix` comes from: the words to leave out, and whether a line without them is the one typed. */
interface Edit {
  omit: number[];
  runnable: boolean;
  /** Each word at `index` in `rest` and the `count - 1` after it, counted from the end of `rest`. */
  words: (index: number, count: number) => void;
}

/**
 * Throws the usage error for the first drop it finds: surplus positionals (R1) before a flag given
 * twice with different values (R3). `omit` is every word the `fix` line leaves out, counted from the
 * end of the line, which is where `rest` and the whole line typed agree (`failure.ts`, R4): the
 * surplus words and every repeat of a single-value flag but its last. It is left off, so the
 * refusal carries no `fix`, when the parser read one word as more than one token (a short-flag
 * group, `-vl x`), or when the lazy flags took words out of `rest` (`typed` is the line before
 * they did): a line rebuilt from a guess is not one to run.
 */
// eslint-disable-next-line maintainability/max-parameters -- `typed` beside `rest` is how this chunk knows its offsets are the line's; an options object would cost the startup path that calls it.
export function refuseDropped(node: CommandNode, positionals: readonly string[], tokens: readonly Token[], rest: readonly string[], typed: readonly string[]): void {
  const omit: number[] = [];
  const edit: Edit = { omit, runnable: rest.length === typed.length, words: (index, count) => void omit.push(...[rest.length - index, rest.length - index - 1].slice(0, count)) };
  // Both read, whichever is named: the `fix` has to leave out every word either would drop.
  const extra = surplus(node, positionals, tokens, edit);
  const message = repeated(node, tokens, rest, edit);
  if (extra !== undefined) throw new Dropped(extra, edit.runnable ? omit : undefined);
  if (message !== undefined) throw new Dropped(message, edit.runnable ? omit : undefined);
}

/** R1 — the positionals past the declared arguments, named, unless the last is variadic or the command takes the excess (R2). */
function surplus(node: CommandNode, positionals: readonly string[], tokens: readonly Token[], edit: Edit): string | undefined {
  const declared = node.arguments ?? [];
  const extra = node.allowExcess === true || declared.at(-1)?.variadic === true ? [] : positionals.slice(declared.length);
  // Positionals before `--` are the ones counted; the surplus is their tail, so it is the last of them.
  const counted = tokens.filter((word) => word.kind === 'positional').slice(declared.length, positionals.length);
  for (const word of extra.length === 0 ? [] : counted) edit.words(word.index, 1);
  return extra.length === 0 ? undefined : `too many arguments: expected ${String(declared.length)}, got ${String(positionals.length)} (${extra.map((w) => `"${w}"`).join(', ')})`;
}

/**
 * R3 — a single-value flag given twice with different values. Flags only, so a value from the
 * environment or config never conflicts with one: precedence decides that. Last first: the value
 * the line ends on is the one kept, and each earlier one is named against it.
 */
function repeated(node: CommandNode, tokens: readonly Token[], rest: readonly string[], edit: Edit): string | undefined {
  let message: string | undefined;
  const kept = new Map<string, OptionToken>();
  for (const flag of tokens.toReversed()) {
    if (flag.kind !== 'option' || flag.value === undefined || node.options[camel(flag.name)]?.multiple === true) continue;
    const later = kept.get(flag.name)?.value;
    if (later === undefined) {
      kept.set(flag.name, flag);
      continue;
    }
    // A repeat of the kept value was accepted, so the fix leaves it where it was typed.
    if (Object.is(later, flag.value)) continue;
    message ??= `--${flag.name} was given twice: "${flag.value}" and "${later}"`;
    edit.runnable &&= spelled(flag, rest[flag.index]);
    edit.words(flag.index, flag.inlineValue === true ? 1 : 2);
  }
  return message;
}

/** Whether the word at the flag's index is that flag alone: `--level`, `-l`, `--level=x`, `-lx`, and not `-vl`. */
function spelled(flag: OptionToken, word: string | undefined): boolean {
  if (flag.inlineValue !== true) return Object.is(word, flag.rawName);
  return word?.startsWith(flag.rawName) === true && word.endsWith(String(flag.value));
}
