/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/** S4 — imported by `typed-args.ts`, which `execute.ts` loads only for a command with a typed argument (M2), and called only when a positional is `-`. */
import { type ArgumentSpec } from './manifest.js';
import { UsageError } from './validate.js';

/**
 * S4 — the stdin a `-` names, when a `type: 'file'` argument took it; nothing otherwise. A
 * variadic file argument covers every position from its own. Standard input can be read once,
 * so `-` for two file arguments is refused rather than handed to both.
 */
export function stdinFor(args: readonly ArgumentSpec[], positionals: readonly string[], stdin: NodeJS.ReadableStream): { stdin?: NodeJS.ReadableStream } {
  const last = args.at(-1);
  const isFile = (i: number): boolean => (args[i] ?? (last?.variadic === true ? last : undefined))?.type === 'file';
  const dashes = positionals.filter((p, i) => p === '-' && isFile(i)).length;
  if (dashes === 0) return {};
  if (dashes > 1) throw new UsageError(`"-" was given for ${String(dashes)} file arguments, and standard input can be read once`, 'pass a path for all but one of them');
  return { stdin };
}
