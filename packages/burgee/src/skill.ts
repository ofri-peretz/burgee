/**
 * agent-skill R2 — an Agent Skill for the program, projected from the declaration that already
 * serves help, `--json`, `--schema`, `--mcp` and completions. Every line comes from the manifest.
 *
 * **Small on purpose.** It carries what an agent needs on every call and cannot intuit: what the
 * program is for, the contract (`--json` and its envelope, `--explain`, the exit codes and the
 * error kinds), and one line and the first example per command that runs. A command's options,
 * arguments and defaults are behind `--schema <command>`, which the skill names and never
 * inlines: inlining is the eager-schema mistake `migration-drivers.md` §6 names.
 *
 * **The front matter follows the Agent Skills specification** (agentskills.io/specification,
 * read from `agentskills/agentskills` at `69ef37e9` on 2026-10-12): `name` is 1–64 characters of
 * `a-z`, `0-9` and `-`, not starting or ending with `-` and with no `--`; `description` is 1–1024
 * characters and says what the skill does and when to use it. `skill.test.ts` holds both.
 *
 * Loaded by `--skill` and `burgee skill` only, behind an `await import()`.
 */
import { errorsOf } from './clispec.js';
import { ExitCode } from './exit-code.js';
import { type CommandNode, type Manifest } from './manifest.js';
import { EXIT_ADVICE } from './root-help.js';
import { runnableBelow, signature } from './usage.js';

/** The specification's limits, as `skill.test.ts` checks them. */
export const NAME_MAX = 64;
export const DESCRIPTION_MAX = 1024;

/** Written into both files, so a reader knows to regenerate rather than edit. */
const GENERATED = '<!-- Generated from the program\'s declaration by `burgee skill`. Edit the declaration, not this file. -->';

/** The program's name under the specification's character rules: `@acme/Deploy_CLI` is `acme-deploy-cli`. */
export function skillName(name: string): string {
  // Split, not trimmed with `^-+|-+$`: a pattern anchored at both ends backtracks on a long run of
  // `-` (CodeQL js/polynomial-redos), and joining the words leaves no leading, trailing or doubled `-`.
  const joined = name.toLowerCase().split(/[^a-z0-9]+/u).filter((w) => w !== '').join('-').slice(0, NAME_MAX);
  const normal = joined.endsWith('-') ? joined.slice(0, -1) : joined;
  return normal === '' ? 'cli' : normal;
}

/** A command's summary as the object of "use it to …": its first letter lowered, unless it is an acronym. */
const verbPhrase = (s: string): string => (/^[A-Z][a-z]/.test(s) ? `${s.charAt(0).toLowerCase()}${s.slice(1)}` : s).replace(/\.$/, '');

