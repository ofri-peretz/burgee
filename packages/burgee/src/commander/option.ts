import { type ParseArg } from './argument.js';
import { InvalidArgumentError } from './error.js';

export class Option {
  flags: string;
  description: string;
  required: boolean;
  optional: boolean;
  variadic: boolean;
  mandatory = false;
  short: string | undefined;
  long: string | undefined;
  negate = false;
  defaultValue: unknown = undefined;
  defaultValueDescription: string | undefined = undefined;
  presetArg: unknown = undefined;
  envVar: string | undefined = undefined;
  parseArg: ParseArg | undefined = undefined;
  hidden = false;
  argChoices: string[] | undefined = undefined;
  conflictsWith: string[] = [];
  implied: Record<string, unknown> | undefined = undefined;
  helpGroupHeading: string | undefined = undefined;

  constructor(flags: string, description?: string) {
    this.flags = flags;
    this.description = description || '';
    this.required = flags.includes('<');
    this.optional = flags.includes('[');
    // `<value,...>` describes custom splitting of one argument, not a variadic option.
    this.variadic = /\w\.\.\.[>\]]$/.test(flags);
    const { shortFlag, longFlag } = splitOptionFlags(flags);
    this.short = shortFlag;
    this.long = longFlag;
    if (this.long) this.negate = this.long.startsWith('--no-');
  }

  default(value: unknown, description?: string): this {
    this.defaultValue = value;
    this.defaultValueDescription = description;
    return this;
  }

  /** Value used when the option appears without an option-argument. `parseArg` still runs. */
  preset(arg: unknown): this {
    this.presetArg = arg;
    return this;
  }

  conflicts(names: string | string[]): this {
    this.conflictsWith = this.conflictsWith.concat(names);
    return this;
  }

  /** Values implied for other options when this one is set and they are not. `parseArg` does not run on them. */
  implies(impliedOptionValues: string | Record<string, unknown>): this {
    const newImplied = typeof impliedOptionValues === 'string' ? { [impliedOptionValues]: true } : impliedOptionValues;
    this.implied = Object.assign(this.implied ?? {}, newImplied);
    return this;
  }

  env(name: string): this {
    this.envVar = name;
    return this;
  }

  argParser(fn?: ParseArg): this {
    this.parseArg = fn;
    return this;
  }

  makeOptionMandatory(mandatory = true): this {
    this.mandatory = !!mandatory;
    return this;
  }

  hideHelp(hide = true): this {
    this.hidden = !!hide;
    return this;
  }

  _collectValue(value: unknown, previous: unknown): unknown[] {
    if (previous === this.defaultValue || !Array.isArray(previous)) return [value];
    previous.push(value);
    return previous;
  }

  choices(values: readonly string[]): this {
    this.argChoices = values.slice();
    this.parseArg = (arg, previous) => {
      if (!this.argChoices?.includes(arg)) {
        throw new InvalidArgumentError(`Allowed choices are ${this.argChoices?.join(', ')}.`);
      }
      return this.variadic ? this._collectValue(arg, previous) : arg;
    };
    return this;
  }

  name(): string {
    if (this.long) return this.long.replace(/^--/, '');
    return (this.short ?? '').replace(/^-/, '');
  }

  /** camelCase key used on the options object; `--no-foo` shares `foo` with `--foo`. */
  attributeName(): string {
    return camelcase(this.negate ? this.name().replace(/^no-/, '') : this.name());
  }

  helpGroup(heading: string): this {
    this.helpGroupHeading = heading;
    return this;
  }

  is(arg: string): boolean {
    return this.short === arg || this.long === arg;
  }

  /** Options are one of boolean, negated, required-argument or optional-argument. */
  isBoolean(): boolean {
    return !this.required && !this.optional && !this.negate;
  }
}

/**
 * `--build` and `--no-build` share one value. This works out which of the pair a
 * value (probably) came from, so implied values are only applied for the right one.
 */
export class DualOptions {
  positiveOptions = new Map<string, Option>();
  negativeOptions = new Map<string, Option>();
  dualOptions = new Set<string>();

  constructor(options: Option[]) {
    for (const option of options) {
      (option.negate ? this.negativeOptions : this.positiveOptions).set(option.attributeName(), option);
    }
    for (const key of this.negativeOptions.keys()) {
      if (this.positiveOptions.has(key)) this.dualOptions.add(key);
    }
  }

  valueFromOption(value: unknown, option: Option): boolean {
    const optionKey = option.attributeName();
    if (!this.dualOptions.has(optionKey)) return true;
    const preset = this.negativeOptions.get(optionKey)?.presetArg;
    const negativeValue = preset !== undefined ? preset : false;
    return option.negate === (negativeValue === value);
  }
}

function camelcase(str: string): string {
  return str.split('-').reduce((acc, word) => acc + (word[0] ?? '').toUpperCase() + word.slice(1));
}

/** Split `'-m,--mixed <value>'` into its short and long flags, failing noisily on anything else. */
export function splitOptionFlags(flags: string): { shortFlag: string | undefined; longFlag: string | undefined } {
  let shortFlag: string | undefined;
  let longFlag: string | undefined;
  const shortFlagExp = /^-[^-]$/;
  const longFlagExp = /^--[^-]/;

  const flagParts = flags.split(/[ |,]+/).concat('guard');
  const head = (): string => flagParts[0] ?? '';
  if (shortFlagExp.test(head())) shortFlag = flagParts.shift();
  if (longFlagExp.test(head())) longFlag = flagParts.shift();
  // Long then short. Rarely used but fine.
  if (!shortFlag && shortFlagExp.test(head())) shortFlag = flagParts.shift();
  // Two long flags, like '--ws, --workspace': the supported way to have a shortish flag.
  if (!shortFlag && longFlagExp.test(head())) {
    shortFlag = longFlag;
    longFlag = flagParts.shift();
  }

  if (head().startsWith('-')) {
    const unsupportedFlag = head();
    const baseError = `option creation failed due to '${unsupportedFlag}' in option flags '${flags}'`;
    if (/^-[^-][^-]/.test(unsupportedFlag)) {
      throw new Error(
        `${baseError}
- a short flag is a single dash and a single character
  - either use a single dash and a single character (for a short flag)
  - or use a double dash for a long option (and can have two, like '--ws, --workspace')`,
      );
    }
    if (shortFlagExp.test(unsupportedFlag)) throw new Error(`${baseError}\n- too many short flags`);
    if (longFlagExp.test(unsupportedFlag)) throw new Error(`${baseError}\n- too many long flags`);
    throw new Error(`${baseError}\n- unrecognised flag format`);
  }
  if (shortFlag === undefined && longFlag === undefined) {
    throw new Error(`option creation failed due to no flags found in '${flags}'.`);
  }
  return { shortFlag, longFlag };
}
