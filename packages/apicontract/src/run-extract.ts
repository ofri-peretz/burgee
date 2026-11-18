/**
 * `apicontract extract` (apicontract-gen-command R9): run an extractor on the user's code and write
 * the spec it returns through the same {@link commit} as `gen`, as one generated JSON file.
 */
import { join } from 'node:path';

import { commit, type Report } from './run-commit.js';
import { type Config, loadConfig, relativePath, UsageError, validateConfig } from './run-config.js';
import { loadPlugins } from './run-load.js';

export interface ExtractOptions {
  readonly cwd: string;
  readonly config?: string | undefined;
  /** The extractor's name; the config's `extract.from` when absent. */
  readonly from?: string | undefined;
  /** The spec file to write; the config's `extract.out`, else `spec.json`. */
  readonly out?: string | undefined;
  readonly check?: boolean | undefined;
  readonly dryRun?: boolean | undefined;
  readonly force?: boolean | undefined;
}

export const extract = async (options: ExtractOptions): Promise<Report> => {
  // A config is optional here: without one, only the built-in extractors are known.
  const config: Config =
    (await loadConfig(options.cwd, options.config)) ??
    // Stryker disable next-line StringLiteral: equivalent, the file name only appears in a refusal, and a config with no plugins and no overlays refuses nothing; the root is set apart
    { ...validateConfig({}, join(options.cwd, 'apicontract.config.json')), root: options.cwd };
  const from = options.from ?? config.extract.from;
  if (from === undefined) throw new UsageError('extract needs an extractor. fix: pass --from <extractor>, or set `"extract": { "from": "…" }` in the config');
  const out = relativePath(options.out ?? config.extract.out ?? 'spec.json');
  if (out === undefined || !out.endsWith('.json')) throw new UsageError('--out must be a .json file inside the project. fix: pass --out spec.json');
  const host = await loadPlugins(config);
  const document = (await host.extractor(from).run(config.extract.options)) as unknown;
  const content = JSON.stringify(document, undefined, 2) as string | undefined;
  if (content === undefined) throw new Error(`the extractor "${from}" returned no document. fix: return the spec object from \`run(options)\``);
  return commit({ root: config.root, command: 'apicontract extract', produced: [{ target: 'extract', files: [{ path: out, content: `${content}\n`, owner: 'generated' }] }], findings: [], check: options.check, dryRun: options.dryRun, force: options.force });
};
