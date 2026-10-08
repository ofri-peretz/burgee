/**
 * The text surface for a result that is more than a string: its own chunk, imported by
 * `execute.ts` only when a command returns an object, a list or another non-string value (U5).
 * A command that prints for itself and returns nothing, or returns a string, never loads it.
 *
 * It moved out of `execute.ts` on 2026-10-08 (D-20261008-migrate-u12-findings), when
 * `burgee migrate` needed its report rendered as text: the engine's start-up path had 12 bytes
 * of its band to spare, and this is the half of the surface most runs never reach.
 */

/**
 * The key a result carries its own text under — a function returning what a person reads.
 *
 * A symbol, so `JSON.stringify` skips it and `--json`, `--json=<fields>`, `--format=agent` and
 * `--mcp` carry the data exactly as before. `burgee migrate` is the first to use it: its report
 * is a dozen nested lists, and one level of `key: value` printed each of them as a line of JSON.
 */
export const TEXT = Symbol.for('burgee.text');

/** A leaf renders as itself; anything deeper renders as compact JSON. */
function leaf(value: unknown): string {
  if (value === undefined || value === null) return '';
  return typeof value === 'string' ? value : JSON.stringify(value);
}

/**
 * The text surface. One level deep on purpose, and deliberately not recursive: a caller
 * who wants the whole structure asks for `--json`, which is the surface that promises it.
 * A result that says how it reads, under {@link TEXT}, is printed that way instead.
 */
export function render(value: unknown): string {
  if (Array.isArray(value)) return value.map((v) => leaf(v)).join('\n');
  if (typeof value === 'object' && value !== null) {
    const own = (value as Record<symbol, unknown>)[TEXT];
    if (typeof own === 'function') return String((own as () => unknown)());
    return Object.entries(value)
      .map(([k, v]) => `${k}: ${leaf(v)}`)
      .join('\n');
  }
  return String(value);
}
