/**
 * `apicontract migrate <from> [dir]` (apicontract-kit R4): read the incumbent's config and the
 * project's files, write `apicontract.config.json` beside the incumbent's (never deleting it),
 * apply the edits, and report every option it could not carry. `--dry-run` writes nothing.
 *
 * `idempotent`, and earned: the config is the user's once written, and a second run finds no
 * script or import of the incumbent left to rewrite.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { defineCommand } from 'burgee';

import { migrate as heyApi } from './migrate-hey-api.js';
import { migrate as openapiFetch } from './migrate-openapi-fetch.js';
import { migrate as openapiTypescript } from './migrate-openapi-typescript.js';
import { migrate as orval } from './migrate-orval.js';
import { configText, type Files, type Migrate } from './migrate-shared.js';
import { writeFiles } from './scaffold-write.js';

/** Each incumbent: its migration, and its config files in the order it looks for them. */
export const SOURCES: Readonly<Record<string, { readonly migrate: Migrate; readonly configs: readonly string[] }>> = {
  'openapi-typescript': { migrate: openapiTypescript, configs: ['redocly.yaml', '.redocly.yaml'] },
  'openapi-fetch': { migrate: openapiFetch, configs: ['redocly.yaml', '.redocly.yaml'] },
  'hey-api': { migrate: heyApi, configs: ['openapi-ts.config.ts', 'openapi-ts.config.mts', 'openapi-ts.config.cts', 'openapi-ts.config.js', 'openapi-ts.config.mjs', 'openapi-ts.config.cjs'] },
  orval: { migrate: orval, configs: ['orval.config.ts', 'orval.config.mts', 'orval.config.js', 'orval.config.mjs', 'orval.config.cjs'] },
};

/** Folders never read: dependencies, builds and version control. */
const SKIPPED = new Set(['node_modules', 'dist', 'build', 'coverage', '.git', '.next', '.turbo']);
const READ = /(?:^package\.json|\.(?:[cm]?[jt]s|[jt]sx))$/u;

/** The paths under `directory` worth reading, `/`-separated, never entering a skipped folder. */
const walk = async (root: string, directory: string): Promise<string[]> => {
  const entries = await readdir(join(root, directory), { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry): Promise<string[]> => {
      const path = directory === '' ? entry.name : `${directory}/${entry.name}`;
      if (entry.isDirectory()) return SKIPPED.has(entry.name) ? [] : walk(root, path);
      return entry.isFile() && READ.test(entry.name) ? [path] : [];
    }),
  );
  return nested.flat();
};

/** The project's sources and `package.json`, by `/`-separated path. */
export const project = async (root: string): Promise<Files> => {
  const paths = await walk(root, '');
  return Object.fromEntries(await Promise.all(paths.map(async (path) => [path, await readFile(join(root, path), 'utf8')] as const)));
};

const firstConfig = async (root: string, names: readonly string[]): Promise<{ name: string; text: string } | undefined> => {
  const found = await Promise.all(names.map(async (name) => readFile(join(root, name), 'utf8').then((text) => ({ name, text }), () => undefined)));
  return found.find((one) => one !== undefined);
};

export const command = defineCommand({
  name: 'migrate',
  description: 'Switch from openapi-typescript, openapi-fetch, Hey API or orval: their config in, ours out',
  arguments: [
    { name: 'from', description: 'the tool to migrate from', choices: Object.keys(SOURCES), required: true },
    { name: 'dir', description: 'the project to migrate. Defaults to the current directory', required: false },
  ],
  options: {
    dryRun: { type: 'boolean', description: 'report what would change; write nothing' },
  },
  effects: 'idempotent',
  examples: [
    { command: 'apicontract migrate openapi-typescript', description: 'redocly.yaml and the scripts that run it, as apicontract.config.json' },
    { command: 'apicontract migrate orval --dry-run --json', description: 'the config, the edits and every finding, as data; nothing written' },
  ],
  run: async ({ args, options }) => {
    const root = resolve(args.dir ?? '');
    const source = SOURCES[args.from] as (typeof SOURCES)[string];
    const [config, files] = await Promise.all([firstConfig(root, source.configs), project(root)]);
    const result = source.migrate(config?.text, files);
    const written = result.config === undefined ? [] : [{ path: 'apicontract.config.json', owner: 'user' as const, content: configText(result.config) }];
    const dryRun = options.dryRun === true;
    const report = dryRun ? { written: [], unchanged: [], kept: [] } : await writeFiles(root, written);
    await Promise.all((dryRun ? [] : result.edits).map(async (edit) => writeFile(join(root, edit.path), edit.after)));
    return {
      changed: !dryRun && (report.written.length > 0 || result.edits.length > 0),
      read: config?.name ?? null,
      config: result.config ?? null,
      ...report,
      edited: result.edits.map((edit) => edit.path),
      findings: result.findings,
      uninstall: result.uninstall,
    };
  },
});
