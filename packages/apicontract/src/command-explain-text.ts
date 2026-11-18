/**
 * An explanation as Markdown: what `explain` prints without `--json`, and the page `gen markdown`
 * writes for each operation. One rendering, so an agent reading the docs folder and one running
 * the CLI read the same text.
 */
import { type Explanation } from './command-explain-operation.js';

const code = (text: string): string => `\`${text}\``;

/** The line under the title: method and path when there are some, then where the operation is declared. */
const where = (explanation: Explanation): string => {
  const route = explanation.method === undefined ? [] : [code(`${explanation.method} ${explanation.path as string}`)];
  return [...route, `${explanation.format} ${code(explanation.source)}`].join(' · ');
};

const list = (title: string, items: readonly string[] | undefined): string[] =>
  items === undefined ? [] : [`${title}: ${items.map((item) => code(item)).join(', ')}`, ''];

/** One operation as a Markdown page, ending in a newline. */
export const toMarkdown = (explanation: Explanation): string => {
  const lines = [`# ${explanation.id}`, '', where(explanation), ''];
  for (const prose of [explanation.summary, explanation.description]) if (prose !== undefined) lines.push(prose, '');
  lines.push(...list('Tags', explanation.tags));
  for (const payload of explanation.payloads) {
    lines.push(`## ${payload.name}`, '', `${payload.direction}, ${payload.required ? 'required' : 'optional'}`, '', '```json', JSON.stringify(payload.schema, null, 2), '```', '');
  }
  lines.push(...list('Cycles, each cut to `{ "$comment": "cycle: <pointer>" }`', explanation.cycles), ...list('External references, not followed', explanation.external));
  if (explanation.truncated !== undefined) {
    lines.push(...list(`Truncated to ${String(explanation.truncated.maxBytes)} bytes; emptied`, explanation.truncated.cut));
  }
  return `${lines.join('\n').trimEnd()}\n`;
};
