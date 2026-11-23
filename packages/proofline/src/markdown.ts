/**
 * The little Markdown proofline reads: `##` sections, pipe tables, list items and code spans.
 * No remark (spec, Design): an intent is headings, bullets and tables, and a reader over those
 * three is smaller than the dependency and cannot drift from what the repo writes.
 */

/** The body under the first `## <heading>` that starts with one of `headings`, up to the next `## `. */
export const section = (text: string, headings: readonly string[]): string | undefined => {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => headings.some((h) => line.startsWith(`## ${h}`)));
  if (start === -1) return undefined;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith('## '));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n');
};

/** The cells of one pipe-table row, trimmed; a `\|` inside a cell stays in it. */
export const cells = (row: string): string[] =>
  row
    .trim()
    .replace(/^\|/u, '')
    .replace(/\|$/u, '')
    .split(/(?<!\\)\|/u)
    .map((cell) => cell.trim());

/** Every row of every pipe table in `text` whose header's first cell is `first`, as cells; the header and rule rows left out. */
export const tableRows = (text: string, first: string): string[][] => {
  const rows: string[][] = [];
  let inTable = false;
  for (const line of text.split('\n')) {
    if (!line.trimStart().startsWith('|')) {
      inTable = false;
      continue;
    }
    const row = cells(line);
    if (row[0] === first) inTable = true;
    else if (inTable && !/^:?-+:?$/u.test(row[0] as string)) rows.push(row);
  }
  return rows;
};

/** The top-level `- ` items of a list, each joined with its continuation lines. */
export const items = (body: string): string[] => {
  const found: string[] = [];
  for (const line of body.split('\n')) {
    if (line.startsWith('- ')) found.push(line.slice(2).trim());
    else if (found.length > 0 && line.startsWith('  ') && line.trim() !== '') found[found.length - 1] += ` ${line.trim()}`;
  }
  return found;
};

/** The contents of every single-backtick code span in `text`. */
export const codeSpans = (text: string): string[] => [...text.matchAll(/`([^`]+)`/gu)].map((m) => m[1] as string);
