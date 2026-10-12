/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * parse-refusals R1–R3 — input a native command would otherwise drop, refused, and the missing
 * argument check that was always beside them.
 *
 * Imported by `execute.ts` only when argv holds a different count of positionals than the command
 * declares or names one option twice (M2), so a line that can be none of these pays nothing. Both
 * drops reached an agent as exit 0 with the wrong input, and nothing in a success triggers a retry.
 */
import { type Token } from './execute.js';
import { type CommandNode } from './manifest.js';
import { camel } from './names.js';
import { UsageError } from './validate.js';

/**
 * A missing argument first, then surplus positionals (R1) before a flag given twice with different
 * values (R3). Surplus words are positionals past the declared arguments, unless the last is
 * variadic or the command takes the excess (R2). Flags only, so a value from the environment or
 * config never conflicts with one: precedence decides that. Last first: the value the line ends
 * on is the one kept, and each earlier one that differs is named against it.
 */
export function refuseDropped(node: CommandNode, positionals: readonly string[], tokens: readonly Token[]): void {
  const declared = node.arguments ?? [];
  // Defined exactly when fewer positionals were typed than are required: the first one missing.
  const missing = declared.filter((a) => a.required !== false && a.variadic !== true)[positionals.length];
  if (missing !== undefined) throw new UsageError(`missing required argument "${missing.name}"`);
  const extra = node.allowExcess === true || declared.at(-1)?.variadic === true ? [] : positionals.slice(declared.length);
  if (extra.length > 0) throw new UsageError(`too many arguments: expected ${String(declared.length)}, got ${String(positionals.length)} (${extra.map((w) => `"${w}"`).join(', ')})`);
  const kept = new Map<string, string>();
  for (const flag of tokens.toReversed()) {
    if (flag.kind !== 'option' || flag.value === undefined || node.options[camel(flag.name)]?.multiple === true) continue;
    const later = kept.get(flag.name);
    if (later === undefined) kept.set(flag.name, flag.value);
    else if (!Object.is(later, flag.value)) throw new UsageError(`--${flag.name} was given twice: "${flag.value}" and "${later}"`);
  }
}
