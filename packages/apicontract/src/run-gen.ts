/**
 * `apicontract gen` (apicontract-gen-command): load the config and its plugins, read the spec, run
 * every target's generator and write what they return through {@link commit}.
 */
import { join } from 'node:path';

import { type ContractFinding } from './core/model.js';
import { commit, type Report, under } from './run-commit.js';
import { type Config, ConfigError, loadConfig, UsageError } from './run-config.js';
import { readInput } from './run-input.js';
import { loadPlugins } from './run-load.js';
import { type Produced } from './run-map.js';

export interface GenOptions {
  /** Where a config is looked for, and what `--config` is relative to. */
  readonly cwd: string;
  readonly config?: string | undefined;
  /** Run only these targets; every target when absent or empty. */
  readonly targets?: readonly string[] | undefined;
  readonly check?: boolean | undefined;
  readonly dryRun?: boolean | undefined;
  readonly force?: boolean | undefined;
}

/** The config, or a refusal when there is none. */
export const requireConfig = async (cwd: string, explicit: string | undefined): Promise<Config> => {
  const config = await loadConfig(cwd, explicit);
  if (config === undefined) {
    throw new ConfigError(join(cwd, 'apicontract.config.json'), ['no config was found. fix: create apicontract.config.json with `input` and `targets`, or pass `--config`']);
  }
  return config;
};

/** The targets to run, in the config's order. */
const chosen = (config: Config, wanted: readonly string[] | undefined): string[] => {
  const names = Object.keys(config.targets);
  if (names.length === 0) throw new ConfigError(config.file, ['it has no `targets`. fix: add `"targets": { "types": { "generator": "types", "out": "src/generated" } }`']);
  if (wanted === undefined || wanted.length === 0) return names;
  const unknown = wanted.find((name) => !names.includes(name));
  if (unknown !== undefined) throw new UsageError(`no target is named "${unknown}". fix: pass --target with one of: ${names.join(', ')}`);
  return names.filter((name) => wanted.includes(name));
};

export const gen = async (options: GenOptions): Promise<Report> => {
  const config = await requireConfig(options.cwd, options.config);
  const { input } = config;
  if (input === undefined) throw new ConfigError(config.file, ['it has no `input`. fix: add `"input": "openapi.yaml"`, the spec to generate from']);
  const names = chosen(config, options.targets);
  const host = await loadPlugins(config);
  const document = readInput({ root: config.root, file: config.file, input, overlays: config.overlays });
  const results = await Promise.all(
    names.map(async (name) => {
      const target = config.targets[name] as Config['targets'][string];
      const result = await host.run(target.generator, document, target.options);
      return {
        produced: { target: name, files: result.files.map((file) => ({ ...file, path: under(target.out, file.path) })) },
        findings: result.findings.map((finding) => ({ ...finding, target: name })),
      };
    }),
  );
  const produced: Produced[] = results.map((result) => result.produced);
  const findings: (ContractFinding & { target: string })[] = results.flatMap((result) => result.findings);
  return commit({ root: config.root, command: 'apicontract gen', produced, findings, check: options.check, dryRun: options.dryRun, force: options.force });
};
