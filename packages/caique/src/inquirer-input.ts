/**
 * `input`, `number` and `password` — the three prompts that read a line, as
 * `@inquirer/prompts` exports them.
 *
 * Each is graded by its own package's suite. They share one shape, which is why they share a
 * file: readline owns the line and its editing, every key that is not Enter copies
 * `rl.line` into state, and Enter validates. readline clears its line on Enter, so a failed
 * validation writes the typed text back into readline — the user corrects the answer rather
 * than typing it again — unless the theme asks for `validationFailureMode: 'clear'`.
 *
 * `input` and `number` show a default dimmed beside the message: Tab copies it into the line
 * to edit, Backspace on an empty line drops it, and `prefill: 'editable'` starts with it
 * already in the line. `password` shows `[input is masked]`, or one mask character per
 * typed one, and Ctrl+T reveals it while the prompt is open.
 */
import { styleText } from 'node:util';

import { HIDE_CURSOR } from 'closeout/cursor';

import { alwaysValid, keysHelpTip } from './inquirer-choices.js';
import { createPrompt, useKeypress, usePrefix } from './inquirer.js';
import { type PromptReadline, useEffect, useState } from './inquirer-hooks.js';
import { isBackspaceKey, isEnterKey, isTabKey } from './inquirer-keys.js';
import { makeTheme, type PartialDeep, type Status, type Theme } from './inquirer-theme.js';

/** What a validator may answer: valid, invalid with the message to show, or a promise of either. */
type Verdict = boolean | string | Promise<string | boolean>;

/** What `input` adds to the shared theme. */
export interface InputTheme {
  validationFailureMode: 'keep' | 'clear';
}

/** `input`'s config, as the incumbent declares it. */
export interface InputConfig {
  message: string;
  default?: string | undefined;
  prefill?: 'tab' | 'editable';
  required?: boolean;
  transformer?: (value: string, flags: { isFinal: boolean }) => string;
  validate?: (value: string) => Verdict;
  theme?: PartialDeep<Theme & InputTheme>;
  pattern?: RegExp;
  patternError?: string;
}

/** The message line every line prompt draws: prefix, message, the dimmed default, the value. */
const line = (parts: readonly (string | undefined)[]): string => parts.filter((part) => part !== undefined).join(' ');

export const input = createPrompt<string, InputConfig>((config, done) => {
  const theme = makeTheme<InputTheme>({ validationFailureMode: 'keep' }, config.theme);
  const [status, setStatus] = useState<Status>('idle');
  // `String()`, because a caller without types passes a number and the incumbent shows it.
  const [defaultValue, setDefaultValue] = useState<string>(String(config.default ?? ''));
  const [errorMsg, setError] = useState<string>();
  const [value, setValue] = useState<string>('');
  const prefix = usePrefix({ status, theme });

  const check = async (answer: string): Promise<true | string> => {
    const { required, pattern, patternError = 'Invalid input' } = config;
    if (required && !answer) return 'You must provide a value';
    if (pattern && !pattern.test(answer)) return patternError;
    if (typeof config.validate === 'function') return (await config.validate(answer)) || 'You must provide a valid value';
    return true;
  };

  useKeypress(async (key, rl) => {
    // A validation in flight owns the prompt; keys typed meanwhile are not answers.
    if (status !== 'idle') return;
    if (isEnterKey(key)) {
      const answer = value || defaultValue;
      setStatus('loading');
      const verdict = await check(answer);
      if (verdict === true) {
        setValue(answer);
        setStatus('done');
        done(answer);
        return;
      }
      if (theme.validationFailureMode === 'keep') rl.write(value);
      else setValue('');
      setError(verdict);
      setStatus('idle');
    } else if (isBackspaceKey(key) && !value) {
      setDefaultValue('');
    } else if (isTabKey(key) && !value) {
      setDefaultValue('');
      // The Tab itself landed in the line; it is not part of the answer.
      rl.clearLine(0);
      rl.write(defaultValue);
      setValue(defaultValue);
    } else {
      setValue(rl.line);
      setError(undefined);
    }
  });

  useEffect(
    (rl) => {
      // `prefill: 'tab'`, the default, leaves the line empty; an empty default writes nothing either way.
      if (config.prefill === 'editable') {
        rl.write(defaultValue);
        setValue(defaultValue);
      }
    },
    // Stryker disable next-line ArrayDeclaration: any constant list runs the effect once, on the first render, which is all this asks of it
    [],
  );

  const message = theme.style.message(config.message, status);
  let shown = value;
  if (typeof config.transformer === 'function') shown = config.transformer(value, { isFinal: status === 'done' });
  else if (status === 'done') shown = theme.style.answer(value);
  // Never at `done`: the answer is the value then, so `!value` already rules it out.
  const hint = defaultValue && !value ? theme.style.defaultAnswer(defaultValue) : undefined;
  return [line([prefix, message, hint, shown]), errorMsg ? theme.style.error(errorMsg) : ''];
});

