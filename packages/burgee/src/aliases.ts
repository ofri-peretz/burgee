/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * facade-projection-fidelity R5 — a command alias, read as the command it names.
 *
 * Imported by `execute.ts` only for a program that declares an alias (M2). It rewrites argv once,
 * before anything resolves it, so dispatch, `help <command>`, `--schema <command>` and
 * `__complete <command>` all see one spelling, and the parse refusals name the command as declared.
 * Here and not in `Manifest.resolve`: the commander and yargs front-ends carry that class and
 * resolve their own aliases, so neither pays for this.
 */
import { type Manifest } from './manifest.js';

/**
 * Each word that names a child of the command matched so far, by its name or one of its aliases,
 * becomes that name; every other word is left as typed. A word is matched against the children of
 * the deepest command named before it, so a positional is rewritten only where a subcommand could
 * stand, which is where `resolve` would read it as one. Nothing after `--` is a command.
 */
export function unalias(manifest: Manifest, argv: readonly string[], root: readonly string[]): string[] {
  // Order is significant: `at` is the deepest command matched so far, and each word reads the one before it.
  let at = root;
  const end = argv.indexOf('--');
  return argv.map((word, i) => {
    const node = end !== -1 && i > end ? undefined : manifest.commands.find((c) => c.path.length === at.length + 1 && at.every((seg, j) => c.path[j] === seg) && (c.path.at(-1) === word || c.aliases?.includes(word)));
    if (node === undefined) return word;
    at = node.path;
    return node.path.at(-1) as string;
  });
}
