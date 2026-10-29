/**
 * A-20261028-yargs-parse-callback-surfaces: burgee's reserved surfaces under yargs'
 * `.parse(argv, context, callback)`, the synchronous shape emmercm/igir uses, and `--json` on a
 * command with no handler under every shape.
 *
 * The callback form is yargs' contract for a program that owns its output and its exit: yargs
 * turns `exitProcess` off, hands the output to the callback, and the program reads the argv
 * `parse()` returns and goes on. A surface served there cannot end the program before the
 * program's own code runs, so burgee intercepts none of them: `--json`, `--schema`, `--mcp` and
 * `completion <shell>` are the program's arguments, refused or passed through exactly as yargs
 * would (D-20261029-yargs-parse-callback-not-intercepted). On `burgee@1.9.2` each was intercepted
 * instead: `--schema` skipped `.demandCommand()` and returned an argv the program then ran,
 * `--mcp` and `completion` handed the program a `Promise`, and `--json` swallowed the `.fail()`
 * that yargs would have thrown and returned `undefined`.
 *
 * A command with no handler does its work after `parse()` returns, so an envelope written at
 * the end of the parse claims a run that has not happened. On `burgee@1.9.2`
 * `copy --input x --json` printed `{"ok":true,"data":null,…}` and then the program ran, under
 * `.parseSync()` and the callback form alike. There `--json` is the program's argument too.
 *
 * The oracle is the installed yargs 18.2.0, the version `npm run compat` grades: each program
 * is written once and run twice, importing `yargs` and `burgee/yargs`, and the two must print
 * the same bytes and exit the same way. Each case is a child process running the built entry
 * through the package's exports map, which is the path a migrated program takes.
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

import { scratchDirs } from '../__fixtures__/scratch-dir.js';

const load = createRequire(fileURLToPath(new URL('../../package.json', import.meta.url)));
const ENTRIES = {
  yargs: JSON.stringify(import.meta.resolve('yargs')),
  burgee: JSON.stringify(pathToFileURL(load.resolve('burgee/yargs')).href),
};
const scratch = scratchDirs();

type Lib = keyof typeof ENTRIES;
/** `callback` is igir's `.parse(argv, {}, cb)`; `bare` is `.parse(argv, cb)`; the rest are yargs' other entries. */
type Ending = 'callback' | 'bare' | 'parseSync' | 'parse';

const ENDINGS: Record<Ending, string> = {
  callback: 'program.parse(args, {}, (err, parsed, output) => { if (output) console.log(output); })',
  bare: 'program.parse(args, (err, parsed, output) => { if (output) console.log(output); })',
  parseSync: 'program.parseSync(args)',
  parse: 'program.parse(args)',
};

/**
 * How strict a program is: `options` is igir's `.demandCommand()`, `.strictCommands()` and
 * `.strictOptions()`; `all` is `.demandCommand()` and `.strict()`; `none` is neither.
 */
type Strictness = 'options' | 'all' | 'none';
interface Shape {
  strictness?: Strictness;
  /** `copy` has a handler that does the work, rather than the work running after `parse()`. */
  handler?: boolean;
  /** A `.fail()` that throws, as igir's does; without it yargs prints the help and the message. */
  fail?: boolean;
}

const STRICTNESS: Record<Strictness, string> = {
  options: "  .demandCommand(1, 'You must specify at least one command').strictCommands(true).strictOptions(true)",
  all: "  .demandCommand(1, 'You must specify at least one command').strict()",
  none: '',
};

/** igir's shape, reduced: commands declared with a builder, and the work done after `parse()` returns. */
function program(lib: Lib, ending: Ending, { strictness = 'options', handler = false, fail = true }: Shape = {}): string {
  const file = join(scratch(`burgee-cb-${lib}-${ending}-`), 'prog.mjs');
  const work = handler ? ", (argv) => console.log('copied ' + String(argv.input))" : '';
  writeFileSync(
    file,
    [
      `import yargs from ${ENTRIES[lib]};`,
      'const args = process.argv.slice(2);',
      `const program = yargs().command('copy', 'copy files', (b) => b.option('input', { type: 'string', describe: 'from where' })${work})`,
      STRICTNESS[strictness],
      fail ? '  .fail((msg, err) => { if (err) throw err; throw new Error(msg); });' : '  ;',
      'try {',
      `  const argv = ${ENDINGS[ending]};`,
      "  console.log('after parse: ' + JSON.stringify({ _: argv._, input: argv.input, json: argv.json, schema: argv.schema, mcp: argv.mcp }));",
      "} catch (e) { console.error('failed: ' + e.message); process.exitCode = 1; }",
    ].join('\n'),
  );
  return file;
}

function run(file: string, args: string[]): { stdout: string; stderr: string; status: number | null } {
  const child = spawnSync(process.execPath, [file, ...args], { encoding: 'utf8', input: '' });
  return { stdout: child.stdout, stderr: child.stderr, status: child.status };
}