/** `number`'s config, as the incumbent declares it. */
export interface NumberConfig<Required extends boolean = boolean> {
  message: string;
  default?: number | undefined;
  min?: number;
  max?: number;
  step?: number | 'any';
  required?: Required;
  validate?: (value: Required extends true ? number : number | undefined) => Verdict;
  theme?: PartialDeep<Theme>;
}

/** A finite number as an integer significand and a power of ten, so steps compare exactly. */
function decimal(value: number): { significand: bigint; exponent: number } {
  // `Number#toString` writes a lowercase `e`, and only for an exponent; a finite number always has a whole part.
  const [coefficient, exponent] = value.toString().split('e') as [string, string?];
  const [whole, fraction = ''] = coefficient.split('.') as [string, string?];
  return { significand: BigInt(`${whole}${fraction}`), exponent: Number(exponent ?? 0) - fraction.length };
}

/**
 * Whether `value` is `min` plus a whole number of `step`s, in decimal rather than in binary
 * floating point — `0.3` is a step of `0.1` from `0` here, as a person means it.
 */
export function isStepOf(value: number, step: number, min: number): boolean {
  if (!Number.isFinite(value) || !Number.isFinite(step) || step === 0) return false;
  const parts = [decimal(value), decimal(step), ...(Number.isFinite(min) ? [decimal(min)] : [])];
  const scale = Math.min(...parts.map((part) => part.exponent));
  const TEN = 10n;
  const scaled = ({ significand, exponent }: { significand: bigint; exponent: number }): bigint => significand * TEN ** BigInt(exponent - scale);
  const [v, s, m] = parts.map(scaled) as [bigint, bigint, bigint | undefined];
  return (v - (m ?? 0n)) % s === 0n;
}

function checkNumber(value: number | undefined, { min, max, step }: { min: number; max: number; step: number | 'any' }): boolean | string {
  if (value == null || Number.isNaN(value)) return false;
  if (value < min || value > max) return `Value must be between ${min} and ${max}`;
  if (step !== 'any' && !isStepOf(value, step, min)) return `Value must be a multiple of ${step}${Number.isFinite(min) ? ` starting from ${min}` : ''}`;
  return true;
}

