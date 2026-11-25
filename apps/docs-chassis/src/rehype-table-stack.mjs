/**
 * A rehype plugin that lets a Markdown table fold into cards on a narrow screen, after
 * Interlace's rule that below a component's minimum width the layout swaps to a narrower
 * alternative instead of squeezing (or, here, scrolling sideways). The docs hold 605 tables;
 * the two-column "zod | truefit" mappings alone ran 646px wide in a 358px column at 390px.
 *
 * The plugin only adds what the CSS in `global.css` needs, and nothing changes on a wide
 * screen:
 * - `data-stack` on the table, which the stylesheet folds when its wrapper is narrower than
 *   the fold width;
 * - `data-label` on every body cell, the text of its column's header, which a folded cell
 *   prints in front of its value (and hides from assistive tech, which reads the header);
 * - explicit ARIA table roles, because `display: block` on table parts drops their implicit
 *   roles in some browsers, and a folded table must still be a table to a screen reader.
 *
 * Runs after `rehype-row-headers.mjs`, so a row-labelled table's first cell is already a
 * `<th scope="row">`; a cell under an empty header gets no label and reads as the card's title.
 * Plain JavaScript for the reason `source-config.mjs` is: Node imports it as it is.
 */

/** The concatenated text under a hast node. */
function textOf(node) {
  if (node.type === 'text') return node.value;
  return (node.children ?? []).map(textOf).join('');
}

/** The element children of `node` named one of `tagNames`. */
function elements(node, ...tagNames) {
  return (node.children ?? []).filter((child) => child.type === 'element' && tagNames.includes(child.tagName));
}

/** Adds `properties` to `node`, keeping what it has. */
function set(node, properties) {
  node.properties = { ...node.properties, ...properties };
}

/** Marks one `<table>`; a table with no header row is left alone, having no labels to give. */
export function stackTable(table) {
  const [head] = elements(table, 'thead');
  const [headRow] = head === undefined ? [] : elements(head, 'tr');
  if (headRow === undefined) return false;
  const labels = elements(headRow, 'th', 'td').map((cell) => textOf(cell).trim());
  set(table, { 'data-stack': '', role: 'table' });
  set(head, { role: 'rowgroup' });
  set(headRow, { role: 'row' });
  for (const cell of elements(headRow, 'th', 'td')) set(cell, { role: cell.tagName === 'th' ? 'columnheader' : 'cell' });
  for (const body of elements(table, 'tbody')) {
    set(body, { role: 'rowgroup' });
    for (const row of elements(body, 'tr')) {
      set(row, { role: 'row' });
      elements(row, 'th', 'td').forEach((cell, index) => {
        const label = labels[index] ?? '';
        set(cell, { role: cell.tagName === 'th' ? 'rowheader' : 'cell', ...(label === '' ? {} : { 'data-label': label }) });
      });
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
function stackAll(tree) {
  visitTables(tree, stackTable);
}

/** The plugin: `rehypePlugins: [rehypeRowHeaders, rehypeTableStack]`. */
export function rehypeTableStack() {
  return stackAll;
}
