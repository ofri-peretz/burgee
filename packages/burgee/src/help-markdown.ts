/**
 * agent-skill R1 — help as Markdown: the second layout of `helpModel`'s section list, so a
 * command reference committed to a README, or read by an agent, lists exactly what `--help`
 * does. It closes `cli-help-renderer` R6, deferred on 2026-09-07 until a consumer needed it.
 *
 * A heading per command, its usage as a code block, every section as a table of term and
 * description, and each example as its description over a fenced line to run. Nothing wraps:
 * Markdown reflows itself. A `|` in a cell is escaped, so a description cannot split its row.
 *
 * Loaded by `renderHelp(…, { format: 'markdown' })` behind an `await import()`: a program that
 * prints help to a terminal carries none of this (cli-help-renderer R6's reason for deferring).
 */
import { type HelpModel, type Row } from './help.js';
import { type CommandNode } from './manifest.js';

const cell = (s: string): string => s.replaceAll('|', '\\|');

/** A term as a code span; one that holds a backtick takes the double-backtick form, so it stays one span. */
const code = (s: string): string => (s.includes('`') ? `\`\` ${s} \`\`` : `\`${s}\``);

const table = (rows: Row[]): string[] => ['| Term | Description |', '| :-- | :-- |', ...rows.map((r) => `| ${code(cell(r.term))} | ${cell(r.text)} |`)];

/** A section's heading: its title less the colon a terminal heading ends with, when it has one (a `group` need not). */
const heading = (title: string): string => `## ${title.endsWith(':') ? title.slice(0, -1) : title}`;

/** Each example's description, then its line in a fence: the line copies as it stands. */
const examples = (rows: Row[]): string[] => rows.flatMap((r) => [...(r.text === '' ? [] : [r.text, '']), '```sh', r.term, '```', '']);

export function markdownHelp(model: HelpModel, node: CommandNode): string {
  const blocks: string[] = [`# ${node.path.join(' ')}`, ''];
  if (model.description !== undefined) blocks.push(model.description, '');
  blocks.push('## Usage', '', '```sh', `${node.path.join(' ')} ${model.usage}`, '```', '');
  for (const s of model.sections) blocks.push(heading(s.title), '', ...(s.title === 'Examples:' ? examples(s.rows) : [...table(s.rows), '']));
  for (const t of model.trailer) blocks.push(t, '');
  return `${blocks.join('\n').trimEnd()}\n`;
}
