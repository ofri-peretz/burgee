/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * D3 / D-119 — the program's side of a dynamic completion. A generated script calls
 * `<program> __complete <command…> --<option> <partial>` for an option that declared
 * `complete`, and prints what comes back, one candidate per line.
 *
 * It never fails loudly. A TAB that prints an error into someone's prompt is worse than one
 * that offers nothing, so an unknown command, an option without a completer, or a completer
 * that throws all print nothing and leave 0.
 *
 * Imported by `execute.ts` only when argv starts with `__complete` (M2).
 */
import { type Manifest } from './manifest.js';
import { kebab } from './names.js';

export async function completeDynamic(manifest: Manifest, argv: readonly string[], write: (s: string) => unknown): Promise<void> {
  const flag = argv.findIndex((a) => a.startsWith('--'));
  if (flag === -1) return;
  const { node } = manifest.resolve(argv.slice(0, flag), manifest.rootPath);
  const name = argv[flag]?.slice(2);
  const spec = Object.entries(node?.options ?? {}).find(([key]) => kebab(key) === name)?.[1];
  if (spec?.complete === undefined) return;
  const partial = argv[flag + 1] ?? '';
  const { complete } = spec;
  // A completer that throws offers nothing (see the header): its failure is the program's to
  // report on the next real run, not the shell's to print into someone's prompt.
  const offered = await Promise.resolve()
    .then(async () => [...(await complete(partial))])
    .then(
      (all) => all,
      () => [] as string[],
    );
  const found = offered.filter((c) => c.startsWith(partial));
  if (found.length > 0) write(`${found.join('\n')}\n`);
}