export const number = createPrompt(<Required extends boolean>(config: NumberConfig<Required>, done: (value: Required extends true ? number : number | undefined) => void) => {
  const { validate = alwaysValid, min = -Infinity, max = Infinity, step = 1, required = false } = config;
  const theme = makeTheme(config.theme);
  const [status, setStatus] = useState<Status>('idle');
  // Held as the string typed, and read as a number on Enter.
  const [value, setValue] = useState<string>('');
  // A default the bounds reject is no default at all.
  const usableDefault = checkNumber(config.default, { min, max, step }) === true ? String(config.default) : undefined;
  const [defaultValue = '', setDefaultValue] = useState<string | undefined>(usableDefault);
  const [errorMsg, setError] = useState<string>();
  const prefix = usePrefix({ status, theme });

  /** Enter: the typed number, or the default; the bounds and the step, then `validate`. */
  const submit = async (rl: PromptReadline): Promise<void> => {
    const typed = value || defaultValue;
    const answer = typed === '' ? undefined : Number(typed);
    setStatus('loading');
    // An empty answer is a valid one unless `required` says otherwise.
    let verdict: string | boolean = required || answer != null ? checkNumber(answer, { min, max, step }) : true;
    if (verdict === true && answer != null) verdict = await validate(answer);
    if (verdict === true) {
      setValue(String(answer ?? ''));
      setStatus('done');
      done(answer as Required extends true ? number : number | undefined);
      return;
    }
    rl.write(value);
    setError(verdict || 'You must provide a valid numeric value');
    setStatus('idle');
  };

  useKeypress(async (key, rl) => {
    if (status !== 'idle') return;
    if (isEnterKey(key)) await submit(rl);
    else if (isBackspaceKey(key) && !value) setDefaultValue(undefined);
    else if (isTabKey(key) && !value) {
      setDefaultValue(undefined);
      rl.clearLine(0);
      rl.write(defaultValue);
      setValue(defaultValue);
    } else {
      setValue(rl.line);
      setError(undefined);
    }
  });

  const message = theme.style.message(config.message, status);
  const shown = status === 'done' ? theme.style.answer(value) : value;
  // Never at `done`: an answer from the default is the value then, and an empty one has no default.
  const hint = defaultValue && !value ? theme.style.defaultAnswer(defaultValue) : undefined;
  return [line([prefix, message, hint, shown]), errorMsg ? theme.style.error(errorMsg) : ''];
});

/** What `password` adds to the shared theme. */
export interface PasswordTheme {
  style: {
    maskedText: string;
    keysHelpTip: (keys: [key: string, action: string][]) => string | undefined;
  };
}

/** `password`'s config, as the incumbent declares it. */
export interface PasswordConfig {
  message: string;
  mask?: boolean | string;
  toggleMask?: boolean;
  validate?: (value: string) => Verdict;
  theme?: PartialDeep<Theme & PasswordTheme>;
}

export const password = createPrompt<string, PasswordConfig>((config, done) => {
  const { toggleMask = true, validate = alwaysValid } = config;
  const theme = makeTheme<PasswordTheme>({ style: { maskedText: '[input is masked]', keysHelpTip } }, config.theme);
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setError] = useState<string>();
  const [value, setValue] = useState<string>('');
  const [revealed, setRevealed] = useState(false);
  const prefix = usePrefix({ status, theme });

  useKeypress(async (key, rl) => {
    if (status !== 'idle') return;
    if (isEnterKey(key)) {
      setStatus('loading');
      const verdict = await validate(value);
      if (verdict === true) {
        setStatus('done');
        done(value);
        return;
      }
      rl.write(value);
      setError(verdict || 'You must provide a valid value');
      setStatus('idle');
    } else if (toggleMask && key.ctrl === true && key.name === 't') {
      setRevealed((shown) => !shown);
    } else {
      setValue(rl.line);
      setError(undefined);
    }
  });

  const message = theme.style.message(config.message, status);
  let shown = '';
  if (toggleMask && revealed && status === 'idle') shown = value;
  else if (config.mask) shown = (typeof config.mask === 'string' ? config.mask : '*').repeat(value.length);
  else if (status !== 'done') shown = theme.style.help(theme.style.maskedText);
  // With no mask the cursor would sit after `[input is masked]` and say how long the secret is.
  if (status === 'done') shown = theme.style.answer(shown);
  else if (!config.mask) shown += HIDE_CURSOR;

  const bottom = [errorMsg ? theme.style.error(errorMsg) : '', toggleMask && status === 'idle' ? theme.style.keysHelpTip([['ctrl+t', 'toggle visibility']]) : ''].filter(Boolean).join('\n');
  return [[prefix, message, shown].filter(Boolean).join(' '), bottom];
});

