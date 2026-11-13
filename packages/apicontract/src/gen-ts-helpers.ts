/** The helper types the generated file declares for itself, as TypeScript's printer lays them out. */
import { type HelperStatement, type Statement } from './gen-ts-ast.js';

const helper = (name: string, text: string): HelperStatement => ({ kind: 'helper', name, text });

export const WITH_REQUIRED = helper(
  'WithRequired',
  `type WithRequired<T, K extends keyof T> = T & {
    [P in K]-?: T[P];
};`,
);

export const FLATTENED_DEEP_REQUIRED = helper(
  'FlattenedDeepRequired',
  `type FlattenedDeepRequired<T> = {
    [K in keyof T]-?: FlattenedDeepRequired<T[K] extends unknown[] | undefined | null ? Extract<T[K], unknown[]>[number] : T[K]>;
};`,
);

export const READONLY_ARRAY = helper(
  'ReadonlyArray',
  `type ReadonlyArray<T> = [
    Exclude<T, undefined>
] extends [
    unknown[]
] ? Readonly<Exclude<T, undefined>> : Readonly<Exclude<T, undefined>[]>;`,
);

export const READ_WRITE_MARKERS = helper(
  '$Read',
  `export type $Read<T> = {
    readonly $read: T;
};
export type $Write<T> = {
    readonly $write: T;
};
export type Readable<T> = T extends $Write<any> ? never : T extends $Read<infer U> ? Readable<U> : T extends (infer E)[] ? Readable<E>[] : T extends object ? {
    [K in keyof T as NonNullable<T[K]> extends $Write<any> ? never : K]: Readable<T[K]>;
} : T;
export type Writable<T> = T extends $Read<any> ? never : T extends $Write<infer U> ? Writable<U> : T extends (infer E)[] ? Writable<E>[] : T extends object ? {
    [K in keyof T as NonNullable<T[K]> extends $Read<any> ? never : K]: Writable<T[K]>;
} & {
    [K in keyof T as NonNullable<T[K]> extends $Read<any> ? K : never]?: never;
} : T;`,
);

/** Declare a helper at the end of the file, once. */
export const requireHelper = (footer: Statement[], wanted: HelperStatement): void => {
  if (!footer.includes(wanted)) footer.push(wanted);
};
