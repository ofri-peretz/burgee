/**
 * The choice types `select` and `checkbox` declare, alone in a module of types so that a
 * program's declarations reach these and not the helpers in `inquirer-choices.ts`.
 */
import { type Separator } from './inquirer.js';

/** A choice as a caller may write it. */
export interface Choice<Value> {
  value: Value;
  name?: string;
  checkedName?: string;
  description?: string;
  short?: string;
  disabled?: boolean | string;
  checked?: boolean;
  type?: never;
}

/** A choice once the prompt has filled in every field. */
export interface NormalizedChoice<Value> {
  value: Value;
  name: string;
  checkedName: string;
  description?: string;
  short: string;
  disabled: boolean | string;
  checked: boolean;
}

/** One row of a list prompt. */
export type Item<Value> = NormalizedChoice<Value> | Separator;
