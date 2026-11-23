/** Reading a parsed document without trusting its shape. */

export type Dict = Record<string, unknown>;

export const isDict = (value: unknown): value is Dict =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** A non-object reads as an object with no members. */
export const dict = (value: unknown): Dict => (isDict(value) ? value : {});

export const list = (value: unknown): readonly unknown[] => (Array.isArray(value) ? (value as unknown[]) : []);

/** The number of members of an object or array; nothing else has any. */
export const size = (value: unknown): number | undefined =>
  typeof value === 'object' && value !== null ? Object.keys(value).length : undefined;

export interface EntryOptions {
  readonly alphabetize?: boolean;
  readonly excludeDeprecated?: boolean;
}

/** An object's entries in document order, optionally sorted and with deprecated members dropped. */
export const entries = (value: unknown, options: EntryOptions = {}): [string, unknown][] => {
  let found = Object.entries(dict(value));
  if (options.alphabetize === true) {
    found.sort(([left], [right]) => left.localeCompare(right, 'en-us', { numeric: true }));
  }
  if (options.excludeDeprecated === true) {
    found = found.filter(([, member]) => !dict(member).deprecated);
  }
  return found;
};
