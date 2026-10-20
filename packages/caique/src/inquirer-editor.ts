/**
 * `editor` — an answer written in the user's own editor, as `@inquirer/prompts` exports it.
 *
 * Enter (or the first render, with `waitForUserInput: false`) writes the current value to a
 * temporary file, opens `$VISUAL`, then `$EDITOR`, then the platform's editor on it, and
 * reads the file back when the editor exits. On Windows the editor is started through the
 * shell, so `code` resolves to `code.cmd` as it does through `@inquirer/external-editor`'s
 * own launch, with each argument quoted. The answer is validated like a typed one; a
 * failed validation keeps what was written for the next round, or restores the default
 * under `validationFailureMode: 'clear'`.
 *
 * **Not graded by its incumbent's suite, and why** (D-20261011-inquirer-prompts-editor-mock):
 * every case of `@inquirer/editor`'s suite drives the prompt through a mock of
 * `@inquirer/external-editor`, a package caique does not import. So the frames and the
 * validation round trip are held by `inquirer-editor.test.ts` instead, against the same
 * screens those cases assert.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { alwaysValid } from './inquirer-choices.js';
import { createPrompt, useKeypress, usePrefix } from './inquirer.js';
import { useEffect, useState, type PromptReadline } from './inquirer-hooks.js';
import { isEnterKey } from './inquirer-keys.js';
import { makeTheme, type PartialDeep, type Status, type Theme } from './inquirer-theme.js';
import { processFacts, processRuntime } from './runtime.js';

/** Where the temporary file goes and what it is called, as `@inquirer/external-editor` takes it. */
export interface EditorFileOptions {
  prefix?: string;
  postfix?: string;
  mode?: number;
  dir?: string;
}

/** What `editor` adds to the shared theme. */
export interface EditorTheme {
  validationFailureMode: 'keep' | 'clear';
  style: {
    loadingMessage: () => string;
    waitingMessage: (enterKey: string) => string;
  };
}

/** `editor`'s config, as the incumbent declares it. */
export interface EditorConfig {
  message: string;
  default?: string | undefined;
  postfix?: string;
  waitForUserInput?: boolean;
  validate?: (value: string) => boolean | string | Promise<string | boolean>;
  file?: EditorFileOptions;
  theme?: PartialDeep<Theme & EditorTheme>;
}

/**
 * The editor command, split into the program and its arguments: `code --wait` is `code` with
 * `--wait`. Quotes group words, so a path with a space can be named.
 */
export function editorCommand(env: Record<string, string | undefined>, platform: string): [string, ...string[]] {
  const configured = env['VISUAL'] || env['EDITOR'] || (platform === 'win32' ? 'notepad' : 'vim');
  const words = [...configured.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/gu)].map((match) => match[1] ?? match[2] ?? match[0]);
  return words.length === 0 ? [configured] : (words as [string, ...string[]]);
}

/**
 * Write `text` to a temporary file, edit it, and read it back. Rejects when the editor cannot
 * be started or exits with a failure, which the prompt shows as its error.
 */
export async function editAsync(text: string, { prefix = 'inquirer-editor-', postfix = '.txt', mode, dir }: EditorFileOptions = {}): Promise<string> {
  const folder = mkdtempSync(join(dir ?? tmpdir(), prefix));
  const file = join(folder, `answer${postfix}`);
  writeFileSync(file, text, mode === undefined ? {} : { mode });
  const { platform } = processFacts();
  const [bin, ...args] = editorCommand(processRuntime().env, platform);
  const windows = platform === 'win32';
  try {
    await new Promise<void>((resolve, reject) => {
      const argv = [...args, file].map((arg) => (windows ? `"${arg}"` : arg));
      const child = spawn(bin, argv, { stdio: 'inherit', shell: windows });
      child.once('error', reject);
      child.once('exit', (code, signal) => {
        if (code === 0) resolve();
        else reject(new Error(`${bin} exited with ${signal ?? String(code)}`));
      });
    });
    return readFileSync(file, 'utf8');
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

export const editor = createPrompt<string, EditorConfig>((config, done) => {
  const { waitForUserInput = true, file: { postfix = config.postfix ?? '.txt', ...fileOptions } = {}, validate = alwaysValid } = config;
  const theme = makeTheme<EditorTheme>(
    { validationFailureMode: 'keep', style: { loadingMessage: () => 'Validating...', waitingMessage: (enterKey: string) => `Press ${enterKey} to launch your preferred editor.` } },
    config.theme,
  );
  const [status, setStatus] = useState<Status>('idle');
  const [value = '', setValue] = useState<string | undefined>(config.default);
  const [errorMsg, setError] = useState<string>();
  const prefix = usePrefix({ status, theme });

  /** Validate what came back from the editor: answer with it, or keep it (or the default) for another round. */
  const settle = async (answer: string): Promise<void> => {
    setStatus('loading');
    const verdict = await validate(answer);
    if (verdict === true) {
      setError(undefined);
      setStatus('done');
      done(answer);
      return;
    }
    setValue(theme.validationFailureMode === 'clear' ? config.default : answer);
    setError(verdict || 'You must provide a valid value');
    setStatus('idle');
  };

  /**
   * One round in the editor: the keyboard goes to the editor until it exits. An editor that
   * cannot start, or a validator that throws, is shown as the prompt's error, and the user
   * may press Enter to try again.
   */
  const startEditor = (rl: PromptReadline): void => {
    rl.pause();
    editAsync(value, { postfix, ...fileOptions })
      .then(async (answer) => {
        rl.resume();
        await settle(answer);
      })
      .catch((error: unknown) => {
        rl.resume();
        setError(String(error));
      });
  };

  useEffect((rl) => {
    if (!waitForUserInput) startEditor(rl);
  }, []);

  useKeypress((key, rl) => {
    if (status === 'idle' && isEnterKey(key)) startEditor(rl);
  });

  const message = theme.style.message(config.message, status);
  let helpTip = '';
  if (status === 'loading') helpTip = theme.style.help(theme.style.loadingMessage());
  else if (status === 'idle') helpTip = theme.style.help(theme.style.waitingMessage(theme.style.key('enter')));
  return [[prefix, message, helpTip].filter(Boolean).join(' '), errorMsg ? theme.style.error(errorMsg) : ''];
});
