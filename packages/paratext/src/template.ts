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

/** Every field a template reads, so `check` can say what a capability needs. */
export function fieldsUsed(template: string): string[] {
  const names = new Set<string>();
  for (const [, name] of template.matchAll(FIELD)) if (name !== undefined) names.add(name);
  return [...names].toSorted();
}

const substitute = (template: string, fields: Fields): string =>
  template.replaceAll(FIELD, (_match, name: string, encoding?: string) => {
    const value = fields[name] ?? '';
    return encoding === '|base64' ? Buffer.from(value, 'utf8').toString('base64') : value;
  });

/**
 * Render a template against a caller's fields.
 *
 * Optional groups resolve first, and a group survives only if **every** field inside it has a
 * value — an empty string counts as absent, because `Done: ` with nothing after the colon is
 * worse output than `Done`.
 */
export function render(template: string, fields: Fields): string {
  const resolved = template.replaceAll(OPTIONAL, (_match, group: string) =>
    fieldsUsed(group).every((name) => (fields[name] ?? '') !== '') ? group : '',
  );
  return substitute(resolved, fields);
}