/** What `confirm` adds to the shared theme. */
export interface ConfirmTheme {
  /** The words that answer yes and no, matched by prefix; `y`, `n`, `yes` and `no` always work too. */
  keywords: { yes: string; no: string; error: (keywords: { yes: string; no: string }) => string };
  /** How the default's letter is drawn in the `Y/n` hint. */
  style: { confirmDefault: (text: string) => string };
}

const confirmTheme: ConfirmTheme = {
  keywords: { yes: 'Yes', no: 'No', error: ({ yes, no }) => `You must answer with "${yes}" or "${no}"` },
  style: {
    // Uppercase where the script has case; a colour where it has none (Chinese, Japanese).
    confirmDefault: (text: string) => {
      const first = text[0] ?? '';
      return first.toLowerCase() === first.toUpperCase() ? styleText('cyan', text) : first.toUpperCase() + text.slice(1);
    },
  },
};

/** `confirm`'s config, as the incumbent declares it. */
export interface ConfirmConfig {
  message: string;
  default?: boolean | undefined;
  transformer?: (value: boolean) => string;
  theme?: PartialDeep<Theme & ConfirmTheme>;
}

export const confirm = createPrompt<boolean, ConfirmConfig>((config, done) => {
  const [status, setStatus] = useState<Status>('idle');
  const [value, setValue] = useState('');
  const [errorMsg, setError] = useState<string>();
  const theme = makeTheme<ConfirmTheme>(confirmTheme, config.theme);
  const prefix = usePrefix({ status, theme });

  const { yes, no } = theme.keywords;
  const yesKey = (yes[0] ?? '').toLowerCase();
  const noKey = (no[0] ?? '').toLowerCase();
  const hint = config.default === false ? `${yesKey}/${theme.style.confirmDefault(noKey)}` : `${theme.style.confirmDefault(yesKey)}/${noKey}`;
  const word = (answer: boolean): string => (answer ? yes : no);
  const { transformer = word } = config;

  /** The answer `typed` gives, or `undefined` when it gives none. Empty is the default. */
  const answerOf = (typed: string): boolean | undefined => {
    const v = typed.trim().toLowerCase();
    if (v === '') return config.default !== false;
    if (yes.toLowerCase().startsWith(v)) return true;
    if (no.toLowerCase().startsWith(v)) return false;
    if ('yes'.startsWith(v)) return true;
    if ('no'.startsWith(v)) return false;
    return undefined;
  };

  // No `status` guard, unlike the three prompts above: nothing here is awaited, so the handler
  // is unregistered in the same turn that answers, and no key can arrive while it is not idle.
  useKeypress((key, rl) => {
    if (isEnterKey(key)) {
      const answer = answerOf(value);
      if (answer === undefined) {
        // An answer nobody can read is refused, not quietly taken as the default.
        rl.write(value);
        setError(theme.keywords.error({ yes, no }));
        return;
      }
      setValue(transformer(answer));
      setStatus('done');
      done(answer);
    } else if (isTabKey(key)) {
      const flipped = word(!(answerOf(value) ?? config.default !== false));
      rl.clearLine(0);
      rl.write(flipped);
      setValue(flipped);
    } else {
      setValue(rl.line);
      setError(undefined);
    }
  });

  const message = theme.style.message(config.message, status);
  const shown = status === 'done' ? theme.style.answer(value) : value;
  const defaultHint = status === 'done' ? '' : ` ${theme.style.defaultAnswer(hint)}`;
  return [`${prefix} ${message}${defaultHint} ${shown}`, errorMsg ? theme.style.error(errorMsg) : ''];
});
