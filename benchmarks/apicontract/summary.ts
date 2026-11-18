/**
 * R6: folds every `<tool>.jsonl` in a results folder into `summary.md` (the table the docs page
 * renders, with the losing rows) and `summary.json` (the same numbers, for the integrator).
 *
 *   npx tsx benchmarks/apicontract/summary.ts <results-dir> [--subject ours:types]
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { foldTool, parseFlags, renderSummary, type Row, topErrors } from './corpus-lib.js';

/** The rows of every jsonl in `dir`, by tool. */
export function readRows(dir: string): Record<string, Row[]> {
  const byTool = new Map<string, Row[]>();
  for (const name of readdirSync(dir).filter((f) => f.endsWith('.jsonl')).toSorted()) {
    for (const line of readFileSync(path.join(dir, name), 'utf8').split('\n')) {
      if (line.trim() === '') continue;
      const row = JSON.parse(line) as Row;
      byTool.set(row.tool, [...(byTool.get(row.tool) ?? []), row]);
    }
  }
  return Object.fromEntries(byTool);
}

export function summarise(dir: string, subject?: string): { markdown: string; json: unknown } {
  const rows = readRows(dir);
  const tools = Object.keys(rows).toSorted((a, b) => Number(b.startsWith('ours:')) - Number(a.startsWith('ours:')) || (a < b ? -1 : 1));
  const chosen = subject ?? tools.find((t) => t.startsWith('ours:'));
  const folded = tools.map((t) => foldTool(t, rows[t] ?? []));
  const run = path.basename(dir);
  const errors = Object.fromEntries(tools.map((t) => [t, topErrors(rows[t] ?? [])]));
  const markdown = [
    renderSummary({ run, tools: folded, rows, subject: chosen }).trimEnd(),
    '',
    '## Most frequent errors',
    '',
    ...tools.flatMap((t) => [`### ${t}`, '', ...((errors[t] ?? []).length === 0 ? ['- none'] : (errors[t] ?? []).map((e) => `- ${e.count} × \`${e.error.replaceAll('`', "'")}\``)), '']),
  ].join('\n');
  return { markdown: `${markdown.trimEnd()}\n`, json: { run, subject: chosen ?? null, tools: folded, errors } };
}

if (process.argv[1] === import.meta.filename) {
  const { flags, positional } = parseFlags(process.argv.slice(2));
  const dir = positional[0];
  if (dir === undefined) throw new Error('usage: summary.ts <results-dir> [--subject ours:types]');
  const subject = flags.get('subject');
  const { markdown, json } = summarise(dir, typeof subject === 'string' ? subject : undefined);
  writeFileSync(path.join(dir, 'summary.md'), markdown);
  writeFileSync(path.join(dir, 'summary.json'), `${JSON.stringify(json, undefined, 2)}\n`);
  process.stdout.write(markdown);
}
