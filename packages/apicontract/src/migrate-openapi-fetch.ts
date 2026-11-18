/**
 * `apicontract migrate openapi-fetch` (apicontract-kit R4): openapi-fetch reads the types
 * openapi-typescript writes, so its migration is that one plus the `fetch` target, with each
 * `import createClient from "openapi-fetch"` pointed at the generated client. A call by method and
 * path (`client.GET("/pets")`) has no mechanical equivalent in a client with one method per
 * operation, so each one is a finding with its line.
 *
 * Usage: https://github.com/openapi-ts/openapi-typescript/blob/main/docs/openapi-fetch/index.md
 */
import { posix } from 'node:path';

import { type ContractFinding } from './core/model.js';
import { migrate as migrateTypes } from './migrate-openapi-typescript.js';
import { type Edit, finding, type Files, type Migrate } from './migrate-shared.js';

const SOURCE = /\.(?:[cm]?[jt]s|[jt]sx)$/u;
const DEFAULT_IMPORT = /import\s+([$A-Z_a-z][\w$]*)\s+from\s+(["'])openapi-fetch\2/gu;
const ANY_IMPORT = /from\s+["']openapi-fetch["']|import\(\s*["']openapi-fetch["']\s*\)|require\(\s*["']openapi-fetch["']\s*\)/gu;
const CALL = /\.(GET|PUT|POST|DELETE|OPTIONS|HEAD|PATCH|TRACE)\(/gu;

/** The 1-based line of `index` in `text`. */
const lineOf = (text: string, index: number): number => text.slice(0, index).split('\n').length;

/** `client` as an import specifier from `file`, in the style the file already uses for relative imports. */
const specifier = (file: string, client: string, text: string): string => {
  const relative = posix.relative(posix.dirname(file), client).replace(/\.ts$/u, /from\s+["']\.\.?\/[^"']*\.js["']/u.test(text) ? '.js' : '');
  return relative.startsWith('.') ? relative : `./${relative}`;
};

const TYPE_ARGUMENTS = /<[^>(]*>\(/uy;

/** `name<…>(` as `name(`: the type arguments openapi-fetch's `createClient` takes and the generated one does not. */
const dropTypeArguments = (text: string, name: string): string => {
  let result = '';
  let from = 0;
  for (let at = text.indexOf(`${name}<`); at !== -1; at = text.indexOf(`${name}<`, at + 1)) {
    TYPE_ARGUMENTS.lastIndex = at + name.length;
    const match = TYPE_ARGUMENTS.exec(text);
    if (match === null || /[\w$]/u.test(text.charAt(at - 1))) continue;
    result += `${text.slice(from, at + name.length)}(`;
    from = at + name.length + match[0].length;
  }
  return result + text.slice(from);
};

/** One source file: its edit, if any, and a finding for everything left to do by hand. */
const rewrite = (path: string, before: string, client: string): { edit?: Edit; findings: ContractFinding[] } => {
  const findings: ContractFinding[] = [];
  let after = before;
  for (const [statement, name = '', quote = '"'] of before.matchAll(DEFAULT_IMPORT)) {
    after = after.replace(statement, `import { ${name === 'createClient' ? name : `createClient as ${name}`} } from ${quote}${specifier(path, client, before)}${quote}`);
    after = dropTypeArguments(after, name);
  }
  for (const left of after.matchAll(ANY_IMPORT)) {
    findings.push(finding('import-not-rewritten', `${path}#L${String(lineOf(after, left.index))}`, 'this import of openapi-fetch is not a default `createClient` import', 'import `createClient` from the generated client instead; it has one method per operation'));
  }
  for (const call of after.matchAll(CALL)) {
    findings.push(finding('call-by-path', `${path}#L${String(lineOf(after, call.index))}`, `\`.${String(call[1])}(…)\` calls by method and path, and the generated client has one method per operation`, 'call the method named by the operation’s `operationId` instead'));
  }
  return after === before ? { findings } : { edit: { path, before, after }, findings };
};

export const migrate: Migrate = (configText, files: Files) => {
  const types = migrateTypes(configText, files);
  const uninstall = 'npm uninstall openapi-fetch openapi-typescript';
  const out = types.config?.targets.types?.out;
  if (types.config === undefined || out === undefined) return { ...types, uninstall };
  const client = posix.join(posix.dirname(out), 'client.ts');
  const config = { ...types.config, targets: { ...types.config.targets, fetch: { generator: 'fetch', out: client } } };
  const sources = Object.entries(files)
    .filter(([path, text]) => SOURCE.test(path) && text.includes('openapi-fetch'))
    .map(([path, text]) => rewrite(path, text, client));
  return {
    config,
    edits: [...types.edits, ...sources.flatMap((one) => (one.edit === undefined ? [] : [one.edit]))],
    findings: [...types.findings, ...sources.flatMap((one) => one.findings)],
    uninstall,
  };
};
