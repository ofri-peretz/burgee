/**
 * What every list prompt in `caique/clack` shares: how an option is labelled and marked, how
 * the cursor steps past a disabled one, and how the list is windowed against the terminal
 * through `limitOptions`.
 */
import { type CommonOptions, formatInstructionFooter, guided, paint, S_CHECKBOX_ACTIVE, S_CHECKBOX_INACTIVE, S_CHECKBOX_SELECTED, S_RADIO_ACTIVE, S_RADIO_INACTIVE } from './clack-core.js';
import { limitOptions } from './clack-limit.js';

/** Anything with a value, a label and a disabled flag: every kind of option a list draws. */
export interface Choice {
  value: unknown;
  label?: string | undefined;
  hint?: string | undefined;
  disabled?: boolean | undefined;
}

export const labelOf = (option: Choice): string => option.label ?? String(option.value);

const hintOf = (option: Choice): string => (option.hint === undefined || option.hint === '' ? '' : ` ${paint('dim', `(${option.hint})`)}`);

/** Style every line of a label, so a multi-line label keeps its colour past the first break. */
const lines = (text: string, format: Parameters<typeof paint>[0]): string =>
  text
    .split('\n')
    .map((line) => paint(format, line))
    .join('\n');

/** `at` wrapped into `[0, length)`: past the end is the start, before the start is the end. */
export function wrapIndex(at: number, length: number): number {
  if (at < 0) return Math.max(length - 1, 0);
  if (at > length - 1) return 0;
  return at;
}

/** The next enabled option from `from` in direction `step`, wrapping at both ends. */
export function findCursor(from: number, step: number, options: readonly Choice[]): number {
  if (!options.some((option) => option.disabled !== true)) return from;
  const next = wrapIndex(from + step, options.length);
  return options[next]?.disabled === true ? findCursor(next, Math.sign(step), options) : next;
}

const STEPS = new Map<string | undefined, number>([
  ['up', -1],
  ['left', -1],
  ['down', 1],
  ['right', 1],
]);

/** Up and left move back, down and right move forward, anything else stays. */
export const stepOf = (action: string | undefined): number => STEPS.get(action) ?? 0;

/** The instruction footer, or the plain closing guide when a caller turned instructions off. */
export const footerOf = (opts: CommonOptions & { showInstructions?: boolean }, instructions: string[]): string[] | undefined =>
  (opts.showInstructions ?? true) ? formatInstructionFooter(instructions, guided(opts)) : undefined;

/** The columns a guide takes on every line: the bar and two spaces. */
const GUIDE_COLUMNS = 3;

/** A list to window: the prompt's options, where the cursor is, how one is drawn, and the rows the footer takes. */
export interface Window<T> {
  opts: CommonOptions & { message: string; maxItems?: number | undefined };
  options: T[];
  cursor: number;
  style: (option: T, active: boolean) => string;
  footer: number;
}

/**
 * A window of a list, measured against the terminal: the title and the footer take their
 * rows first, and the bar takes its three columns.
 */
export function windowOf<T>({ opts, options, cursor, style, footer }: Window<T>): string[] {
  const guide = guided(opts);
  const reserved = opts.message.split('\n').length + (guide ? 1 : 0) + footer + 1;
  const output = opts.output === undefined ? {} : { output: opts.output };
  return limitOptions({ ...output, options, cursor, maxItems: opts.maxItems, columnPadding: guide ? GUIDE_COLUMNS : 0, rowPadding: reserved, style });
}

/** How a radio option is drawn: under the cursor, away from it, or out of reach. */
export type RadioLook = 'active' | 'inactive' | 'disabled';

export function radio(option: Choice, look: RadioLook): string {
  const label = labelOf(option);
  if (look === 'disabled') return `${paint('gray', S_RADIO_INACTIVE)} ${lines(label, 'gray')}${hintOf(option)}`;
  if (look === 'active') return `${paint('green', S_RADIO_ACTIVE)} ${label}${hintOf(option)}`;
  return `${paint('dim', S_RADIO_INACTIVE)} ${lines(label, 'dim')}`;
}

/** The look of an option in a single-choice list. */
export const radioLook = (option: Choice, active: boolean): RadioLook => {
  if (option.disabled === true) return 'disabled';
  return active ? 'active' : 'inactive';
};

/** How a checkbox option is drawn, by whether the cursor is on it and whether it is chosen. */
export type BoxLook = 'active' | 'inactive' | 'disabled' | 'selected' | 'active-selected';

const BOXES: Record<BoxLook, (option: Choice, label: string) => string> = {
  disabled: (option, label) => `${paint('gray', S_CHECKBOX_INACTIVE)} ${lines(label, ['strikethrough', 'gray'])}${hintOf(option)}`,
  active: (option, label) => `${paint('cyan', S_CHECKBOX_ACTIVE)} ${label}${hintOf(option)}`,
  selected: (option, label) => `${paint('green', S_CHECKBOX_SELECTED)} ${lines(label, 'dim')}${hintOf(option)}`,
  'active-selected': (option, label) => `${paint('green', S_CHECKBOX_SELECTED)} ${label}${hintOf(option)}`,
  inactive: (_option, label) => `${paint('dim', S_CHECKBOX_INACTIVE)} ${lines(label, 'dim')}`,
};

export const checkbox = (option: Choice, look: BoxLook): string => BOXES[look](option, labelOf(option));

/** The look of an option in a multiple-choice list. */
export function boxLook(option: Choice, active: boolean, chosen: readonly unknown[]): BoxLook {
  if (option.disabled === true) return 'disabled';
  const selected = chosen.includes(option.value);
  if (selected) return active ? 'active-selected' : 'selected';
  return active ? 'active' : 'inactive';
}

/** What clack says when a required multi-selection is submitted empty. */
export const REQUIRED = `Please select at least one option.\n${paint(['reset', 'dim'], `Press ${paint(['gray', 'bgWhite', 'inverse'], ' space ')} to select, ${paint(['gray', 'bgWhite', 'inverse'], ' enter ')} to submit`)}`;

/** The validator a `required` multi-selection gets: an empty answer is the one problem. */
export const requiredCheck =
  <T>(required: boolean) =>
  (value: T[] | undefined): string | undefined =>
    required && (value === undefined || value.length === 0) ? REQUIRED : undefined;

/** The labels of the chosen options, in list order: what a multi-selection shows once answered. */
export const summaryOf = (options: readonly Choice[], chosen: readonly unknown[], empty: string): string =>
  options
    .filter((option) => chosen.includes(option.value))
    .map(labelOf)
    .join(', ') || empty;

/** A value added to a selection, or taken out of it if it was already there. */
export const toggled = <T>(chosen: readonly T[], value: T): T[] => (chosen.includes(value) ? chosen.filter((v) => v !== value) : [...chosen, value]);
