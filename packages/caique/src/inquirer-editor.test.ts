/**
 * `editor`, in this process — and the only grade it has (D-20261011-inquirer-prompts-editor-mock).
 *
 * `@inquirer/editor`'s suite answers every case through a mock of `@inquirer/external-editor`,
 * which caique does not import, so its eleven cases are excluded from the oracle's row for
 * both sides. These cases cover the same ground with a real editor: `$EDITOR` is pointed at a
 * small node program that edits the file it is handed, so the whole round trip — temporary
 * file, spawn, read back, validate — runs as it does for a person.
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { stripVTControlCharacters } from 'node:util';

import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

import { render } from './__fixtures__/inquirer-render.js';
import { editAsync, editorCommand } from './inquirer-editor.js';
import { editor } from './inquirer-prompts.js';

const scratch = mkdtempSync(join(tmpdir(), 'caique-editor-test-'));

/** An editor that appends `EDIT_APPEND` to the file it is given, or exits with `EDIT_EXIT`. */
const program = join(scratch, 'edit.mjs');
writeFileSync(
  program,
  [
    "import { appendFileSync } from 'node:fs';",
    'const file = process.argv.at(-1);',
    "if (process.env.EDIT_RECORD) appendFileSync(process.env.EDIT_RECORD, `${file}\\n`);",
    "if (process.env.EDIT_EXIT) process.exit(Number(process.env.EDIT_EXIT));",
    "if (process.env.EDIT_KILL) process.kill(process.pid, 'SIGTERM');",
    "appendFileSync(file, process.env.EDIT_APPEND ?? '');",
  ].join('\n'),
);
const EDITOR = `"${process.execPath}" "${program}"`;

afterEach(() => {
  vi.unstubAllEnvs();
});

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

const frame = (...lines: string[]): string => lines.join('\n');

/** Point the editor at the test program, recording each file it is handed; returns the files read so far. */
function recording(append: string): () => string[] {
  const record = join(mkdtempSync(join(scratch, 'record-')), 'files.txt');
  vi.stubEnv('VISUAL', '');
  vi.stubEnv('EDITOR', EDITOR);
  vi.stubEnv('EDIT_APPEND', append);
  vi.stubEnv('EDIT_RECORD', record);
  return () => (existsSync(record) ? readFileSync(record, 'utf8').split('\n').filter(Boolean) : []);
}

/** The folder a file was written in, and its own name: what `prefix` and `postfix` decide. */
const named = (file: string): { folder: string; name: string } => ({ folder: basename(dirname(file)), name: basename(file) });

describe('editorCommand', () => {
  it('prefers VISUAL to EDITOR, and falls back to the platform editor', () => {
    expect(editorCommand({ VISUAL: 'code --wait', EDITOR: 'nano' }, 'linux')).toEqual(['code', '--wait']);
    expect(editorCommand({ EDITOR: 'nano' }, 'linux')).toEqual(['nano']);
    expect(editorCommand({}, 'linux')).toEqual(['vim']);
    expect(editorCommand({}, 'win32')).toEqual(['notepad']);
  });

  it('groups quoted words, single or double, and keeps an editor made of spaces whole', () => {
    expect(editorCommand({ EDITOR: `"/Applications/My Editor" --flag 'two words'` }, 'darwin')).toEqual(['/Applications/My Editor', '--flag', 'two words']);
    expect(editorCommand({ EDITOR: '   ' }, 'linux')).toEqual(['   ']);
  });
});

