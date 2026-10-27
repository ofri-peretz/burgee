// The 1,000-file tree `packages/burgee/src/migrate-bench.test.ts` times (A10), written to <dir>.
//   node bench-tree.mjs <dir>
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const dir = process.argv[2];
const HOST_IMPORT = ["import { Command, Option } from 'commander';\n", "import { hideBin } from 'yargs/helpers';\n", ''];
const module_ = (n) => {
  const body = Array.from({ length: 30 }, (_, i) => `export function f${n}_${i}(x: string): string {\n  // a comment with an apostrophe: don't\n  return \`\${x}-${i}\`;\n}`).join('\n\n');
  return `${HOST_IMPORT[n % 3]}import { join } from 'node:path';\n\n/**\n * Module ${n}.\n */\n${body}\n`;
};
writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'bench', dependencies: { commander: '^15.0.0', yargs: '^18.0.0' } }));
for (let n = 0; n < 1000; n += 1) {
  const sub = join(dir, `src/g${n % 20}`);
  mkdirSync(sub, { recursive: true });
  writeFileSync(join(sub, `m${n}.ts`), module_(n));
}
