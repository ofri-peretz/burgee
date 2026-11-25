/**
 * hookset's command line, declared once on burgee: help, `--json`, `--schema` and completions are
 * projected from this declaration. Handlers return data; the text a person reads rides along under
 * burgee's text symbol. All logic is in `core.ts`.
 */
import { defineCommand, defineProgram, ExitCode } from 'burgee';

import { checkContext, contextText } from './context.js';
import { checkRepo, checkText, initRepo, packageRoot, packageVersion } from './core.js';
import { cwd } from './runtime.js';

const TEXT = Symbol.for('burgee.text');
const PKG = packageRoot();

const repoOf = (options: Record<string, unknown>): string => (typeof options['cwd'] === 'string' ? options['cwd'] : cwd());

const initCommand = defineCommand({
  name: 'init',
  description: 'Write the smallest lefthook.yml that pulls the hookset presets, pinned to this version',
  effects: 'idempotent',
  examples: [
    { command: 'hookset init', description: 'a repo with no lefthook.yml: write one' },
    { command: 'hookset init --force', description: 'a hand-written lefthook.yml: add the presets on top; `check` names the duplicates' },
    { command: 'hookset init --claude', description: 'also vendor the Claude hook pack into .claude/ and wire it in settings.json' },
  ],
  options: {
    force: { type: 'boolean', description: 'add the presets to a lefthook.yml hookset did not write' },
    claude: { type: 'boolean', description: 'vendor guard-bash and stop-after-3 into .claude/hooks and wire them' },
    cwd: { type: 'string', description: 'the repo to write in (default: the current directory)' },
  },
  run: ({ options }) => {
    const o = options as Record<string, unknown>;
    const result = initRepo(repoOf(o), PKG, { force: o['force'] === true, claude: o['claude'] === true });
    const data: Record<string | symbol, unknown> = {
      changed: result.changed,
      written: result.written,
      ...(result.refused === undefined ? {} : { exitCode: ExitCode.RUNTIME, error: result.refused, fix: 'pass --force, or add the remote by hand' }),
    };
    data[TEXT] = () => result.refused ?? (result.written.length ? `wrote ${result.written.join(', ')}` : 'already up to date');
    return data;
  },
});

const checkCommand = defineCommand({
  name: 'check',
  description: "Fail when a repo's hooks miss a station, pin no preset version, repeat a preset step, or drift from the Claude pack",
  effects: 'read_only',
  examples: [
    { command: 'hookset check', description: 'the CI gate: exit 1 on any error, warnings listed' },
    { command: 'hookset check --json', description: 'the problems as data, one fix line each' },
  ],
  options: { cwd: { type: 'string', description: 'the repo to check (default: the current directory)' } },
  run: ({ options }) => {
    const result = checkRepo(repoOf(options as Record<string, unknown>), PKG);
    const data: Record<string | symbol, unknown> = { ...result, ...(result.ok ? {} : { exitCode: ExitCode.RUNTIME }) };
    data[TEXT] = () => checkText(result);
    return data;
  },
});

const contextCommand = defineCommand({
  name: 'context',
  description: "Fail when what Claude Code loads into every session outgrows the repo's token ceiling",
  effects: 'idempotent',
  examples: [
    { command: 'hookset context', description: 'the CI gate: exit 1 over the ceiling in .claude/hookset.json' },
    { command: 'hookset context --update', description: 'after a cut: lower the ceiling to the current size' },
  ],
  options: {
    update: { type: 'boolean', description: 'lower the ceiling to the current size; never raises it' },
    cwd: { type: 'string', description: 'the repo to measure (default: the current directory)' },
  },
  run: ({ options }) => {
    const o = options as Record<string, unknown>;
    const result = checkContext(repoOf(o), { update: o['update'] === true });
    const data: Record<string | symbol, unknown> = {
      ...result,
      changed: result.updated,
      ...(result.ok ? {} : { exitCode: ExitCode.RUNTIME, fix: result.fix }),
    };
    data[TEXT] = () => contextText(result);
    return data;
  },
});

export const program = defineProgram({
  name: 'hookset',
  version: packageVersion(PKG),
  description: 'The verification stations as git and Claude hooks, the same in every repo',
  commands: [initCommand, checkCommand, contextCommand],
});
