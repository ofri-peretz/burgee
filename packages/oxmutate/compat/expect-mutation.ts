/**
 * Stryker's `expectJSMutation` (test/helpers/expect-mutation.ts at v10.0.0), answered by
 * oxmutate's native core: `originalCode` is instrumented, the mutants of `sut.name`'s family are
 * applied one at a time, and the set must equal `expectedReplacements`.
 *
 * Both sides are printed by TypeScript's printer before they are compared. Stryker prints the
 * replaced node with @babel/generator (`for (let i = 0; false; i++) {\n  console.log();\n}`)
 * while oxmutate edits the span (`for(let i=0; false; i++) { console.log(); }`): the same
 * program, formatted twice. A source that does not parse is compared as written.
 */
import ts from 'typescript';
import { expect } from 'vitest';

import { applyMutant } from '../src/checker.js';
import { native } from '../src/native.js';

function printed(code: string): string {
  const { diagnostics = [] } = ts.transpileModule(code, { reportDiagnostics: true, fileName: 'source.tsx' });
  if (diagnostics.length > 0) return code;
  return ts.createPrinter().printFile(ts.createSourceFile('source.tsx', code, ts.ScriptTarget.Latest, false, ts.ScriptKind.TSX));
}

export function expectJSMutation(sut: { name: string }, originalCode: string, _context: unknown, ...expectedReplacements: string[]): void {
  const [file] = native().instrumentFiles([{ path: 'source.tsx', source: originalCode }], { strykerCompat: true });
  const mutants = (file?.mutants ?? []).filter((m) => m.mutatorName === sut.name).map((m) => printed(applyMutant(originalCode, m)));
  expect(mutants.sort(), `${sut.name} on ${JSON.stringify(originalCode)}`).toEqual(expectedReplacements.map(printed).sort());
}
