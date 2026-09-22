/**
 * The plugin host for linegauge's half of the contract
 * (`plugin-contract` R1, R5a, R6, R7, R8).
 *
 * A plugin is one plain object shared by the whole family. This file keeps the key linegauge
 * understands — **`widths`** — and **ignores every other key without complaining**, which is
 * what makes the same object work on any subset of the family that is installed. A plugin
 * written for flagstaff registers here and contributes nothing; its `tokens`, `spinners` and
 * `components` are not linegauge's business and are not an error.
 *
 * ## Why this package had no plugin surface until now, and why the answer is `widths`
 *
 * linegauge was the ninth of nine and the only one without one, which
 * `scripts/extension-surface-lock.test.ts` has recorded as `plugin: false` since it was
 * written. The reason it stayed empty is worth stating: a width function is not obviously
 * extensible, and an extension point invented to fill a row in a table is worse than an empty
 * row. This one is not invented.
 *
 * **Ambiguous width is genuinely terminal-dependent and the package says so.** `width.ts`:
 * *"Ambiguous-width characters are counted narrow, which is what a terminal does unless it has
 * been told it is rendering an East Asian locale. `string-width` makes that an option; nothing
 * above this function has ever needed the other answer."* That covers the Unicode-sanctioned
 * ambiguity. It does not cover the rest of it — a terminal that renders a particular Private
 * Use glyph double-wide because a Nerd Font put a two-column icon there, a code point added by
 * a Unicode version newer than the table compiled into this release, a font that draws U+2500
 * box-drawing wide. Each of those is a real, reported, *local* disagreement, and the honest
 * shape for it is data the user supplies rather than a constant somebody argues about upstream.
 *
 * ## R7, and why this host is the easy case
 *
 * R7 asks that no key require a function. A `widthOverride` is `{ ranges, columns, why }` —
 * three fields of plain data — so a plugin can arrive as JSON, be diffed, be generated, and be
 * printed by `linegauge check` without anybody running its author's code. `closeout`'s
 * `handlers` owes R7 an exemption; `widths` owes it nothing.
 *
 * **`why` is required**, which no other `$def` in the family does. A width table with no
 * provenance is one nobody can audit when it turns out to be wrong, and *wrong* is the normal
 * outcome for ambiguous width: the answer differs per terminal, per font and per year. The
 * field costs a plugin author one sentence and saves the next reader the whole argument.
 *
 * Nothing here imports another layer, and the plugin shape is declared rather than imported
 * (R3).
 */
import { setClaim } from './width.js';

/**
 * One plugin-supplied width override: the column count a set of code-point ranges occupies.
 */
export interface WidthOverride {
  /** Inclusive `[low, high]` code-point pairs. */
  ranges: readonly (readonly [number, number])[];
  /** 0 for a zero-width mark, 1 narrow, 2 wide. */
  columns: number;
  /** Which terminal or font disagrees, and how it was measured. Required; see the file comment. */
  why: string;
}

/**
 * Registered overrides, flattened to one list of `[low, high, columns]` triples.
 *
 * Flattened at registration rather than at measurement: `measure` runs per grapheme cluster on
 * every line of every frame a spinner redraws, and walking a nested structure there would put
 * plugin bookkeeping on the hottest path in the package. Registration happens once.
 */
let flattened: number[] = [];
const byPlugin = new Map<string, Record<string, WidthOverride>>();

/** The last matching override for a code point, or `undefined` when no plugin claims it. */
function overridden(code: number): number | undefined {
  let found: number | undefined;
  for (let i = 0; i < flattened.length; i += 3) {
    if (code >= (flattened[i] as number) && code <= (flattened[i + 1] as number)) found = flattened[i + 2];
  }
  return found;
}

/**
 * Later registrations win, which is the point: the user is the authority on their terminal.
 *
 * An empty table **removes** the plugin rather than recording that it contributes nothing.
 * `overrides()` is what `linegauge check` prints and what a caller inspects, and a name in it
 * with no ranges under it reads as *this plugin is active* when the truth is the opposite.
 *
 * The seam in `width.ts` is installed only while something is registered, so the last plugin
 * leaving puts `measure` back on the path with no call in it at all.
 */
export function setOverrides(name: string, widths: Record<string, WidthOverride>): void {
  if (Object.keys(widths).length === 0) byPlugin.delete(name);
  else byPlugin.set(name, widths);
  const rows: number[] = [];
  for (const table of byPlugin.values()) {
    for (const { ranges, columns } of Object.values(table)) {
      for (const [low, high] of ranges) rows.push(low, high, columns);
    }
  }
  flattened = rows;
  setClaim(rows.length === 0 ? undefined : overridden);
}

/** Every override currently registered, by plugin name — what `linegauge check` prints. */
export function overrides(): ReadonlyMap<string, Record<string, WidthOverride>> {
  return byPlugin;
}

/**
 * The plugin contract version. One number for the family — the same `1` flagstaff, caique,
 * closeout and paratext declare, written out rather than imported for the reason above.
 */
export const CONTRACT = 1;

/**
 * The keys linegauge reads. Declared structurally: any object with these fields is a plugin
 * here, whatever else it carries.
 */
export interface Plugin {
  name: string;
  contract?: number;
  /** Width overrides by name. The key is the author's label; see {@link validate}. */
  widths?: Record<string, WidthOverride>;
}

/**
 * Two codes, both already in the family's vocabulary
 * (`scripts/plugin-error-vocabulary-lock.test.ts`).
 */
