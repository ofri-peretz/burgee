/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * D-122 — the `parse` stage: argv in, argv out, before the command is resolved. Each plugin,
 * in `enforce` order, is handed what the previous one returned; returning nothing keeps it.
 * A filter is matched against the typed argv, since no command has been resolved yet.
 *
 * Imported by `Manifest.parse` only, which runs only when a plugin declares the stage (M2).
 */
import { hookApplies } from './manifest.js';
import { type Plugin } from './plugin.js';

export async function runParseHooks(plugins: readonly Plugin[], argv: string[]): Promise<string[]> {
  let current = argv;
  for (const plugin of plugins) {
    const hook = plugin.hooks?.parse;
    const typed = current.join(' ');
    if (!hookApplies(hook, typed)) continue;
    // Sequential on purpose: each plugin is handed what the previous one returned.
    // eslint-disable-next-line reliability/no-await-in-loop -- the chain is the contract; running them at once would hand every plugin the original argv
    const next = await hook.handler({ command: typed, options: {}, argv: [...current] });
    if (next === undefined) continue;
    if (!Array.isArray(next) || !next.every((a) => typeof a === 'string')) throw new Error(`burgee: plugin "${plugin.name}"'s parse hook returned ${typeof next}; return string[] or nothing`);
    current = next;
  }
  return current;
}
