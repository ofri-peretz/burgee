/**
 * A flag's provenance, named as the caller typed it.
 *
 * seniority names a flag candidate after the key it resolved — `--${name}` — and burgee's keys
 * are camelCase, so `--dry-run` came back as `--dryRun`, a flag burgee refuses, in
 * `meta.provenance` and in `--explain`: the two places an agent reads to know what to type
 * (until 2026-09-30). This rewrites every flag candidate and every flag provenance to the
 * spelling on the command line — `--dry-run`, `-n`, `--no-color`, the last one typed winning
 * as its value does — or to the kebab-case flag when the option was not typed at all.
 *
 * A module of its own, loaded only under `--json` or `--explain`, because the engine's
 * startup path has a byte budget and neither of the other paths reads a location.
 */
import { explain } from 'seniority/explain';
import { type Resolution } from 'seniority/precedence';

import { type Discovery } from './config-layers.js';
import { type Token } from './execute.js';
import { camel, kebab } from './names.js';

const NO = 'no-';

/** Each option key the command line set, to the flag that set it, the last one typed winning. */
function spellings(specs: Record<string, { type?: string }>, tokens: readonly Token[]): Map<string, string> {
  const spelled = new Map<string, string>();
  for (const token of tokens) {
    if (token.kind !== 'option') continue;
    const bare = camel(token.name.slice(NO.length));
    // `--no-color` sets `color` when `color` is a boolean, exactly as `canonical` reads it.
    spelled.set(token.name.startsWith(NO) && specs[bare]?.type === 'boolean' ? bare : camel(token.name), token.rawName);
  }
  return spelled;
}

/**
 * commander-env K3 — when a config file won, where that file sat in the discovery order. The
 * order is `config-layers.js`'s, recorded on the run's `io` when `--explain` was asked.
 */
function discoveryLine(text: string, won: boolean, discovery: Discovery | undefined): string {
  if (!won) return text;
  // A value from a config file means a file was read, and `--explain` means the order was
  // recorded (`config-layers.ts`): both are there whenever a config value won.
  const { order, read } = discovery!;
  const at = order.findIndex((step) => step.path === read);
  // Under the explanation's own `candidates:` line, at its indent.
  const indent = /\n( *)/.exec(text)![1]!;
  return `${text}${indent}config file ${read!}: discovery candidate ${String(at + 1)} of ${String(order.length)} (${order[at]!.reason})\n`;
}

/** Rename the flag locations in place, then answer `--explain <asked>` when it was asked. */
// eslint-disable-next-line maintainability/max-parameters -- the fifth is the run's io, which carries the discovery order only `--explain` reads; a parameter costs the startup path's byte budget less than an options object at the call site.
export function asTyped(resolved: Resolution, specs: Record<string, { type?: string }>, tokens: readonly Token[], asked: unknown, io?: { cwd: string; discovery?: Discovery }): string | undefined {
  const spelled = spellings(specs, tokens);
  for (const [name, list] of Object.entries(resolved.candidates)) {
    const flag = spelled.get(name) ?? `--${kebab(name)}`;
    for (const candidate of list) if (candidate.source === 'flag') candidate.location = flag;
    const winner = resolved.provenance[name];
    if (winner?.source === 'flag') winner.location = flag;
  }
  return typeof asked === 'string' ? discoveryLine(explain(asked, resolved), resolved.provenance[asked]?.source === 'config', io?.discovery) : undefined;
}
