/** flagstaff/cli-table3 ÷ cli-table3: 20 tables of 20 rows, fixed widths, word-wrapped cells, one styled column. */
import assert from 'node:assert/strict';

import Table from 'cli-table3';
import FTable from 'flagstaff/cli-table3';

const TABLES = 20;
const ROWS = 20;

const build = (T) => {
  const t = new T({ head: ['id', 'name', 'status', 'note'], colWidths: [6, 14, 10, 24], wordWrap: true });
  for (let r = 0; r < ROWS; r++) t.push([r, `name ${String(r)}`, r % 2 ? '\u001B[32mok\u001B[39m' : 'fail', `a longer note that wraps in the cell ${String(r)}`]);
  return t.toString();
};

const draw = (T) => {
  let bytes = 0;
  for (let i = 0; i < TABLES; i++) bytes += build(T).length;
  return bytes;
};

export default {
  n: 1,
  check() {
    assert.equal(build(FTable), build(Table));
  },
  ours: () => draw(FTable),
  theirs: () => draw(Table),
};
