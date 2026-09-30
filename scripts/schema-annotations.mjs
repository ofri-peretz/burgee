/**
 * The annotation keywords a validator never reads — `description`, `title`, `$comment` (strings)
 * and `examples` (an array) — removed from a schema, recursively.
 *
 * For the runtime *fragments* only (`schema-sync.mjs`): a host imports its fragment to validate,
 * so every sentence of prose in it rides in that host's users' bundles, and validation reads none
 * of it. The published `schema.json` keeps every word — it is the contract a plugin author reads.
 * Only a keyword with a keyword's value is removed, so a *property* named `description` (whose
 * value is a schema object) stays. Shared with `plugin-schema-lock.test.ts`, so the fragment and
 * the lock that holds it agree on what was removed.
 */
const STRING_ANNOTATIONS = new Set(['description', 'title', '$comment']);

/** `JSON.stringify`'s replacer does the walk, so there is no recursion of ours to bound. */
export const withoutAnnotations = (value) =>
  JSON.parse(JSON.stringify(value, (key, v) => ((STRING_ANNOTATIONS.has(key) && typeof v === 'string') || (key === 'examples' && Array.isArray(v)) ? undefined : v)));