/** The same program on yargs and on burgee/yargs; burgee's run must be yargs' run, byte for byte. */
function againstYargs(ending: Ending, args: string[], shape: Shape = {}): { stdout: string; stderr: string; status: number | null } {
  const ours = run(program('burgee', ending, shape), args);
  expect(ours).toEqual(run(program('yargs', ending, shape), args));
  return ours;
}

const RESERVED = ['--json', 'copy --input x --json', '--schema', '--mcp', 'completion zsh'];

describe('the reserved surfaces under parse(argv, context, callback) (A-20261028-yargs-parse-callback-surfaces)', () => {
  it.each(RESERVED)('%s is refused as yargs refuses it, igir’s shape', (line) => {
    const { stdout, stderr, status } = againstYargs('callback', line.split(' '));
    expect(status).toBe(1);
    expect(stdout).not.toContain('"ok"');
    expect(stdout).not.toContain('after parse');
    expect(stderr).toMatch(/^failed: (You must specify at least one command|Unknown argument: json|Unknown commands: completion, zsh)\n$/);
  });

  it.each(RESERVED)('%s is the program’s argument on a loose program with a handler', (line) => {
    // Not intercepted: yargs parses it as any other flag or positional, and the program goes on.
    const { stdout, status } = againstYargs('callback', line.split(' '), { strictness: 'none', handler: true });
    expect(status).toBe(0);
    expect(stdout).toContain('after parse');
    expect(stdout).not.toContain('"ok"');
  });

  it.each(RESERVED)('%s under parse(argv, callback), with no context', (line) => {
    expect(againstYargs('bare', line.split(' ')).status).toBe(1);
  });
});

describe('a short-circuit parse is no surface either', () => {
  it('getCompletion() over a line that holds --schema completes it, as yargs does', () => {
    // yargs' completion parses the line with `parse(args, true)`, which serves nothing; only the
    // program's own parse may be a surface. Mutating `intercept` to ignore that left this alone.
    const completes = (lib: Lib): ReturnType<typeof run> => {
      const file = join(scratch(`burgee-cb-${lib}-complete-`), 'prog.mjs');
      writeFileSync(
        file,
        [
          `import yargs from ${ENTRIES[lib]};`,
          "const program = yargs().command('copy', 'copy files').option('input', { type: 'string' });",
          "console.log(JSON.stringify(await program.getCompletion(['--schema', '--'])));",
        ].join('\n'),
      );
      return run(file, []);
    };
    const ours = completes('burgee');
    expect(ours).toEqual(completes('yargs'));
    expect(ours.stdout).toContain('--input');
  });
});

describe('--json on a command with no handler (A-20261028-yargs-parse-callback-surfaces)', () => {
  const ENDS = ['parseSync', 'parse', 'callback'] as const;
  const COPY = ['copy', '--input', 'x', '--json'];

  it.each(ENDS.flatMap((ending) => (['options', 'all'] as const).map((strictness) => [ending, strictness] as const)))(
    'is refused as yargs refuses it, under %s() with %s strictness',
    (ending, strictness) => {
      const { stdout, stderr, status } = againstYargs(ending, COPY, { strictness });
      expect(status).toBe(1);
      expect(stdout).toBe('');
      expect(stderr).toBe('failed: Unknown argument: json\n');
    },
  );

  it('is refused with yargs’ help and message when the program has no .fail()', () => {
    const { stdout, stderr, status } = againstYargs('parseSync', COPY, { fail: false });
    expect(status).toBe(1);
    expect(stdout).toBe('');
    expect(stderr).toMatch(/--input +from where[^]*\n\nUnknown argument: json\n$/);
  });

  it.each(ENDS)('prints no envelope on a loose program, and sets argv.json as yargs does, under %s()', (ending) => {
    const { stdout, status } = againstYargs(ending, COPY, { strictness: 'none' });
    expect(status).toBe(0);
    expect(stdout).toBe('after parse: {"_":["copy"],"input":"x","json":true}\n');
  });

  it('leaves argv.json unset when the flag is not given', () => {
    expect(againstYargs('parseSync', ['copy', '--input', 'x'], { strictness: 'none' }).stdout).toBe('after parse: {"_":["copy"],"input":"x"}\n');
  });

  it('still wraps a command that has a handler in the envelope, under parseSync()', () => {
    const { stdout, status } = run(program('burgee', 'parseSync', { handler: true }), COPY);
    expect(status).toBe(0);
    const [copied, envelope, after] = stdout.trim().split('\n');
    expect(copied).toBe('copied x');
    expect(JSON.parse(envelope ?? '')).toMatchObject({ ok: true, data: null });
    expect(after).toBe('after parse: {"_":["copy"],"input":"x"}');
  });
});
