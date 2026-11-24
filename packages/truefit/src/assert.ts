import { issues } from './issues.js';
import { type Issue, type Schema } from './schema.js';

/** What `assert` throws: a `TypeError` whose message is the first issue, carrying every one of them. */
interface Invalid extends TypeError {
  readonly issues: readonly Issue[];
}

/**
 * Throws unless `value` is what the schema describes. After it returns the value is typed, with no
 * new binding: this is `check` for code that has nothing to do on a no but stop.
 *
 * Like `check` it reads and never writes: no default is filled and nothing is coerced. `parse` is
 * for that.
 */
function assert<T>(schema: Schema<T, unknown>, value: unknown): asserts value is T {
  if (schema.check(schema, value)) return;
  const found = issues(schema, value);
  const [first] = found as [Issue, ...Issue[]];
  const more = found.length > 1 ? ` (and ${String(found.length - 1)} more: see \`issues\` on this error)` : '';
  const error: Invalid = Object.assign(new TypeError(`the value is not what the schema describes. At "${first.path}": ${first.message}${more}`), { issues: found });
  throw error;
}

export { assert, type Invalid };