export type PluginErrorCode = 'E_PLUGIN_SCHEMA' | 'E_PLUGIN_CONTRACT';

/** A refused plugin says what is wrong and what to do about it — the family's one vocabulary. */
export class PluginError extends Error {
  constructor(
    readonly code: PluginErrorCode,
    message: string,
    readonly fix: string,
  ) {
    super(message);
    this.name = 'PluginError';
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

const MAX_CODE_POINT = 0x10_ff_ff;
const MAX_COLUMNS = 2;

/** One range, checked the way the schema declares it: `[low, high]`, both in range, low first. */
function rangeProblem(label: string, range: unknown): string | undefined {
  if (!Array.isArray(range) || range.length !== 2) return `${label} is not a [low, high] pair`;
  const [low, high] = range as unknown[];
  if (!Number.isInteger(low) || !Number.isInteger(high)) return `${label} has a non-integer bound`;
  const lo = low as number;
  const hi = high as number;
  if (lo < 0 || hi > MAX_CODE_POINT) return `${label} is outside U+0000..U+10FFFF`;
  // Caught rather than tolerated: a reversed pair matches nothing, so a plugin written this way
  // would register clean, contribute a rule, and silently never fire — which is the failure
  // that takes longest to find.
  if (lo > hi) return `${label} runs backwards: [${String(lo)}, ${String(hi)}]`;
  return undefined;
}

type Problem = { code: PluginErrorCode; line: string; fix: string };

/** The document's own two fields: a name, and a contract this host speaks. */
function headerProblems(plugin: Record<string, unknown>): Problem[] {
  const out: Problem[] = [];
  if (typeof plugin['name'] !== 'string' || plugin['name'] === '') {
    out.push({ code: 'E_PLUGIN_SCHEMA', line: 'a plugin needs a non-empty `name`', fix: 'add `name: "my-widths"` — it is what `linegauge check` and a later registration call it' });
  }
  const contract = plugin['contract'];
  if (contract !== undefined && contract !== CONTRACT) {
    out.push({
      code: 'E_PLUGIN_CONTRACT',
      line: `contract ${String(contract)} is not ${String(CONTRACT)}`,
      fix: `set \`contract: ${String(CONTRACT)}\`, or drop the field — the family is on one version`,
    });
  }
  return out;
}

/** One override: its ranges, its column count, and the provenance this host insists on. */
function overrideProblems(name: string, value: unknown): Problem[] {
  if (!isRecord(value)) return [{ code: 'E_PLUGIN_SCHEMA', line: `widths.${name} is not an object`, fix: 'each override is { ranges, columns, why }' }];
  const out: Problem[] = [];
  const ranges = value['ranges'];
  if (!Array.isArray(ranges) || ranges.length === 0) {
    out.push({ code: 'E_PLUGIN_SCHEMA', line: `widths.${name}.ranges is a non-empty array of [low, high] pairs`, fix: 'ranges: [[0xE000, 0xF8FF]]' });
  } else {
    for (const [i, range] of ranges.entries()) {
      const problem = rangeProblem(`widths.${name}.ranges[${String(i)}]`, range);
      if (problem !== undefined) out.push({ code: 'E_PLUGIN_SCHEMA', line: problem, fix: 'each range is [low, high], both integers in U+0000..U+10FFFF, low first' });
    }
  }
  const columns = value['columns'];
  if (!Number.isInteger(columns) || (columns as number) < 0 || (columns as number) > MAX_COLUMNS) {
    out.push({ code: 'E_PLUGIN_SCHEMA', line: `widths.${name}.columns is 0, 1 or 2`, fix: '0 for a zero-width mark, 1 narrow, 2 wide' });
  }
  if (typeof value['why'] !== 'string' || value['why'] === '') {
    out.push({
      code: 'E_PLUGIN_SCHEMA',
      line: `widths.${name}.why is required`,
      fix: 'say which terminal or font disagrees, and how you measured it — ambiguous width is wrong often enough that the next reader needs the provenance',
    });
  }
  return out;
}

/** Everything wrong with a plugin document, in the family's vocabulary. Empty means it registers. */
export function problems(plugin: unknown): Problem[] {
  if (!isRecord(plugin)) {
    return [{ code: 'E_PLUGIN_SCHEMA', line: 'a plugin is an object', fix: 'export default { name: "my-widths", widths: { … } }' }];
  }
  const out = headerProblems(plugin);
  const widths = plugin['widths'];
  if (widths === undefined) return out;
  if (!isRecord(widths)) {
    out.push({ code: 'E_PLUGIN_SCHEMA', line: '`widths` is an object keyed by name', fix: 'widths: { "nerd-font-icons": { ranges: [[0xE000, 0xF8FF]], columns: 2, why: "…" } }' });
    return out;
  }
  for (const [name, value] of Object.entries(widths)) out.push(...overrideProblems(name, value));
  return out;
}

/** Throws on the first problem, in the family's vocabulary. */
export function validate(plugin: unknown): asserts plugin is Plugin {
  const [first] = problems(plugin);
  if (first !== undefined) throw new PluginError(first.code, first.line, first.fix);
}

/**
 * Register a plugin's width overrides. Later registrations win over earlier ones, and over the
 * built-in tables — which is the point: the built-in answer is right for most terminals and the
 * user is the authority on theirs.
 */
export function register(plugin: unknown): void {
  validate(plugin);
  setOverrides(plugin.name, plugin.widths ?? {});
}

