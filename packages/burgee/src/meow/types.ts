/**
 * `burgee/meow` — the option and result shapes meow's callers write against.
 *
 * Kept beside the implementation rather than inside it because three files read them and a
 * façade's contract is the part most worth seeing on its own.
 *
 * Two layers. The **public** types are meow 14.1.0's own, name for name and parameter for
 * parameter — `Flag`, `AnyFlag`, `TypedFlags`, a generic `Options<Flags>` and `Result<Flags>`
 * — so `import meow, {type Result} from 'meow'` rewritten to `burgee/meow` type-checks the
 * same program, and `cli.flags.rainbow` is still a `boolean`. They are types only: the
 * entry's bundled bytes do not move. The **internal** `FlagSpec` and `Settings` are the loose
 * shapes the implementation reads, because it has to handle what JavaScript callers actually
 * pass — the deprecated `alias`, `booleanDefault: null`, `flags: null` — in order to refuse
 * it in meow's words.
 */

/** The type a flag's value is parsed to. */
export type FlagType = 'string' | 'boolean' | 'number';

/** Decides at run time whether a flag is required, from the other flags and the input. */
export type IsRequiredPredicate = (flags: Readonly<AnyFlags>, input: readonly string[]) => boolean;

/** One flag's declaration. */
export type Flag<PrimitiveType extends FlagType, Type, IsMultiple = false> = {
  readonly type?: PrimitiveType;
  readonly choices?: Type extends unknown[] ? Type : Type[];
  readonly default?: Type;
  readonly shortFlag?: string;
  readonly aliases?: string[];
  readonly isMultiple?: IsMultiple;
  readonly isRequired?: boolean | IsRequiredPredicate;
};

type StringFlag = Flag<'string', string> | Flag<'string', string[], true>;
type BooleanFlag = Flag<'boolean', boolean> | Flag<'boolean', boolean[], true>;
type NumberFlag = Flag<'number', number> | Flag<'number', number[], true>;

export type AnyFlag = StringFlag | BooleanFlag | NumberFlag;
export type AnyFlags = Record<string, AnyFlag>;

/** The type positional input is parsed to. */
export type InputOptionType = 'string' | 'boolean' | 'number' | 'array' | 'string-array' | 'boolean-array' | 'number-array';

export type InputOption = {
  readonly type?: InputOptionType;
  readonly isRequired?: boolean | ((input: readonly string[]) => boolean);
};

export type Options<Flags extends AnyFlags> = {
  readonly importMeta: ImportMeta;
  readonly flags?: Flags;
  readonly input?: InputOption | InputOptionType;
  readonly commands?: readonly string[];
  readonly description?: string | false;
  readonly help?: string | false;
  readonly version?: string;
  readonly autoHelp?: boolean;
  readonly autoVersion?: boolean;
  readonly pkg?: Record<string, unknown>;
  readonly argv?: readonly string[];
  readonly inferType?: boolean;
  readonly booleanDefault?: boolean | undefined;
  readonly allowUnknownFlags?: boolean;
  readonly helpIndent?: number;
};

type TypedFlag<F extends AnyFlag> = F extends { type: 'number' } ? number : F extends { type: 'string' } ? string : F extends { type: 'boolean' } ? boolean : unknown;

type PossiblyOptionalFlag<F extends AnyFlag, T> = F extends { isRequired: true } ? T : F extends { default: unknown } ? T : T | undefined;

/** Each declared flag's value type: required or defaulted flags are never `undefined`. */
export type TypedFlags<Flags extends AnyFlags> = {
  [F in keyof Flags]: Flags[F] extends { isMultiple: true } ? PossiblyOptionalFlag<Flags[F], Array<TypedFlag<Flags[F]>>> : PossiblyOptionalFlag<Flags[F], TypedFlag<Flags[F]>>;
};

/**
 * The `package.json` meow hands back. meow types it with type-fest's `PackageJson`, which this
 * package does not depend on; the fields a CLI reads off it are named, and the rest stay
 * reachable.
 */
export interface PackageJson {
  name?: string;
  version?: string;
  description?: string;
  bin?: string | Record<string, string>;
  [key: string]: unknown;
}

export type Result<Flags extends AnyFlags> = {
  input: string[];
  command?: string;
  /**
   * meow writes `CamelCasedProperties<TypedFlags<Flags>>`. Flag keys may not contain `-` —
   * meow refuses one — so a declared key is already its own camel case, and the mapping is
   * the identity for every declaration meow accepts.
   */
  flags: TypedFlags<Flags> & Record<string, unknown>;
  unnormalizedFlags: TypedFlags<Flags> & Record<string, unknown>;
  pkg: PackageJson;
  help: string;
  showHelp: (exitCode?: number) => never;
  showVersion: () => never;
};

/** What the implementation reads off one flag: meow's shape plus what meow refuses. */
export interface FlagSpec {
  readonly type?: FlagType;
  readonly alias?: string;
  readonly aliases?: readonly string[];
  readonly shortFlag?: string;
  readonly default?: unknown;
  // A method, so a caller's narrower predicate (meow's `IsRequiredPredicate`) is accepted here.
  isRequired?: boolean | { bivarianceHack(flags: Record<string, unknown>, input: string[]): boolean }['bivarianceHack'];
  readonly isMultiple?: boolean;
  readonly choices?: readonly unknown[];
}

/** What the implementation reads off the options object, as a JavaScript caller may pass it. */
export interface Settings {
  importMeta?: ImportMeta;
  argv?: readonly string[];
  description?: string | false;
  help?: string | false;
  version?: string | false;
  autoHelp?: boolean;
  autoVersion?: boolean;
  helpIndent?: number;
  flags?: Record<string, FlagSpec>;
  pkg?: Record<string, unknown>;
  input?: unknown;
  inferType?: boolean;
  booleanDefault?: boolean | null | undefined;
  allowUnknownFlags?: boolean;
  commands?: readonly string[];
}

/** An own property under a key the caller chose — never the prototype setter. */
export function own(target: Record<string, unknown>, key: string, value: unknown): void {
  Object.defineProperty(target, key, { value, writable: true, enumerable: true, configurable: true });
}
