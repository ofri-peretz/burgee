import { InvalidArgumentError } from './error.js';

export type ParseArg = (value: string, previous: unknown) => unknown;

export class Argument {
  description: string;
  variadic = false;
  parseArg: ParseArg | undefined = undefined;
  defaultValue: unknown = undefined;
  defaultValueDescription: string | undefined = undefined;
  argChoices: string[] | undefined = undefined;
  required: boolean;
  _name: string;

  /** `<required>`, `[optional]`, bare = required; a trailing `...` makes it variadic. */
  constructor(name: string, description?: string) {
    this.description = description || '';
    switch (name[0]) {
      case '<':
        this.required = true;
        this._name = name.slice(1, -1);
        break;
      case '[':
        this.required = false;
        this._name = name.slice(1, -1);
        break;
      default:
        this.required = true;
        this._name = name;
        break;
    }
    if (this._name.endsWith('...')) {
      this.variadic = true;
      this._name = this._name.slice(0, -3);
    }
  }

  name(): string {
    return this._name;
  }

  _collectValue(value: unknown, previous: unknown): unknown[] {
    if (previous === this.defaultValue || !Array.isArray(previous)) return [value];
    previous.push(value);
    return previous;
  }

  default(value: unknown, description?: string): this {
    this.defaultValue = value;
    this.defaultValueDescription = description;
    return this;
  }

  argParser(fn?: ParseArg): this {
    this.parseArg = fn;
    return this;
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

  argRequired(): this {
    this.required = true;
    return this;
  }

  argOptional(): this {
    this.required = false;
    return this;
  }
}

/** `<name>` / `[name]` / `<name...>` for usage strings. */
export function humanReadableArgName(arg: Argument): string {
  const nameOutput = arg.name() + (arg.variadic ? '...' : '');
  return arg.required ? `<${nameOutput}>` : `[${nameOutput}]`;
}
