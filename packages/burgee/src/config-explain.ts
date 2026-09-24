/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * V8 / D-117 — `config explain [command…]`: the precedence, and every option's value with the
 * source that won, **generated from the resolver** rather than written in a README. Ten of ten
 * surveyed CLIs read config and env; three of ten document the order. This one prints it,
 * from `seniority`'s own `ORDER`, so the table cannot disagree with what a run does.
 *
 * It resolves without the command line's own flags — it explains the configuration, not one
 * invocation — except `--config <path>` and `--no-config`, which choose what is read. With
 * `--json` it answers as data.
 *
 * Imported by `execute.ts` only for `config explain` (M2).
 */
import { ORDER, type Provenance, type Resolution } from 'seniority/precedence';

import { type Manifest, type OptionSpec } from './manifest.js';
import { kebab } from './names.js';

type Resolve = (specs: Record<string, OptionSpec>, flags: Record<string, unknown>) => Promise<Resolution>;

/** How each source reads to a person: `package` is a field in a file they know by name. */
const label = (source: string): string => (source === 'package' ? 'package.json' : source);
/** `file:line`, `file`, or nothing — where a person would look. */
function where(p: Provenance | undefined): string {
  if (p?.location === undefined) return '';
  return p.line === undefined ? p.location : `${p.location}:${String(p.line)}`;
}

/** A value as the table prints it: `—` for unset, a string as itself, anything else as JSON. */
function shown(value: unknown): string {
  if (value === undefined) return '—';
  return typeof value === 'string' ? value : JSON.stringify(value);
}

interface Row {
  option: string;
  value: unknown;
  source: string;
  location?: string;
}

export async function explainConfig(manifest: Manifest, argv: readonly string[], resolve: Resolve): Promise<string> {
  const json = argv.includes('--json');
  const at = argv.indexOf('--config');
  const flags: Record<string, unknown> = { ...(at === -1 ? {} : { config: argv[at + 1] }), ...(argv.includes('--no-config') ? { noConfig: true } : {}) };
  // Everything that is not a flag is the command path — except the value `--config` takes.
  const path = argv.filter((a, i) => !a.startsWith('--') && (at === -1 || i !== at + 1));
  const { node } = manifest.resolve([...path], manifest.rootPath);
  const specs = node?.options ?? {};
  const resolved = await resolve(specs, flags);
  const rows: Row[] = Object.keys(specs).map((name) => {
    const p = resolved.provenance[name];
    const location = where(p);
    return { option: `--${kebab(name)}`, value: resolved.values[name], source: p === undefined ? 'unset' : label(p.source), ...(location === '' ? {} : { location }) };
  });
  const precedence = ORDER.map(label);
  if (json) return `${JSON.stringify({ ok: true, data: { precedence, options: rows }, meta: {} })}\n`;
  const width = Math.max(0, ...rows.map((r) => r.option.length));
  const lines = rows.map((r) => `  ${r.option.padEnd(width)}  ${shown(r.value)}  (${r.source}${r.location === undefined ? '' : ` ${r.location}`})`);
  return `precedence: ${precedence.join(' > ')} — the first that sets a value wins\n${lines.length === 0 ? '  (this command takes no options)' : lines.join('\n')}\n`;
}