/** "a, b or c". */
const either = (items: string[]): string => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} or ${items.at(-1) as string}`);

/** A YAML scalar: plain when it reads back as itself, else double-quoted (JSON's escapes are YAML's). */
const scalar = (s: string): string => (/^[\w(][^\n]*$/.test(s) && !/: | #|:$/.test(s) ? s : JSON.stringify(s));

const sentence = (s: string): string => (/[.!?]$/.test(s) ? s : `${s}.`);

/** What the program does, then when to use it, from the command summaries; within the specification's limit. */
function descriptionOf(manifest: Manifest, root: CommandNode, commands: CommandNode[]): string {
  const name = manifest.rootPath.join(' ');
  const what = sentence(root.description ?? `The ${name} command line`);
  const uses = commands.map((c) => c.summary ?? c.description).filter((s): s is string => s !== undefined && s !== '').map(verbPhrase);
  const full = uses.length === 0 ? what : `${what} Use it to ${either(uses)}.`;
  if (full.length <= DESCRIPTION_MAX) return full;
  // Cut at the last space that fits, found by index rather than a `\s+\S*$` pattern (CodeQL js/polynomial-redos).
  const cut = full.slice(0, DESCRIPTION_MAX - 1);
  const at = cut.lastIndexOf(' ');
  return `${at === -1 ? cut : cut.slice(0, at)}…`;
}

/** A table cell: `|` escaped and line breaks as `<br>`, so neither ends the row early. */
const cell = (s: string): string => s.replaceAll('|', '\\|').replaceAll(/\r?\n/g, '<br>');

/** The contract an agent relies on on every call, from the same rows `--schema` publishes. */
function contract(manifest: Manifest, run: string): string[] {
  const rows = [
    `| \`${String(ExitCode.OK)}\` | \`ok\` | no | ${cell(EXIT_ADVICE.OK)} |`,
    ...errorsOf(manifest).map((e) => `| \`${String(e.exit_code)}\` | \`${e.kind}\` | ${e.retryable ? 'yes' : 'no'} | ${cell(e.description ?? '')} |`),
  ];
  return [
    '## The contract',
    '',
    `- \`--json\` prints one envelope on stdout: \`{"ok":true,"data":…}\`, or \`{"ok":false,"error":{"kind","code","message"}}\` with the exit code below.`,
    '- `--explain <option>` says where an option\'s value came from: a flag, an environment variable, a config file or the default.',
    `- \`${run} --schema <command>\` prints one command's full contract as JSON: its arguments, options, defaults and environment variables, and \`--field <path>\` prints one value of it.`,
    '',
    '| Exit | Kind | Retry | What it asks of the caller |',
    '| :-- | :-- | :-- | :-- |',
    ...rows,
  ];
}

/** One line and the first example per command that runs; the root's own when it runs. */
function commandLines(manifest: Manifest, root: CommandNode, commands: CommandNode[], run: string): string[] {
  const lines = commands.map((c) => {
    const said = c.summary ?? c.description;
    const example = c.examples?.[0];
    return `- \`${[run, signature(c, root)].filter((s) => s !== '').join(' ')}\`${said === undefined ? '' : `: ${sentence(said)}`}${example === undefined ? '' : ` Example: \`${example.command}\``}`;
  });
  return ['## Commands', '', ...lines, '', `For any command's options, arguments and defaults, run \`${run} --schema <command>\`; nothing here repeats them.`];
}

/**
 * The skill's body, from its first heading: shared by `SKILL.md` and `AGENTS.md`. `view` is the
 * run's locale for the author's own text (`localised-human-surfaces` R5): `--skill` hands in the
 * same view help renders through, and `burgee skill` writes the files in the base language.
 */
function body(manifest: Manifest, heading: string, view: (node: CommandNode) => CommandNode): { description: string; lines: string[] } {
  const run = manifest.rootPath.join(' ');
  const declared = manifest.find(manifest.rootPath) ?? { path: manifest.rootPath, options: {} };
  const root = view(declared);
  const commands = [...(declared.run === undefined ? [] : [root]), ...runnableBelow(manifest, declared).map(view)];
  const description = descriptionOf(manifest, root, commands);
  return {
    description,
    lines: [heading, '', GENERATED, '', description, '', ...contract(manifest, run), '', ...commandLines(manifest, root, commands, run)],
  };
}

/** A command as declared, in the base language: what `burgee skill` writes to disk. */
const asDeclared = (node: CommandNode): CommandNode => node;

/** `SKILL.md`: the front matter, then the body. */
export function renderSkill(manifest: Manifest, view: (node: CommandNode) => CommandNode = asDeclared): string {
  const { description, lines } = body(manifest, `# ${manifest.rootPath.join(' ')}`, view);
  return `${['---', `name: ${skillName(manifest.rootPath.join(' '))}`, `description: ${scalar(description)}`, '---', '', ...lines].join('\n')}\n`;
}

/** `AGENTS.md`: the same body, without front matter, under the heading coding agents look for. */
export function renderAgents(manifest: Manifest): string {
  return `${body(manifest, `# AGENTS.md — ${manifest.rootPath.join(' ')}`, asDeclared).lines.join('\n')}\n`;
}
