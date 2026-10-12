/**
 * A rehype plugin that reads a Markdown table with an empty top-left cell the way its author
 * wrote it: as a table whose first column names each row.
 *
 * `| | passing | rate |` is how the docs write a row-labelled table — the compatibility rows,
 * the "burgee vs X" comparisons, the API key/value lists. GFM has no syntax for a row header,
 * so it emits the labels as plain `<td>` under an empty `<th>`, and a screen reader then
 * announces every label with no header at all (axe `td-has-header`, measured by Lighthouse on
 * every site in the family). The fix is the markup the table means: the empty corner becomes
 * a `<td>`, and each body row's first cell becomes `<th scope="row">`. A table whose corner has
 * text is left exactly as written.
 *
 * Plain JavaScript for the reason `source-config.mjs` is: Node imports it as it is.
 */

/** The concatenated text under a hast node. */
function textOf(node) {
  if (node.type === 'text') return node.value;
  return (node.children ?? []).map(textOf).join('');
}

/** The element children of `node` named `tagName`. */
function childElements(node, tagName) {
  return (node.children ?? []).filter((child) => child.type === 'element' && child.tagName === tagName);
}

/** The first cell of `row`, a `<th>` or a `<td>`, or `undefined` for an empty row. */
function firstCell(row) {
  return (row.children ?? []).find((child) => child.type === 'element' && (child.tagName === 'th' || child.tagName === 'td'));
}

/** Rewrites one `<table>` in place when its top-left header cell is empty. */
export function promoteRowHeaders(table) {
  const [head] = childElements(table, 'thead');
  const [headRow] = head === undefined ? [] : childElements(head, 'tr');
  const corner = headRow === undefined ? undefined : firstCell(headRow);
  if (corner === undefined || corner.tagName !== 'th' || textOf(corner).trim() !== '') return false;
  corner.tagName = 'td';
  for (const body of childElements(table, 'tbody')) {
    for (const row of childElements(body, 'tr')) {
      const cell = firstCell(row);
      if (cell?.tagName !== 'td') continue;
      cell.tagName = 'th';
      cell.properties = { ...cell.properties, scope: 'row' };
    }
  }
  return true;
}

/** Every `<table>` under `node`, depth first. */
function visitTables(node, visit) {
  if (node.type === 'element' && node.tagName === 'table') visit(node);
  for (const child of node.children ?? []) visitTables(child, visit);
}

/** The transformer the plugin returns: every table in the page's tree. */
function promoteAll(tree) {
  visitTables(tree, promoteRowHeaders);
}

/** The plugin: `rehypePlugins: [rehypeRowHeaders]`. */
export function rehypeRowHeaders() {
  return promoteAll;
}
