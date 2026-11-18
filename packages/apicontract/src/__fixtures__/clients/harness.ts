/**
 * Test scaffolding for the client and mock generators: the fixture spec, every file the four
 * targets write for it, a type-check of those files in memory, and a loader that runs generated
 * TypeScript by transpiling it with the TypeScript compiler.
 *
 * TypeScript and ajv come from the root dev dependencies: tests use them, the package never does.
 * `__fixtures__` is outside coverage, mutation and the build.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// eslint-disable-next-line import-next/no-extraneous-dependencies -- test-only: the root's dev dependency type-checks and runs the generated files
import ts from 'typescript';

import { type ContractFinding } from '../../core/model.js';
import { type GeneratedFile, type GeneratorResult, type Plugin } from '../../host.js';
import { read } from '../../openapi.js';
import { plugin as fetchPlugin } from '../../plugin-fetch.js';
import { plugin as mswPlugin } from '../../plugin-msw.js';
import { plugin as swrPlugin } from '../../plugin-swr.js';
import { plugin as queryPlugin } from '../../plugin-tanstack-query.js';
import { plugin as typesPlugin } from '../../plugin-types.js';

export const shop = JSON.parse(readFileSync(fileURLToPath(new URL('shop.openapi.json', import.meta.url)), 'utf8')) as Record<string, unknown>;

const runOne = async (plugin: Plugin, document: unknown, options: Readonly<Record<string, unknown>> = {}): Promise<GeneratorResult> => {
  const [generator] = Object.values(plugin.generators ?? {});
  const result = await generator?.run(read(document), options);
  return Array.isArray(result) ? { files: result as GeneratedFile[], findings: [] } : (result as GeneratorResult);
};

/** Every file the types, fetch, msw, tanstack-query and swr targets write for `document`, by path. */
export const generateAll = async (document: unknown): Promise<{ files: Record<string, string>; findings: Record<string, readonly ContractFinding[]> }> => {
  const results = { types: await runOne(typesPlugin, document), fetch: await runOne(fetchPlugin, document), msw: await runOne(mswPlugin, document), query: await runOne(queryPlugin, document), swr: await runOne(swrPlugin, document) };
  const files = Object.fromEntries(Object.values(results).flatMap((result) => result.files.map((file) => [file.path, file.content])));
  const findings = Object.fromEntries(Object.entries(results).map(([name, result]) => [name, result.findings]));
  return { files, findings };
};

/** Enough of MSW 2's surface for `handlers.ts` to type-check without installing it. */
const MSW = `declare module 'msw' {
  type Resolver = () => Response | Promise<Response>;
  type Handler = { readonly path: string };
  export const http: Record<'get' | 'put' | 'post' | 'delete' | 'options' | 'head' | 'patch', (path: string, resolver: Resolver) => Handler>;
  export class HttpResponse extends Response {
    constructor(body: string | null, init?: { status?: number; headers?: Record<string, string> });
  }
}
`;

const OPTIONS: ts.CompilerOptions = {
  strict: true,
  exactOptionalPropertyTypes: true,
  noUncheckedIndexedAccess: true,
  noEmit: true,
  skipLibCheck: true,
  target: ts.ScriptTarget.ES2023,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  lib: ['lib.es2023.d.ts', 'lib.dom.d.ts'],
  types: [],
};

const same = (name: string): string => name;

/** Type-check `files` (relative names) together, in memory, under the strictest options this repository uses. */
export const typecheck = (files: Readonly<Record<string, string>>): string[] => {
  const all: Record<string, string> = { ...Object.fromEntries(Object.entries(files).map(([name, text]) => [`/virtual/${name}`, text])), '/virtual/msw.d.ts': MSW };
  const host = ts.createCompilerHost(OPTIONS);
  const { getSourceFile, fileExists, readFile, directoryExists } = host;
  host.getSourceFile = (name, language) => (all[name] === undefined ? getSourceFile.call(host, name, language) : ts.createSourceFile(name, all[name], language));
  host.fileExists = (name) => all[name] !== undefined || fileExists.call(host, name);
  host.readFile = (name) => all[name] ?? readFile.call(host, name);
  host.directoryExists = (name) => name === '/virtual' || (directoryExists?.call(host, name) ?? false);
  host.realpath = same;
  const program = ts.createProgram(Object.keys(all), OPTIONS, host);
  return ts.getPreEmitDiagnostics(program).map((diagnostic) => {
    const line = diagnostic.file === undefined ? 0 : diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start ?? 0).line + 1;
    return `${diagnostic.file?.fileName ?? ''}:${String(line)} ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`;
  });
};

/** Run a generated TypeScript module that imports nothing at run time. */
export const load = async <T>(source: string): Promise<T> => {
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext } });
  // eslint-disable-next-line node-security/no-dynamic-dependency-loading -- test-only: runs the module this suite just generated, from a data: URL
  return (await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)) as T;
};
