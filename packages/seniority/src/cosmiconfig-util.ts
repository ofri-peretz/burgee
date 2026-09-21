/**
 * The pieces `cosmiconfig`'s own suite reaches for directly (R8).
 *
 * `decodeFileContent` and `getPropertyByPath` are `cosmiconfig/src/util`'s exports, and two of
 * its eleven test files import them by name — so they are part of the compatibility surface
 * whether or not a native caller would ever want them. Each is reproduced against the
 * published 10.0.1 behaviour rather than against a reading of the documentation, including
 * the parts that read like accidents: `getPropertyByPath` prefers a literal key containing
 * periods over the path it looks like, and `decodeFileContent` leaves a UTF-8 BOM in place.
 */

/** UTF-16LE and UTF-16BE byte-order marks, as the first two bytes of a file. */
const BOM_FF = 0xff;
const BOM_FE = 0xfe;
const FIRST = 0;
const SECOND = 1;

/**
 * A config file saved as UTF-16 — PowerShell's `Out-File` default on Windows — is not valid
 * UTF-8, and reading it as UTF-8 produces text no parser can use. A UTF-8 BOM is deliberately
 * left where it is: that is what 10.0.1 does, and one of its four cases asserts it.
 */
export function decodeFileContent(buffer: Buffer): string {
  if (buffer[FIRST] === BOM_FF && buffer[SECOND] === BOM_FE) return new TextDecoder('utf-16le').decode(buffer);
  if (buffer[FIRST] === BOM_FE && buffer[SECOND] === BOM_FF) return new TextDecoder('utf-16be').decode(buffer);
  return buffer.toString('utf-8');
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/**
 * A property name, or a period-delimited path, or an array of names.
 *
 * The literal key wins: `getPropertyByPath(source, 'ant.beetle.cootie')` returns
 * `source['ant.beetle.cootie']` when that key exists, and only otherwise splits on periods.
 * A name with a period *inside* a path can therefore only be expressed as an array, which is
 * what the array form is for.
 */
export function getPropertyByPath(source: unknown, path: string | readonly string[]): unknown {
  // eslint-disable-next-line conventions/consistent-existence-index-check -- `in` is a different function: it walks the prototype chain, so `getPropertyByPath(source, 'toString')` would answer with `Object.prototype.toString` for every object. cosmiconfig uses `Object.prototype.hasOwnProperty.call` here and the own-property question is the one being asked.
  if (typeof path === 'string' && isRecord(source) && Object.hasOwn(source, path)) return source[path];
  const parsed = typeof path === 'string' ? path.split('.') : path;
  return parsed.reduce<unknown>((previous, key) => (isRecord(previous) ? previous[key] : undefined), source);
}

/**
 * Get, or compute and store. The **promise** is what a cache holds for the async explorer, not
 * the awaited value — two concurrent searches of one directory share one walk rather than
 * racing, which is a semantic and not an optimisation.
 */
export function emplace<K, V>(map: Map<K, V>, key: K, fn: () => V): V {
  const cached = map.get(key);
  if (cached !== undefined) return cached;
  const result = fn();
  map.set(key, result);
  return result;
}

/** `{ stopDir: undefined }` must mean "not supplied", not "supplied as undefined" (cosmiconfig #317). */
export function removeUndefinedValuesFromObject<T extends object>(options: T): Partial<T> {
  return Object.fromEntries(Object.entries(options).filter(([, value]) => value !== undefined)) as Partial<T>;
}

const isPlainObject = (v: unknown): v is Record<string, unknown> => Object.prototype.toString.call(v) === '[object Object]';

/**
 * The three keys a merged config file must never be able to set.
 *
 * `__proto__` is the one that arrives: `JSON.parse` is the load path for a `.json` config and
 * is the one parser that puts a *real own property* of that name on the object, where an
 * object literal in source would have set the prototype instead. Assigning it back out
 * through `target[key] = …` goes through the setter and swaps the merged config's prototype,
 * so a file can make `config.isAdmin` answer for a key no file set. `constructor` is the
 * second route to the same place, and `prototype` matters the moment a merge target is a
 * function rather than a plain object.
 *
 * Spelled as three comparisons rather than a `Set.has`, because this is a guard a reader —
 * and a static analyser — should be able to see without following a binding. CodeQL's
 * `js/prototype-polluting-function` did not, and blocked a merge on it.
 */
const forbidden = (key: string): boolean => key === '__proto__' || key === 'constructor' || key === 'prototype';

function merge(target: Record<string, unknown>, source: Record<string, unknown>, mergeArrays: boolean): Record<string, unknown> {
  for (const key of Object.keys(source)) {
    if (forbidden(key)) continue;
    const incoming = source[key];
    const existing = target[key];
    // eslint-disable-next-line conventions/consistent-existence-index-check -- Own properties only, deliberately: `in` would report `toString` and `valueOf` as present on every target and merge a config's key into a prototype method. This is the function `__proto__` and `constructor` are already excluded from.
    if (Object.hasOwn(target, key) && Array.isArray(existing) && Array.isArray(incoming) && mergeArrays) {
      existing.push(...incoming);
      continue;
    }
    // eslint-disable-next-line conventions/consistent-existence-index-check -- as above
    if (Object.hasOwn(target, key) && isPlainObject(existing) && isPlainObject(incoming)) {
      target[key] = merge(existing, incoming, mergeArrays);
      continue;
    }
    target[key] = incoming;
  }
  return target;
}

/**
 * Left to right, later winning — the `$import` merge. Arrays concatenate or replace by
 * `mergeArrays`; plain objects merge recursively; everything else overwrites. Nothing is
 * cloned, because every object here was loaded fresh from a file a moment ago.
 */
export function mergeAll(objects: readonly unknown[], { mergeArrays }: { mergeArrays: boolean }): Record<string, unknown> {
  return objects.reduce<Record<string, unknown>>((target, source) => (isPlainObject(source) ? merge(target, source, mergeArrays) : target), {});
}
