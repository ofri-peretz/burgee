/**
 * `explain`'s size cap (apicontract-agents R3): a JSON value made to fit a byte budget by emptying
 * its deepest objects and arrays first, each cut recorded as a JSON Pointer.
 *
 * Deepest first because the top of an operation (its id, its payload names, which payload is
 * required) is what an agent needs to call it, and the bottom (the fifth level of a nested schema)
 * is what it can do without. A cut empties a container in place: an object becomes `{}`, which a
 * JSON Schema reads as "anything", and an array becomes `[]`, so the result still parses and keeps
 * its shape. Every cut makes the text at least one byte shorter, so the walk ends.
 *
 * Bytes are UTF-8 bytes of the compact `JSON.stringify` text: what a caller's context pays for.
 */

export interface Capped {
  readonly value: unknown;
  /**
   * The pointers emptied, in the order they were cut (deepest first, then document order). A cut
   * that a later cut of an enclosing container swallowed is dropped, so no pointer is under another.
   */
  readonly cut: readonly string[];
}

/** UTF-8 bytes of a value's compact JSON text. */
export const bytesOf = (value: unknown): number => new TextEncoder().encode(JSON.stringify(value)).length;

const isContainer = (value: unknown): value is Record<string, unknown> | unknown[] => typeof value === 'object' && value !== null;

const token = (key: string): string => key.replaceAll('~', '~0').replaceAll('/', '~1');

interface Slot {
  readonly holder: Record<string, unknown> | unknown[];
  readonly key: string;
  readonly pointer: string;
  readonly depth: number;
}

/** Every container at `slot` and under it, in document order. */
const slots = (slot: Slot): Slot[] => {
  const value = (slot.holder as Record<string, unknown>)[slot.key];
  // Stryker disable next-line ArrayDeclaration: equivalent, a non-slot has no `depth` and the `keep` filter drops it
  if (!isContainer(value)) return [];
  const children = Object.keys(value).map((key) => slots({ holder: value, key, pointer: `${slot.pointer}/${token(key)}`, depth: slot.depth + 1 }));
  return [slot, ...children.flat()];
};

const isEmpty = (value: Record<string, unknown> | unknown[]): boolean => Object.keys(value).length === 0;

/**
 * `value`, cut until its JSON text is at most `max` bytes, or until nothing is left to cut. The
 * input is never changed. Idempotent: a result that fits is returned as it is, and one that could
 * not be made to fit has nothing left to cut. Containers shallower than `keep` (the root is depth
 * 0) are never cut: what names the thing stays when everything under it goes.
 */
export const cap = (value: unknown, max: number, keep = 0): Capped => {
  let size = bytesOf(value);
  if (size <= max) return { value, cut: [] };
  const root = { value: structuredClone(value) };
  // Deepest first; `toSorted` is stable, so equal depths keep document order.
  const order = slots({ holder: root, key: 'value', pointer: '', depth: 0 })
    .filter((slot) => slot.depth >= keep)
    .toSorted((a, b) => b.depth - a.depth);
  const cut: string[] = [];
  for (const slot of order) {
    if (size <= max) break;
    const node = (slot.holder as Record<string, Record<string, unknown> | unknown[]>)[slot.key] as Record<string, unknown> | unknown[];
    if (isEmpty(node)) continue;
    const emptied = Array.isArray(node) ? [] : {};
    size -= bytesOf(node) - bytesOf(emptied);
    // Defined, not assigned: a JSON key may be `__proto__`, and an assignment would set the prototype.
    Object.defineProperty(slot.holder, slot.key, { value: emptied, enumerable: true });
    // A cut inside this one is now part of it: the record names the outermost cut only.
    for (let at = cut.length - 1; at >= 0; at--) if ((cut[at] as string).startsWith(`${slot.pointer}/`)) cut.splice(at, 1);
    cut.push(slot.pointer);
  }
  return { value: root.value, cut };
};