describe('editAsync', () => {
  it('hands the editor a temporary file holding the text, reads it back, and removes it', async () => {
    vi.stubEnv('VISUAL', '');
    vi.stubEnv('EDITOR', EDITOR);
    vi.stubEnv('EDIT_APPEND', ' world');
    const dir = mkdtempSync(join(scratch, 'files-'));
    await expect(editAsync('hello', { dir, prefix: 'p-', postfix: '.md', mode: 0o600 })).resolves.toBe('hello world');
    expect(readdirSync(dir)).toEqual([]);
    await expect(editAsync('plain')).resolves.toBe('plain world');
  });

  it('names the folder inquirer-editor-… and the file answer.txt when no option says otherwise', async () => {
    const files = recording('');
    await expect(editAsync('a')).resolves.toBe('a');
    const [file = ''] = files();
    expect(named(file).folder).toMatch(/^inquirer-editor-.+/u);
    expect(named(file).name).toBe('answer.txt');
  });

  it('rejects when the editor fails, by its exit code or its signal, or cannot start', async () => {
    vi.stubEnv('VISUAL', '');
    vi.stubEnv('EDITOR', EDITOR);
    vi.stubEnv('EDIT_EXIT', '3');
    await expect(editAsync('x')).rejects.toThrow(/exited with 3/u);
    vi.stubEnv('EDIT_EXIT', '');
    vi.stubEnv('EDIT_KILL', '1');
    await expect(editAsync('x')).rejects.toThrow(/exited with SIGTERM/u);
    vi.stubEnv('EDITOR', join(scratch, 'no-such-editor'));
    await expect(editAsync('x')).rejects.toThrow(/ENOENT/u);
  });

  it('writes the file with the mode it is given', async () => {
    vi.stubEnv('VISUAL', '');
    vi.stubEnv('EDITOR', `"${process.execPath}" -e "require('fs').writeFileSync(process.argv.at(-1), String(require('fs').statSync(process.argv.at(-1)).mode & 0o777))"`);
    if (process.platform === 'win32') return;
    await expect(editAsync('', { mode: 0o600 })).resolves.toBe(String(0o600));
    expect(statSync(scratch).isDirectory()).toBe(true);
  });
});

