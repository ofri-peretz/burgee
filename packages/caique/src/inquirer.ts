/**
 * `caique/inquirer` — `@inquirer/prompts` and `@inquirer/core`, over caique's own code and
 * nothing else.
 *
 * ## What this is, and what it is not
 *
 * It is the **drop-in subpath** for a CLI that renders its own prompts with `@inquirer/core`,
 * and for one that asks with `@inquirer/prompts`' `select`: change one import
 * and the same prompts, the same render functions, the same hooks and the same error classes
 * keep working. The other nine prompts of `@inquirer/prompts` are not here yet (see
 * `.sdlc/intents/inquirer-prompts-drop-in/spec.md`), so `burgee migrate` does not rewrite
 * that package. D-006 is the rule
 * it exists to satisfy — a compatibility claim is made at a dedicated subpath, never at a
 * package root, because a root presents the package's own API and can never match somebody
 * else's.
 *
 * It is **not** caique's own way of asking a question. That is `caique/ask` and
 * `caique/binding`: a prompt declared as a flag, answered from any source, and an error
 * naming the flag when nobody is there to type. Nothing in this file changes that, and a
 * program written against caique pays none of it.
 *
 * ## What grades it
 *
 * Two suites, each the incumbent's own and each run unedited through `compat-oracle`:
 * `@inquirer/core`'s `core.test.ts` grades the loop (`inquirer-core.ts` and the hooks), and
 * the ten prompt packages' suites grade the prompts, `usePagination` with `select`'s (the
 * `inquirer-prompts` row, `.sdlc/intents/inquirer-prompts-drop-in/`). Both render through
 * `@inquirer/testing`, a headless terminal, and assert the screen — so every frame here is the
 * incumbent's to the character. `@clack/prompts`' suite, by contrast, is 289 snapshots of its
 * own drawing, and caique declines to reproduce those on purpose (D-001).
 */
export { type Choice, type NormalizedChoice } from './inquirer-choices.js';
export { type CancelablePromise, type Context, createPrompt, type Prompt, Separator, useKeypress, usePrefix, type ViewFunction } from './inquirer-core.js';
export { AbortPromptError, CancelPromptError, ExitPromptError, HookError, ValidationError } from './inquirer-errors.js';
export { type SetState, useEffect, useMemo, useRef, useState } from './inquirer-hooks.js';
export {
  getDefaultKeybindings,
  isBackspaceKey,
  isDownKey,
  isEnterKey,
  isNumberKey,
  isShiftKey,
  isSpaceKey,
  isTabKey,
  isUpKey,
  type Keybinding,
  type KeypressEvent,
} from './inquirer-keys.js';
export { type PaginationLayout, type PaginationOptions, usePagination } from './inquirer-pagination.js';
export { select, type SelectConfig, type SelectTheme } from './inquirer-select.js';
export { defaultTheme, getDefaultTheme, makeTheme, type PartialTheme, type Status, type Theme } from './inquirer-theme.js';
