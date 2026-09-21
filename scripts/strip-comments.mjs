#!/usr/bin/env node
// Strips comments from the emitted JavaScript under a dist directory, in place, with
// TypeScript's own transpiler — no other transform, no minification. The .d.ts files keep
// every doc comment, so editors lose nothing; the shipped bytes a user pays for drop by
// roughly a fifth, which is what the weight lock measures.
//
// Emitted JSON is re-serialised without its indentation for the same reason: tsc pretty-
// prints every data file it copies, and flagstaff's spinner corpus pays 13 KB for the
// whitespace. The parse is also a check that what shipped is valid JSON.
//
// It walks **subdirectories too**, and that was a real omission rather than a tidy-up: the
// first version read one level, so `dist/commander/` shipped untouched and **14,312 bytes of
// burgee's `./commander` entry were doc comments** — forty-one times the ratchet that entry
// had just been raised by. A package with a flat `dist/` never noticed; one with a nested
// entry point paid for prose on every install.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import ts from 'typescript';

const dir = process.argv[2] ?? 'dist';
let files = 0;
let jsonFiles = 0;

function strip(at) {
  for (const entry of readdirSync(at, { withFileTypes: true })) {
    const full = join(at, entry.name);
    if (entry.isDirectory()) {
      strip(full);
      continue;
    }
    if (entry.name.endsWith('.json')) {
      writeFileSync(full, JSON.stringify(JSON.parse(readFileSync(full, 'utf8'))));
      jsonFiles += 1;
      continue;
    }
    if (!entry.name.endsWith('.js')) continue;
    const { outputText } = ts.transpileModule(readFileSync(full, 'utf8'), {
      fileName: full,
      compilerOptions: { removeComments: true, target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext },
    });
    writeFileSync(full, outputText);
    files += 1;
  }
}

strip(dir);
process.stdout.write(`stripped comments from ${files} file(s) and reserialised ${jsonFiles} JSON file(s) in ${dir}\n`);
