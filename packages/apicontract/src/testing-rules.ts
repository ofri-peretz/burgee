/**
 * The eight rules of the conformance suite (apicontract-kit R2), one function each. A rule reads
 * what the suite observed and returns its failures; it never throws, so one broken rule cannot
 * hide another. The shared definition of done they check is `.sdlc/intents/apicontract/program.md`.
 */
import { type ContractFinding } from './core/model.js';
import { documentOf, type Extractor, type Finding, type GeneratedFile, type Generator, type Host, resultOf, validate, validateFiles } from './host.js';
import { unsafe } from './testing-owner.js';

export const RULES = ['schema', 'sample', 'deterministic', 'regeneration', 'roundtrip', 'fix-lines', 'paths', 'no-io'] as const;

export type Rule = (typeof RULES)[number];

/** One rule broken in one place, and what to do about it. */
export interface Failure {
  readonly rule: Rule;
  readonly where: string;
  readonly message: string;
  readonly fix: string;
}

/** What one generator call returned, or what it threw. */
export type Outcome = { readonly files: unknown; readonly findings: readonly ContractFinding[] } | { readonly error: unknown };

/** One generator call the suite made, on the sample or on a document derived from it. */
export interface Run {
  readonly where: string;
  readonly outcome: Outcome;
  /** The same call made a second time, where the rule is that it must not differ. */
  readonly again?: Outcome;
}

/** What `checkPlugin` reported, or what it threw. */
export type Checked = { readonly findings: readonly Finding[] } | { readonly error: unknown };

const MARK = 'fix: ';

const textOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** Whether a refusal says what to do about it. */
export const hasFix = (error: unknown): boolean => textOf(error).includes(MARK);

/** A thrown error as a failure: its own `fix:` line when it carries one, `fallback` when not. */
export const failureOf = (rule: Rule, where: string, error: unknown, fallback: string): Failure => {
  const text = textOf(error);
  const at = text.indexOf(MARK);
  if (at === -1) return { rule, where, message: text, fix: fallback };
  return { rule, where, message: text.slice(0, at).replace(/[.\s]+$/u, ''), fix: text.slice(at + MARK.length) };
};

/** Call a generator and keep what it returned or threw. */
export const outcome = async (call: () => unknown): Promise<Outcome> => {
  try {
    const { files, findings } = resultOf(await call());
    return { files, findings };
  } catch (error) {
    return { error };
  }
};

const isError = (value: Outcome): value is { readonly error: unknown } => 'error' in value;

/** `schema`: `host.validate` accepts the plugin, and it contributes something apicontract reads. */
export const schema = (plugin: unknown): Failure[] => {
  try {
    validate(plugin);
  } catch (error) {
    return [failureOf('schema', 'plugin', error, 'export the shape `Plugin` in apicontract describes')];
  }
  const { adapters = {}, generators = {}, extractors = {}, rules = {} } = plugin;
  if (Object.keys({ ...adapters, ...generators, ...extractors, ...rules }).length > 0) return [];
  return [{ rule: 'schema', where: `plugin "${plugin.name}"`, message: 'it contributes no adapter, generator, extractor or rule', fix: 'add `generators`, `extractors`, `adapters` or `rules`' }];
};

/** `sample`: each generator's run on its sample document returns exactly the files the sample declares. */
export const sample = (checked: Checked): Failure[] => {
  if ('error' in checked) return [failureOf('sample', 'sample', checked.error, 'make `run` succeed on its own `sample.document`')];
  return checked.findings
    .filter((finding) => finding.problem !== 'not deterministic')
    .map((finding) => ({ rule: 'sample', where: `${finding.generator}: ${finding.path}`, message: `the file is ${finding.problem}`, fix: finding.fix }));
};

/** What a run did, as text two runs can be compared by. */
const fingerprint = (side: Outcome): string => (isError(side) ? textOf(side.error) : JSON.stringify([side.files, side.findings]));

const same = (first: Outcome, second: Outcome): boolean => fingerprint(first) === fingerprint(second);

/** `deterministic`: two runs on one document return the same bytes, on the sample and on every corpus document. */
export const deterministic = (checked: Checked, runs: readonly Run[]): Failure[] => [
  ...('error' in checked ? [] : checked.findings.filter((finding) => finding.problem === 'not deterministic')).map(
    (finding): Failure => ({ rule: 'deterministic', where: `${finding.generator}: ${finding.path}`, message: 'two runs on the sample differ', fix: finding.fix }),
  ),
  ...runs
    .filter((run) => run.again !== undefined && !same(run.outcome, run.again))
    .map((run): Failure => ({ rule: 'deterministic', where: run.where, message: 'two runs on the same document differ', fix: 'remove whatever changes between runs: time, random values, iteration order' })),
];

/** One generator before and after a spec change. `after` is absent when the suite cannot change the sample. */
export interface Regeneration {
  readonly generator: string;
  readonly before: Outcome;
  readonly after: Outcome | undefined;
}

