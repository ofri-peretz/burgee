/**
 * `apicontract/testing` — the conformance suite (apicontract-kit R1–R2): the shared definition of
 * done (`.sdlc/intents/apicontract/program.md`) as one function a plugin's own test calls.
 *
 *     import { conformance } from 'apicontract/testing';
 *     it('conforms', async () => { await conformance(plugin); });
 *
 * It throws a `ConformanceError` listing every rule the plugin breaks, each with a `fix:` line, so
 * it runs the same under vitest, jest and `node:test`. It reads the plugin through the public host
 * API only, which is what lets a third-party plugin run the same suite as a built-in.
 */
import { type Contract } from './core/model.js';
import { checkPlugin, createHost, type Extractor, type Generator, type Host, type Plugin } from './host.js';
import { builtinAdapters } from './inputs.js';
import { ruleFailures } from './testing-lint.js';
import { changed, hostile } from './testing-probe.js';
import {
  type Checked,
  deterministic,
  type Failure,
  fixLines,
  outcome,
  paths,
  type Regeneration,
  regeneration,
  roundtrip,
  type Run,
  sample,
  schema,
} from './testing-rules.js';

export interface ConformanceOptions {
  /** More documents to run every generator on: each must give the same bytes twice, and safe paths. */
  readonly corpus?: readonly unknown[];
  /**
   * The sample document after a spec change, for the `regeneration` rule. The suite makes this
   * itself for an OpenAPI or Swagger sample (one operation and one property more); any other
   * format needs it.
   */
  readonly mutate?: (document: unknown) => unknown;
  /** The extract half, for the `roundtrip` rule: run with its sample's options plus `files`, what the generator wrote. */
  readonly extractor?: Extractor;
  /** The generator `extractor` pairs with. Every generator of the plugin, when absent. */
  readonly generator?: string;
}

/** Every rule a plugin broke. Its message is the list, one failure and its `fix:` line per entry. */
export class ConformanceError extends Error {
  readonly failures: readonly Failure[];

  constructor(plugin: string, failures: readonly Failure[]) {
    const lines = failures.map((failure) => `- ${failure.rule}: ${failure.where}: ${failure.message}\n  fix: ${failure.fix}`);
    const rules = new Set(failures.map((failure) => failure.rule)).size;
    super(`plugin "${plugin}" breaks ${String(rules)} conformance rule(s) in ${String(failures.length)} place(s):\n${lines.join('\n')}`);
    this.name = 'ConformanceError';
    this.failures = failures;
  }
}

/** Throw when anything failed. */
const refuse = (label: string, failures: readonly Failure[]): void => {
  if (failures.length > 0) throw new ConformanceError(label, failures);
};

/** A plugin's generators, by name. */
const generatorsOf = (plugin: Plugin): (readonly [string, Generator])[] => Object.entries(plugin.generators ?? {});

const checked = async (plugin: Plugin): Promise<Checked> => {
  try {
    return { findings: await checkPlugin(plugin) };
  } catch (error) {
    return { error };
  }
};

interface Observed {
  readonly runs: readonly Run[];
  readonly regeneration: Regeneration;
}

/** Every call the suite makes to one generator beyond `checkPlugin`'s, and its regeneration pair. */
const observe = async (host: Host, [name, generator]: readonly [string, Generator], options: ConformanceOptions): Promise<Observed> => {
  const settings = generator.sample.options ?? {};
  const on = async (document: unknown): Promise<Run['outcome']> => outcome(async () => generator.run(host.read(document), settings));
  const where = (what: string): string => `generator "${name}" ${what}`;
  const changedDocument = (options.mutate ?? changed)(generator.sample.document);
  const probe = hostile(generator.sample.document);
  const [before, after, escaping, empty, corpus] = await Promise.all([
    on(generator.sample.document),
    changedDocument === undefined ? undefined : on(changedDocument),
    probe === undefined ? undefined : on(probe),
    outcome(async () => {
      const contract: Contract = { ...host.read(generator.sample.document), operations: [] };
      return generator.run(contract, settings);
    }),
    Promise.all((options.corpus ?? []).map(async (document, index): Promise<Run> => ({ where: where(`on corpus document ${String(index)}`), outcome: await on(document), again: await on(document) }))),
  ]);
  const runs: Run[] = [
    { where: where('on its sample'), outcome: before },
    ...(after === undefined ? [] : [{ where: where('after a spec change'), outcome: after }]),
    ...(escaping === undefined ? [] : [{ where: where('on an operation id with "../" in it'), outcome: escaping }]),
    { where: where('on a contract with no operations'), outcome: empty },
    ...corpus,
  ];
  return { runs, regeneration: { generator: name, before, after } };
};

/**
 * Run the conformance suite on `plugin`. Resolves when it passes every rule; rejects with a
 * `ConformanceError` naming every rule it breaks. A plugin `host.validate` refuses is reported
 * under `schema` alone, since no other rule can run on it.
 */
export const conformance = async (plugin: unknown, options: ConformanceOptions = {}): Promise<void> => {
  const refused = schema(plugin);
  const name = (plugin as { name?: unknown } | null)?.name;
  const label = typeof name === 'string' ? name : 'unnamed';
  refuse(label, refused);
  const valid = plugin as Plugin;
  const host = createHost();
  // The built-in formats first, as `checkPlugin` does, so a sample reads without the plugin carrying an adapter.
  host.register({ name: 'apicontract', adapters: builtinAdapters });
  host.register(valid);
  const report = await checked(valid);
  const observed = await Promise.all(generatorsOf(valid).map(async (entry) => observe(host, entry, options)));
  const runs = observed.flatMap((one) => one.runs);
  const paired = generatorsOf(valid).filter(([generatorName]) => options.generator === undefined || generatorName === options.generator);
  // In the order of `RULES`, which is the order a report reads them.
  const failures = [
    ...sample(report),
    ...deterministic(report, runs),
    ...regeneration(observed.map((one) => one.regeneration)),
    ...(options.extractor === undefined ? [] : await roundtrip(host, paired, options.extractor)),
    ...fixLines(report, runs),
    ...paths(runs),
    ...ruleFailures(host, valid.rules ?? {}, options.corpus ?? []),
  ];
  refuse(label, failures);
};

export { type Failure, type Rule, RULES } from './testing-rules.js';
// The shapes a plugin is written against. The package has no public subpath for the host yet, and a
// plugin's own file and its conformance test both import from here (the `plugin new` scaffold does).
export { type Contract, type ContractFinding, type Operation, type Payload } from './core/model.js';
export { type Rule as LintRule, type RuleSample, type SampleFinding } from './lint-engine.js';
export { type LintNode } from './lint-select.js';
export { type Adapter, type Extractor, type GeneratedFile, type Generator, type GeneratorResult, type Options, type Plugin, PluginError } from './host.js';