describe('editor', () => {
  it('names the file by `postfix` or `file.postfix`, `.txt` by default, and passes the other file options on', async () => {
    const files = recording('');
    for (const config of [{ message: 'A' }, { message: 'B', postfix: '.md' }, { message: 'C', postfix: '.md', file: { postfix: '.yaml', prefix: 'mine-' } }]) {
      const { answer, events } = await render(editor, config);
      events.keypress('enter');
      await answer;
    }
    expect(files().map((file) => named(file))).toEqual([
      { folder: expect.stringMatching(/^inquirer-editor-/u), name: 'answer.txt' },
      { folder: expect.stringMatching(/^inquirer-editor-/u), name: 'answer.md' },
      { folder: expect.stringMatching(/^mine-/u), name: 'answer.yaml' },
    ]);
  });

  it('gives the editor the keyboard while it is open, takes it back after, and opens it on Enter only', async () => {
    const files = recording('!');
    // Read when the answer is validated: after the editor exits, before the prompt closes (which pauses it for good).
    let pausedWhileValidating: boolean | undefined;
    let paused = (): boolean => false;
    const validate = (): true => {
      pausedWhileValidating = paused();
      return true;
    };
    const { answer, events, isPaused } = await render(editor, { message: 'Notes', validate });
    paused = isPaused;
    events.keypress('a');
    expect(isPaused()).toBe(false);
    expect(files()).toEqual([]);
    events.keypress('enter');
    expect(isPaused()).toBe(true);
    await expect(answer).resolves.toBe('!');
    expect(pausedWhileValidating).toBe(false);
  });

  it('takes the keyboard back when the editor fails, too', async () => {
    recording('');
    vi.stubEnv('EDIT_EXIT', '4');
    const { events, getScreen, isPaused } = await render(editor, { message: 'Notes' });
    events.keypress('enter');
    expect(isPaused()).toBe(true);
    await vi.waitFor(() => {
      expect(getScreen()).toContain('exited with 4');
    });
    expect(isPaused()).toBe(false);
  });

  it('clears a refusal from the last frame once an answer is accepted', async () => {
    recording('z');
    const validate = vi.fn((value: string) => value === 'zz' || 'once more');
    const { answer, events, getScreen } = await render(editor, { message: 'Notes', validate });
    events.keypress('enter');
    await vi.waitFor(() => {
      expect(getScreen()).toContain('> once more');
    });
    events.keypress('enter');
    await expect(answer).resolves.toBe('zz');
    expect(getScreen()).toBe('✔ Notes');
  });

  it('draws no empty part: with no prefix the line starts at the message', async () => {
    recording('');
    const { getScreen } = await render(editor, { message: 'Notes', theme: { prefix: '' } });
    expect(stripVTControlCharacters(getScreen({ raw: true })).split('\n')[0]).toBe('Notes Press <enter> to launch your preferred editor.');
  });

  it('waits for Enter, opens the editor on the default, and answers with what it wrote', async () => {
    vi.stubEnv('VISUAL', '');
    vi.stubEnv('EDITOR', EDITOR);
    vi.stubEnv('EDIT_APPEND', '!');
    const { answer, events, getScreen } = await render(editor, { message: 'Notes', default: 'hi' });
    expect(getScreen()).toBe('? Notes Press <enter> to launch your preferred editor.');
    events.keypress('enter');
    await expect(answer).resolves.toBe('hi!');
    expect(getScreen()).toBe('✔ Notes');
  });

  it('opens at once without waiting, and ignores keys while the editor is open', async () => {
    vi.stubEnv('VISUAL', '');
    vi.stubEnv('EDITOR', EDITOR);
    vi.stubEnv('EDIT_APPEND', 'now');
    const { answer, events } = await render(editor, { message: 'Notes', waitForUserInput: false, postfix: '.md' });
    events.keypress('a');
    await expect(answer).resolves.toBe('now');
  });

  it('keeps what was written after a refusal, shows the loading message while it validates', async () => {
    vi.stubEnv('VISUAL', '');
    vi.stubEnv('EDITOR', EDITOR);
    vi.stubEnv('EDIT_APPEND', 'x');
    let release!: (verdict: boolean | string) => void;
    const validate = vi.fn(async (value: string) => (value === 'xx' ? true : new Promise<boolean | string>((resolve) => (release = resolve))));
    const { answer, events, getScreen } = await render(editor, { message: 'Notes', validate, file: { postfix: '.txt' } });
    events.keypress('enter');
    await vi.waitFor(() => {
      expect(getScreen()).toBe('? Notes Validating...');
    });
    release('again');
    await vi.waitFor(() => {
      expect(getScreen()).toBe(frame('? Notes Press <enter> to launch your preferred editor.', '> again'));
    });
    events.keypress('enter');
    await expect(answer).resolves.toBe('xx');
  });

  it('goes back to the default after a refusal under validationFailureMode: clear, with a default message for false', async () => {
    vi.stubEnv('VISUAL', '');
    vi.stubEnv('EDITOR', EDITOR);
    vi.stubEnv('EDIT_APPEND', 'y');
    const validate = vi.fn((value: string) => value === 'dy' && validate.mock.calls.length > 1);
    const { answer, events, getScreen } = await render(editor, { message: 'Notes', default: 'd', validate, theme: { validationFailureMode: 'clear' } });
    events.keypress('enter');
    await vi.waitFor(() => {
      expect(getScreen()).toContain('> You must provide a valid value');
    });
    events.keypress('enter');
    await expect(answer).resolves.toBe('dy');
  });

  it('shows an editor that fails as the error, and can be tried again', async () => {
    vi.stubEnv('VISUAL', '');
    vi.stubEnv('EDITOR', EDITOR);
    vi.stubEnv('EDIT_EXIT', '2');
    const { answer, events, getScreen } = await render(editor, { message: 'Notes', theme: { style: { waitingMessage: () => 'go' } } });
    events.keypress('enter');
    await vi.waitFor(() => {
      expect(getScreen()).toMatch(/^\? Notes go\n> Error: .* exited with 2$/u);
    });
    vi.stubEnv('EDIT_EXIT', '');
    events.keypress('enter');
    await expect(answer).resolves.toBe('');
  });
});
