/**
 * G5/G6 — the §10 parsing edges, each cited to the upstream issue it answers. These are
 * the cases commander and yargs have left open for years; we are not bound to their
 * existing behaviour, so we can be right on day one and prove it.
 */
import { describe, expect, it } from 'vitest';

import { defineCommand, defineProgram, ExitCode } from './index.js';
import { runBurgee } from './testing.js';

const program = defineProgram({
  name: 'app',
  commands: [
    defineCommand({ name: 'cat', run: ({ positionals }) => ({ files: positionals }) }),
    defineCommand({
      name: 'run',
      options: { detach: { type: 'boolean' } },
      run: ({ options, positionals, passthrough }) => ({ detach: options['detach'] === true, image: positionals[0], passthrough }),
    }),
    defineCommand({ name: 'deploy', run: () => 'deployed' }),
    defineCommand({
      name: 'greet',
      options: { name: { type: 'string' } },
      run: ({ options, positionals }) => ({ name: options['name'], positionals }),
    }),
    defineCommand({ name: 'bail', options: { code: { type: 'string' } }, run: ({ options, exit }) => exit(Number(options['code'])) }),
  ],
});

// `--json` goes right after the command: anything after `--` is pass-through, including
// a `--json`, which is exactly the property under test.
const run = ([cmd = '', ...rest]: string[]) => runBurgee(program, { argv: [cmd, '--json', ...rest] });

describe('§10 parsing edges, by upstream issue', () => {
  it('yargs #1312 — a lone dash is a positional (stdin by convention), never an error', async () => {
    const r = await run(['cat', '-']);
    expect(r.code).toBe(ExitCode.OK);
    expect(r.json).toMatchObject({ data: { files: ['-'] } });
  });

  it('commander #2530, yargs #1527 — `--` ends options and everything after it survives verbatim', async () => {
    const r = await run(['run', 'img', '--', 'cmd', '--flag', '-']);
    expect(r.json).toMatchObject({ data: { image: 'img', passthrough: ['cmd', '--flag', '-'] } });
  });

  it('yargs #1821, #2423 — docker-run style: options, a positional, then a pass-through tail', async () => {
    const r = await run(['run', '--detach', 'img', '--', 'sh', '-c', 'echo hi']);
    expect(r.json).toMatchObject({ data: { detach: true, image: 'img', passthrough: ['sh', '-c', 'echo hi'] } });
  });

  it('citty #41, #253 — a later token equal to a command name is a positional, not a command', async () => {
    const r = await run(['greet', 'deploy']);
    expect(r.code).toBe(ExitCode.OK);
    expect(r.json).toMatchObject({ data: { positionals: ['deploy'] } });
  });

  it('citty #237 — `-foo=bar` is USAGE with a hint naming the long form, not a cryptic short-flag error', async () => {
    const r = await runBurgee(program, { argv: ['greet', '-name=ada'] });
    expect(r.code).toBe(ExitCode.USAGE);
    expect(r.stderr).toMatch(/did you mean --name/);
  });

  it('yargs #1324, #2416 — quotes inside a value are never eaten', async () => {
    const r = await run(['greet', '--name', '"a b"', "it's"]);
    expect(r.json).toMatchObject({ data: { name: '"a b"', positionals: ["it's"] } });
  });

  it('citty #201 — an unknown option is USAGE (2), never RUNTIME (1)', async () => {
    const r = await runBurgee(program, { argv: ['greet', '--nope'] });
    expect(r.code).toBe(ExitCode.USAGE);
  });
});

describe('the lifecycle around parsing', () => {
  it('ctx.exit(code) unwinds with that E1 code and prints nothing — not a runtime failure', async () => {
    const r = await runBurgee(program, { argv: ['bail', '--code', String(ExitCode.CONFIG)] });
    expect(r.code).toBe(ExitCode.CONFIG);
    expect(r.stderr).toBe('');
  });

  it('root --help lists the commands and exits OK; no command at all is help with USAGE', async () => {
    const help = await runBurgee(program, { argv: ['--help'] });
    expect(help.code).toBe(ExitCode.OK);
    expect(help.stdout).toMatch(/Commands:[\s\S]*cat[\s\S]*deploy/);
    const none = await runBurgee(program, { argv: [] });
    expect(none.code).toBe(ExitCode.USAGE);
  });
});
