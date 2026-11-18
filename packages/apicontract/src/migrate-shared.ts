/**
 * What every `apicontract migrate <from>` returns (apicontract-kit R4): our config, the edits to the
 * user's files, and a finding for every option it could not carry. A migration is pure: it reads
 * the incumbent's config and files as text and returns text; `command-migrate.ts` does the writing.
 */
import { type ContractFinding } from './core/model.js';

/** One target of `apicontract.config.json` (apicontract-gen-command R1). */
export interface Target {
  readonly generator: string;
  /** Where the incumbent wrote this output: a file for one file, a folder for several. */
  readonly out: string;
  readonly options?: Readonly<Record<string, unknown>>;
}

export interface Config {
  readonly input: string;
  readonly targets: Readonly<Record<string, Target>>;
}

/** A user file rewritten: its whole text before and after. */
export interface Edit {
  readonly path: string;
  readonly before: string;
  readonly after: string;
}

export interface Migration {
  /** Absent when nothing in the project says what to generate. */
  readonly config: Config | undefined;
  readonly edits: readonly Edit[];
  readonly findings: readonly ContractFinding[];
  /** The command that removes the incumbent, printed and never run. */
  readonly uninstall: string;
}

/** The project's files by path relative to its root, `/`-separated, as text. */
export type Files = Readonly<Record<string, string>>;

/** A migration: the incumbent's config file (absent when there is none) and the project's files. */
export type Migrate = (configText: string | undefined, files: Files) => Migration;

export const finding = (code: string, pointer: string, message: string, fix: string): ContractFinding => ({ code, pointer, message, fix });

/** The scripts in `package.json`, by name; none when it is absent or unreadable. */
export const scripts = (files: Files): Readonly<Record<string, string>> => {
  try {
    // A missing package.json, text that is not JSON and `"scripts": null` all throw, and read as none.
    const { scripts: found } = JSON.parse(files['package.json'] as string) as { scripts?: unknown };
    if (Object(found) !== found) return {};
    return Object.fromEntries(Object.entries(found as object).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
  } catch {
    return {};
  }
};

/**
 * Rewrite scripts in `package.json`, keeping the rest of its text as it is. A script written in a
 * form the rewrite cannot find is reported, never skipped in silence.
 */
export const editScripts = (files: Files, replaced: Readonly<Record<string, string>>): { edits: Edit[]; findings: ContractFinding[] } => {
  // Only a package.json that exists has scripts to replace.
  const before = files['package.json'] as string;
  const found = scripts(files);
  let after = before;
  const findings: ContractFinding[] = [];
  for (const [name, command] of Object.entries(replaced)) {
    const old = `${JSON.stringify(name)}: ${JSON.stringify(found[name])}`;
    if (after.includes(old)) {
      after = after.replace(old, `${JSON.stringify(name)}: ${JSON.stringify(command)}`);
    } else {
      findings.push(finding('script-not-rewritten', `package.json#/scripts/${name}`, `the \`${name}\` script is not written as \`"${name}": "…"\` on one line`, `set it to \`${command}\` by hand`));
    }
  }
  return { edits: after === before ? [] : [{ path: 'package.json', before, after }], findings };
};

/** A shell command split at `&&`, `||`, `;` and `|`, the separators kept, so joining the parts gives it back. */
export const commandParts = (command: string): string[] => command.split(/(\s*(?:&&|\|\||;|\|)\s*)/u);

/** `kebab-case` as `camelCase`: CLI flags and YAML keys as option names. */
export const camel = (name: string): string => name.replaceAll(/-([a-z])/gu, (_match, letter: string) => letter.toUpperCase());

/** The text of `config` as `apicontract.config.json` holds it. */
export const configText = (config: Config): string => `${JSON.stringify(config, undefined, 2)}\n`;
