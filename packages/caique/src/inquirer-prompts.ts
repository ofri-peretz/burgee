/**
 * `caique/inquirer/prompts` — `@inquirer/prompts`' prompts, over `caique/inquirer`'s loop.
 *
 * A subpath of its own rather than more of `caique/inquirer`, so a program that renders its
 * own prompts with `@inquirer/core`'s hooks pays for none of these. Graded prompt by prompt
 * against `@inquirer/prompts`' own suites (`.sdlc/intents/inquirer-prompts-drop-in/`).
 */
export { Separator } from './inquirer.js';
export { checkbox, type CheckboxConfig, type CheckboxTheme } from './inquirer-checkbox.js';
export { type Choice, type NormalizedChoice } from './inquirer-choice.js';
export { editor, type EditorConfig, type EditorFileOptions, type EditorTheme } from './inquirer-editor.js';
export {
  confirm,
  type ConfirmConfig,
  type ConfirmTheme,
  input,
  type InputConfig,
  type InputTheme,
  number,
  type NumberConfig,
  password,
  type PasswordConfig,
  type PasswordTheme,
} from './inquirer-input.js';
export { expand, type ExpandChoice, type ExpandConfig, type ExpandKey, rawlist, type RawlistChoice, type RawlistConfig, type RawlistTheme } from './inquirer-keyed.js';
export { search, type SearchChoice, type SearchConfig, type SearchTheme } from './inquirer-search.js';
export { select, type SelectConfig, type SelectTheme } from './inquirer-select.js';
