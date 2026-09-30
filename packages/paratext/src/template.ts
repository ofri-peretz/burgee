/**
 * The three-rule template language a capability is written in.
 *
 * A capability has to be **data** — PRINCIPLES rule 7, and its measured bar is that an agent
 * given the schema and one example produces a passing plugin in one turn. A function cannot
 * travel through JSON, so `encode` and `fallback` are strings, and this is what they mean:
 *
 *   `{field}`        the field's value, empty when absent
 *   `{field|base64}` the value, base64-encoded — OSC 52 needs it and nothing else can do it
 *   `[ … {a} … ]`    emitted only when every field named inside it is present
 *
 * That last rule is what lets `notify` say `{title}[: {body}]` and print `Done: 3 files` or
 * `Done` without a branch, and `image` add `[;width={width}]` only when asked. Three rules is
 * the whole language; anything needing more is a field the caller should have computed.
 */
import { type Fields } from './capability.js';

const FIELD = /\{([a-zA-Z][a-zA-Z0-9]*)(\|base64)?\}/g;
const OPTIONAL = /\[([^[\]]*)\]/g;
const CACHED = 255;

/** Every field a template reads, so `check` can say what a capability needs. */
export function fieldsUsed(template: string): string[] {
  const names = new Set<string>();
  // The name group is not optional, so every match carries one.
  for (const [, name] of template.matchAll(FIELD)) names.add(name as string);
  return [...names].toSorted();
}

/**
 * A resolved template split at its fields, once: `split` with the capturing `FIELD` gives
 * `[text, name, encoding, text, …, text]`, the tokens `replaceAll` visited in its order, so a
 * render is one walk rather than two regex passes per call (~1 µs a link before this, B5).
 * Bounded, because `render` is public and a caller may render templates it builds itself.
 */
const split = new Map<string, string[]>();

/**
 * Render a template against a caller's fields.
 *
 * Optional groups resolve first, and a group survives only if **every** field inside it has a
 * value — an empty string counts as absent, because `Done: ` with nothing after the colon is
 * worse output than `Done`.
 */
export function render(template: string, fields: Fields): string {
  const resolved = template.includes('[') ? template.replaceAll(OPTIONAL, (_match, group: string) => (fieldsUsed(group).every((name) => (fields[name] ?? '') !== '') ? group : '')) : template;
  if (split.size > CACHED) split.clear();
  const parts = split.get(resolved) ?? (split.set(resolved, resolved.split(FIELD)).get(resolved) as string[]);
  let out = parts[0] as string;
  for (let i = 1; i < parts.length; i += 3) {
    const value = fields[parts[i] as string] ?? '';
    out += (parts[i + 1] ? Buffer.from(value, 'utf8').toString('base64') : value) + (parts[i + 2] as string);
  }
  return out;
}