/** `regeneration`: after a spec change, the writer's owner rule leaves every user file as it was. */
export const regeneration = (cases: readonly Regeneration[]): Failure[] =>
  cases.flatMap(({ generator, before, after }): Failure[] => {
    const where = `generator "${generator}"`;
    if (after === undefined) {
      return [{ rule: 'regeneration', where, message: 'the suite cannot add an operation to this sample document', fix: 'pass `mutate` to `conformance`: a function that returns the sample document with one operation more' }];
    }
    for (const side of [before, after]) {
      if (isError(side)) return [failureOf('regeneration', where, side.error, 'make `run` succeed on the sample document with one operation more')];
    }
    const files = (side: Outcome): GeneratedFile[] => validateFiles((side as { files: unknown }).files, where);
    try {
      return unsafe(files(before), files(after)).map(({ path, problem }) => ({
        rule: 'regeneration',
        where: `${generator}: ${path}`,
        message: `the ${problem} when the spec changes`,
        fix: 'keep a user file the same whatever the spec says; put what follows the spec in a generated file it imports',
      }));
    } catch {
      // A path the host refuses is the `paths` rule's to report.
      return [];
    }
  });

/** `paths`: every file every run returned passes `validateFiles`, including on an operation id that tries to leave the folder. */
export const paths = (runs: readonly Run[]): Failure[] =>
  runs.flatMap((run) =>
    [run.outcome, run.again].flatMap((side): Failure[] => {
      if (side === undefined || isError(side)) return [];
      try {
        validateFiles(side.files, run.where);
        return [];
      } catch (error) {
        return [failureOf('paths', run.where, error, 'return relative paths with `/` separators')];
      }
    }),
  );

/** `fix-lines`: every refusal a run threw, and every finding it returned, says what to do about it. */
export const fixLines = (checked: Checked, runs: readonly Run[]): Failure[] => {
  const thrown = runs.flatMap((run) => [run.outcome, run.again].flatMap((side) => (side !== undefined && isError(side) ? [{ where: run.where, error: side.error }] : [])));
  // `checkPlugin` also runs each sample: what it threw is reported once, under the run that threw it first.
  if ('error' in checked && !thrown.some(({ error }) => textOf(error) === textOf(checked.error))) thrown.unshift({ where: 'sample', error: checked.error });
  const findings = runs.flatMap((run) => (isError(run.outcome) ? [] : run.outcome.findings.map((finding) => ({ where: run.where, finding }))));
  return [
    ...thrown
      .filter(({ error }) => !hasFix(error))
      .map(({ where, error }): Failure => ({ rule: 'fix-lines', where, message: `it refused without a fix line: ${textOf(error)}`, fix: 'end the message with `fix: <what to do>`, or throw a `PluginError`' })),
    ...findings
      .filter(({ finding }) => typeof finding.fix !== 'string' || finding.fix.trim() === '')
      .map(({ where, finding }): Failure => ({ rule: 'fix-lines', where, message: `its finding "${finding.code}" has no fix`, fix: 'give every finding a `fix`: what the user does about it' })),
  ];
};

type Dict = Record<string, unknown>;

/** Data as text with its object keys sorted, so two equal documents compare equal whatever their key order. */
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, inner: unknown) =>
    typeof inner === 'object' && inner !== null && !Array.isArray(inner) ? Object.fromEntries(Object.entries(inner as Dict).toSorted(([a], [b]) => a.localeCompare(b))) : inner,
  );

/** A contract after normalisation: its operations by id, each with its payloads, and nothing about where they were read from. */
const shape = (host: Host, document: unknown): string =>
  canonical(Object.fromEntries(host.read(document).operations.map((operation) => [operation.id, operation.payloads])));

/**
 * `roundtrip` (R-RT): `extract(gen(spec))` reads as the same contract as `spec`. The extractor runs
 * with its sample's options and `files`, the files the generator returned for its sample.
 */
export const roundtrip = async (host: Host, generators: readonly (readonly [string, Generator])[], extractor: Extractor): Promise<Failure[]> => {
  const one = async ([name, generator]: readonly [string, Generator]): Promise<Failure[]> => {
    const where = `generator "${name}"`;
    try {
      const files = validateFiles(resultOf(await generator.run(host.read(generator.sample.document), generator.sample.options ?? {})).files, where);
      const extracted = documentOf(await extractor.run({ ...extractor.sample.options, files })).document;
      if (shape(host, extracted) === shape(host, generator.sample.document)) return [];
      return [{ rule: 'roundtrip', where, message: 'extracting what it generated does not give back the sample contract', fix: 'make the extractor read every operation and payload the generator writes' }];
    } catch (error) {
      return [failureOf('roundtrip', where, error, 'make the extractor read the files the generator writes')];
    }
  };
  return (await Promise.all(generators.map(one))).flat();
};
