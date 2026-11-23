/**
 * Names derived from an operation id that must be stable across runs: a file name for `gen
 * markdown`, a tool name for `gen mcp`. Both shorten or collide sometimes, and both then carry a
 * short hash of the full id, so the same id gets the same name on every machine.
 */

/** FNV-1a's 32-bit offset basis and prime. */
const FNV_OFFSET = 0x81_1c_9d_c5;
const FNV_PRIME = 0x01_00_01_93;
/** Digits and lower-case letters: the shortest text a hash is printed in that is still a name. */
const RADIX = 36;
/** A file name's longest stem: well under every file system's 255, with room for `.md`. */
const MAX_FILE = 100;

/** FNV-1a, 32-bit, in base 36: short, stable, and dependency-free. Not for security. */
export const stableHash = (text: string): string => {
  let hash = FNV_OFFSET;
  for (const char of new TextEncoder().encode(text)) {
    hash ^= char;
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash.toString(RADIX);
};

/** `text` cut to `max` characters, with `_<hash>` of `full` in place of the tail when it was cut. */
export const fitted = (text: string, full: string, max: number): string => {
  if (text.length <= max) return text;
  const suffix = `_${stableHash(full)}`;
  return `${text.slice(0, max - suffix.length)}${suffix}`;
};

/**
 * Give each id its name; when two ids would share one (ignoring case), each of them carries its hash instead, so
 * neither name depends on which of the two came first.
 */
export const unique = (ids: readonly string[], nameOf: (id: string) => string, max: number): Map<string, string> => {
  const named = ids.map((id) => [id, nameOf(id)] as const);
  // Case-blind: `getPet.md` and `GetPet.md` are one file on macOS and Windows.
  const counts = new Map<string, number>();
  for (const [, name] of named) counts.set(name.toLowerCase(), (counts.get(name.toLowerCase()) ?? 0) + 1);
  return new Map(
    named.map(([id, name]) => {
      if (counts.get(name.toLowerCase()) === 1) return [id, name];
      const suffix = `_${stableHash(id)}`;
      return [id, `${name.slice(0, max - suffix.length)}${suffix}`];
    }),
  );
};

/** A file name for an operation id: letters, digits, `.`, `_` and `-`; anything else becomes `-`. */
export const fileSlug = (id: string): string => fitted(id.replaceAll(/[^\w.-]+/gu, '-').replaceAll(/^[-.]+|-+$/gu, '') || 'operation', id, MAX_FILE);
