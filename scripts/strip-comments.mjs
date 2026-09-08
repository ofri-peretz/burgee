#!/usr/bin/env node
// Strips comments from the emitted JavaScript under a dist directory, in place, with
// TypeScript's own transpiler — no other transform, no minification. The .d.ts files keep
// every doc comment, so editors lose nothing; the shipped bytes a user pays for drop by
// roughly a fifth, which is what the weight lock measures.
//
// Emitted JSON is re-serialised without its indentation for the same reason: tsc pretty-
// prints every data file it copies, and flagstaff's spinner corpus pays 13 KB for the
// whitespace. The parse is also a check that what shipped is valid JSON.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import ts from 'typescript';

const dir = process.argv[2] ?? 'dist';
let files = 0;
let jsonFiles = 0;
for (const name of readdirSync(dir)) {
  if (name.endsWith('.json')) {
    const at = join(dir, name);
    writeFileSync(at, JSON.stringify(JSON.parse(readFileSync(at, 'utf8'))));
    jsonFiles += 1;
    continue;
  }
  if (!name.endsWith('.js')) continue;
  const at = join(dir, name);
  const { outputText } = ts.transpileModule(readFileSync(at, 'utf8'), {
    fileName: at,
    compilerOptions: { removeComments: true, target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext },
  });
  writeFileSync(at, outputText);
  files += 1;
}
process.stdout.write(`stripped comments from ${files} file(s) and reserialised ${jsonFiles} JSON file(s) in ${dir}\n`);
