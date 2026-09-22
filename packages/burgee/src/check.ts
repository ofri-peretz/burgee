/**
 * `burgee check <plugin-file>` — validate a burgee plugin, register it into a throwaway
 * manifest, and report what it contributes (PRINCIPLES 7, `plugin-contract` R8).
 *
 * The other eight hosts print their report; this one **returns** it, because burgee's own
 * commands are documents the engine renders — text for a person, `{ ok, data }` for `--json`,
 * a tool result for `--mcp`. So `burgee check --json` is the one check in the family an agent
 * can read without parsing prose, which is the reader PRINCIPLES 7's eval is written for.
 *
 * A refusal is data too: `{ refused: { code, message, fix }, exitCode: 1 }`. The command
 * still exits 1 — `exitCodeOf` reads the code off the result — so a script branches on the
 * status and an agent reads the fix, and neither has to do both.
 *
 * **Registered into a throwaway `Manifest`, not validated alone.** `validate` checks the shape;
 * `Manifest.use()` is what runs every contributed command through the same door a first-party
 * one takes — reserved names, declared effects, relations — so a plugin that validates and then
 * refuses at `use()` is caught here rather than in the program an author ships it into.
 */
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { ExitCode } from './exit-code.js';
import { Manifest } from './manifest.js';
import { type Plugin, PluginError, validate } from './plugin.js';

export interface CheckReport {
  name: string;
  commands: { path: string; description: string; effects: string }[];
  hooks: { stage: 'preRun' | 'postRun' | 'onError'; applies: string }[];
}

export interface CheckRefusal {
  refused: { code: string; message: string; fix: string };
  exitCode: ExitCode;
}

const STAGES = ['preRun', 'postRun', 'onError'] as const;

const refuse = (code: string, message: string, fix: string): CheckRefusal => ({ refused: { code, message, fix }, exitCode: ExitCode.RUNTIME });

export async function checkPlugin(file: string): Promise<CheckReport | CheckRefusal> {
  // eslint-disable-next-line node-security/no-dynamic-dependency-loading -- the file to check is the user's own, named on the command line
  const loaded = (await import(pathToFileURL(resolve(file)).href)) as { default?: unknown };
  const plugin: unknown = loaded.default ?? loaded;
  try {
    validate(plugin, []);
    new Manifest().use(plugin as Plugin);
  } catch (error) {
    if (error instanceof PluginError) return refuse(error.code, error.message, error.fix);
    // `use()` refuses a contributed command through `checkCommand`, which throws a plain
    // `Error` naming the problem — the same words a first-party command gets.
    if (error instanceof Error) return refuse('E_PLUGIN_SCHEMA', error.message, 'fix the contributed command the message names; it is checked exactly as one of the program’s own');
    throw error;
  }
  const { name, commands = [], hooks = {} } = plugin as Plugin;
  const report: CheckReport = {
    name,
    commands: commands.map((c) => ({ path: c.path.join(' '), description: c.description ?? '', effects: String(c.effects ?? 'undeclared') })),
    hooks: STAGES.filter((stage) => hooks[stage] !== undefined).map((stage) => ({
      stage,
      applies: hooks[stage]?.filter?.command === undefined ? 'every command' : `commands matching ${String(hooks[stage]?.filter?.command)}`,
    })),
  };
  if (report.commands.length === 0 && report.hooks.length === 0) {
    return refuse(
      'E_NO_CONTRIBUTION',
      `${name} registers, but contributes nothing burgee reads`,
      'add `commands` or `hooks` — a key another package in the family reads is allowed in the same object, but `burgee check` cannot show it',
    );
  }
  return report;
}
