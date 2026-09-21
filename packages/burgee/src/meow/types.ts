/**
 * `burgee/meow` — the option and result shapes meow's callers write against.
 *
 * Kept beside the implementation rather than inside it because three files read them and a
 * façade's contract is the part most worth seeing on its own.
 */

export interface AnyFlag {
  type?: 'string' | 'boolean' | 'number';
  alias?: string;
  aliases?: string[];
  shortFlag?: string;
  default?: unknown;
  isRequired?: boolean | ((flags: Record<string, unknown>, input: string[]) => boolean);
  isMultiple?: boolean;
  choices?: unknown[];
}

export interface Options {
  importMeta?: ImportMeta;
  argv?: readonly string[];
  description?: string | false;
  help?: string | false;
  version?: string | false;
  autoHelp?: boolean;
  autoVersion?: boolean;
  helpIndent?: number;
  flags?: Record<string, AnyFlag>;
  pkg?: Record<string, unknown>;
  input?: unknown;
  inferType?: boolean;
  booleanDefault?: boolean | null | undefined;
  hardRejection?: boolean;
  allowUnknownFlags?: boolean;
  commands?: string[];
}

export interface Result {
  input: string[];
  flags: Record<string, unknown>;
  unnormalizedFlags: Record<string, unknown>;
  pkg: Record<string, unknown>;
  help: string;
  version: string;
  command?: string;
  showHelp: (code?: number) => never;
  showVersion: () => void;
}

/** An own property under a key the caller chose — never the prototype setter. */
export function own(target: Record<string, unknown>, key: string, value: unknown): void {
  Object.defineProperty(target, key, { value, writable: true, enumerable: true, configurable: true });
}
