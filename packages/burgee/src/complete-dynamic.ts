/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * D3 / D-119 — the program's side of a dynamic completion. A generated script calls
 * `<program> __complete <words before the cursor…> <partial>` for an option or a positional that
 * declared `complete`, and prints what comes back, one candidate per line.
 *
 * completion-context R1–R3: the words before the cursor are read with the command's own specs,
 * leniently (`strict: false`, no required option, no relation), and handed to the completer as
 * its second argument. The target is the option whose value the cursor is on, or else the
 * positional slot the cursor is in. A script generated before this passed only
 * `<command…> --<option> <partial>`, which is the same call with fewer words, so it still works.
 *
 * It never fails loudly. A TAB that prints an error into someone's prompt is worse than one
 * that offers nothing, so an unknown command, a target without a completer, or a completer
 * that throws all print nothing and leave 0.
 *
 * Imported by `execute.ts` only when argv starts with `__complete` (M2).
 */
import { type Token } from './execute.js';
import { type ArgumentSpec, type Completer, type CompletionContext, type Manifest, type OptionSpec } from './manifest.js';
import { kebab } from './names.js';
import { builtin } from './runtime.js';
import { coerce } from './validate.js';

type Specs = Record<string, OptionSpec>;

/** The option a word spells and that takes a value: `--branch`, or a short `-b`. */
function valuedSpec(specs: Specs, word: string): OptionSpec | undefined {
  return Object.entries(specs).find(([key, spec]) => spec.type !== 'boolean' && (word === `--${kebab(key)}` || word === `-${spec.short}`))?.[1];
}

/**
 * The words before the cursor, as `parseArgs` reads them for a run, except that nothing is
 * refused (R2). An option it does not know — a reserved one, `--no-<boolean>` — is a boolean
 * token under its own name, which is how the fold below reads both.
 */
function tokensOf(specs: Specs, words: string[]): Token[] {
  const options = Object.fromEntries(Object.entries(specs).map(([key, spec]) => [kebab(key), { type: spec.type === 'boolean' ? 'boolean' : 'string', ...(spec.short && { short: spec.short }) }] as const));
  return builtin('node:util').parseArgs({ args: words, options, strict: false, allowPositionals: true, tokens: true }).tokens;
}

/** The declared option a parser token spells, and the value it gives it: a boolean's spelling says which. */
function readOption(specs: Specs, piece: Extract<Token, { kind: 'option' }>, typed: ReadonlyMap<string, unknown>): [string, unknown] | undefined {
  for (const [key, spec] of Object.entries(specs)) {
    if (spec.type === 'boolean' && (piece.name === kebab(key) || piece.name === `no-${kebab(key)}`)) return [key, piece.name === kebab(key)];
    // A boolean returned above, so this is a valued option, and its token carries its value:
    // `strict: false` hands a string option the next word whatever it is, and only the last
    // token can lack one.
    if (piece.name === kebab(key)) return [key, spec.multiple === true ? [...((typed.get(key) as string[] | undefined) ?? []), piece.value as string] : piece.value];
  }
  return undefined;
}

/**
 * Each option at its last value, in the order typed: a boolean's last spelling wins
 * (`--force --no-force` is `false`), a repeatable collects. The option the cursor is on is not
 * among the tokens it is handed.
 */
function typedOf(specs: Specs, tokens: Token[]): { typed: Map<string, unknown>; positionals: string[] } {
  const typed = new Map<string, unknown>();
  const positionals: string[] = [];
  for (const piece of tokens) {
    if (piece.kind === 'positional') positionals.push(piece.value);
    // Stryker disable next-line ConditionalExpression: equivalent — a positional or `--` token has no name, so it names no option and `readOption` skips it too
    if (piece.kind !== 'option') continue;
    const read = readOption(specs, piece, typed);
    if (read !== undefined) typed.set(...read);
  }
  return { typed, positionals };
}

/** Coerced one option at a time, so one bad value costs only itself: it goes to `raw`, as typed (R2). */
async function contextOf(specs: Specs, path: string[], tokens: Token[]): Promise<CompletionContext> {
  const { typed, positionals } = typedOf(specs, tokens);
  const each = await Promise.all(
    [...typed].map(async ([key, value]) => {
      const spec = specs[key] as OptionSpec;
      return await coerce({ [key]: spec }, { [key]: value }).then(
        (coerced) => ({ key, ok: true, value: coerced[key] }),
        () => ({ key, ok: false, value: Array.isArray(value) ? value.join(spec.separator ?? ',') : String(value) }),
      );
    }),
  );
  const options = Object.fromEntries(each.filter((e) => e.ok).map((e) => [e.key, e.value]));
  const raw = Object.fromEntries(each.filter((e) => !e.ok).map((e) => [e.key, e.value as string]));
  return { path, options, positionals, raw };
}

/** The positional slot the cursor is in, counted against the declared arguments; a variadic last one takes every slot from its own on. */
function slotOf(args: readonly ArgumentSpec[], at: number): ArgumentSpec | undefined {
  if (at < args.length) return args[at];
  const last = args.at(-1);
  return last?.variadic === true ? last : undefined;
}

export async function completeDynamic(manifest: Manifest, argv: readonly string[], write: (s: string) => unknown): Promise<void> {
  const words = [...argv];
  let partial = words.pop() ?? '';
  const { node, rest } = manifest.resolve(words, manifest.rootPath);
  if (node === undefined) return;
  const specs = node.options;
  // A shell that drops the empty word under the cursor (PowerShell before 7.3 drops an empty
  // argument to a native command) ends the call on the option itself: the cursor is on its
  // value, and nothing is typed.
  if (valuedSpec(specs, partial) !== undefined) {
    rest.push(partial);
    partial = '';
  }
  const tokens = tokensOf(specs, rest);
  const last = tokens.at(-1);
  const awaiting = last?.kind === 'option' && last.value === undefined ? valuedSpec(specs, last.rawName) : undefined;
  const context = await contextOf(specs, node.path.slice(manifest.rootPath.length), awaiting === undefined ? tokens : tokens.slice(0, -1));
  // A word starting `-` is an option being typed, which the script completes from the
  // manifest, unless it follows `--`.
  const typingOption = partial.startsWith('-') && !tokens.some((t) => t.kind === 'option-terminator');
  // Stryker disable next-line ArrayDeclaration: equivalent — a placeholder element has no `complete`, so a command without arguments completes no positional either way
  const positional = typingOption ? undefined : slotOf(node.arguments ?? [], context.positionals.length);
  const complete: Completer | undefined = awaiting === undefined ? positional?.complete : awaiting.complete;
  // Stryker disable next-line ConditionalExpression: equivalent — calling an absent completer throws inside the catch below, which offers nothing too
  if (complete === undefined) return;
  // A completer that throws offers nothing (see the header): its failure is the program's to
  // report on the next real run, not the shell's to print into someone's prompt.
  const offered = await Promise.resolve()
    .then(async () => [...(await complete(partial, context))])
    .then(
      (all) => all,
      () => [] as string[],
    );
  const found = offered.filter((c) => c.startsWith(partial));
  if (found.length > 0) write(`${found.join('\n')}\n`);
}
