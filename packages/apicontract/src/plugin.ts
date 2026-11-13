/**
 * The plugin host for apicontract's half of the family contract (spec.md R-PL; `plugin-contract`).
 *
 * A plugin is one plain object shared by the whole family. This host reads two of its keys,
 * `adapters` (an input format) and `generators` (spec → code), and ignores every other key
 * without complaining, which is what lets one object also carry burgee `commands` or a flagstaff
 * component. The shape is declared here, not imported from another layer.
 *
 * Nothing here touches the file system. A generator returns files and the caller writes them
 * (R-PL3), so a dry run, `--check` and overwrite safety live in one place and not in every plugin.
 */
import { type Contract } from './core/model.js';

/** The plugin contract version: one number for the family. */
export const CONTRACT = 1;

/** `generated` is rewritten on every run. `user` is written once and never touched again (R-PL4). */
export type Owner = 'generated' | 'user';

export interface GeneratedFile {
  /** Relative to the output folder, with `/` separators. */
  readonly path: string;
  readonly content: string;
  readonly owner: Owner;
}

export type Options = Readonly<Record<string, unknown>>;

/** An input format: a parsed document in, the model out. */
export interface Adapter {
  readonly description: string;
  readonly detect: (document: unknown) => boolean;
  readonly read: (document: unknown) => Contract;
}

/** The generator's static projection (R-PL5): a small document and exactly what it produces. */
export interface Sample {
  readonly document: unknown;
  readonly options?: Options;
  readonly files: readonly GeneratedFile[];
}

/** Spec → code: data plus one function (R-PL2). */
export interface Generator {
  readonly description: string;
  /** Names of the input formats it accepts, e.g. `openapi`. */
  readonly inputs: readonly string[];
  /** burgee option declarations, keyed by option name. */
  readonly options?: Readonly<Record<string, unknown>>;
  readonly sample: Sample;
  readonly run: (contract: Contract, options: Options) => readonly GeneratedFile[] | Promise<readonly GeneratedFile[]>;
}

/** The keys apicontract reads. Any object with these fields is a plugin here, whatever else it carries. */
export interface Plugin {
  readonly name: string;
  readonly contract?: number;
  readonly adapters?: Readonly<Record<string, Adapter>>;
  readonly generators?: Readonly<Record<string, Generator>>;
}

export type PluginErrorCode = 'E_PLUGIN_SCHEMA' | 'E_PLUGIN_CONTRACT' | 'E_NO_STATIC_PROJECTION' | 'E_NO_CONTRIBUTION';

/** A refusal says what is wrong and what to do about it: the family's one vocabulary. */
export class PluginError extends Error {
  readonly code: PluginErrorCode;
  readonly fix: string;

  constructor(code: PluginErrorCode, message: string, fix: string) {
    super(`${message}. fix: ${fix}`);
    this.name = 'PluginError';
    this.code = code;
    this.fix = fix;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function refuse(message: string, fix: string, code: PluginErrorCode = 'E_PLUGIN_SCHEMA'): never {
  throw new PluginError(code, message, fix);
}

const text = (value: unknown): value is string => typeof value === 'string' && value !== '';

/**
 * Whether a path stays inside the output folder. A generator is somebody else's code, and this is
 * the one place its output meets the user's disk.
 */
const inside = (path: string): boolean =>
  path !== '' && !path.startsWith('/') && !path.includes('\\') && !path.includes(':') && !path.split('/').some((part) => part === '..' || part === '.' || part === '');

/** Refuse a list of files a host must not write. `where` names who produced it. */
export const validateFiles = (files: unknown, where: string): GeneratedFile[] => {
  if (!Array.isArray(files)) refuse(`${where} did not return a list of files`, 'return `{ path, content, owner }[]`');
  const seen = new Set<string>();
  for (const file of files as unknown[]) {
    if (!isRecord(file) || typeof file.path !== 'string' || typeof file.content !== 'string') {
      refuse(`${where} returned a file without a path and content`, 'each file is `{ path, content, owner }`, both strings');
    }
    if (!inside(file.path)) {
      refuse(`${where} returned the path "${file.path}", which leaves the output folder`, 'use a relative path with `/` separators and no `..`');
    }
    if (file.owner !== 'generated' && file.owner !== 'user') {
      refuse(`${where} returned "${file.path}" without an owner`, 'say `owner: "generated"` (rewritten every run) or `owner: "user"` (written once)');
    }
    if (seen.has(file.path)) refuse(`${where} returned "${file.path}" twice`, 'return each path once');
    seen.add(file.path);
  }
  return files as GeneratedFile[];
};

const validateAdapter = (adapter: unknown, where: string): void => {
  if (!isRecord(adapter) || !text(adapter.description) || typeof adapter.detect !== 'function' || typeof adapter.read !== 'function') {
    refuse(`${where} is not an adapter`, 'an adapter is `{ description, detect(document), read(document) }`');
  }
};

const validateGenerator = (generator: unknown, where: string): void => {
  if (!isRecord(generator) || !text(generator.description) || typeof generator.run !== 'function') {
    refuse(`${where} is not a generator`, 'a generator is `{ description, inputs, sample, run(contract, options) }`');
  }
  const { inputs, options, sample } = generator;
  if (!Array.isArray(inputs) || inputs.length === 0 || !inputs.every((input) => text(input))) {
    refuse(`${where} does not say which input formats it accepts`, 'add `inputs: ["openapi"]`');
  }
  if (options !== undefined && !isRecord(options)) refuse(`${where}: options must be an object`, 'map an option name to its burgee declaration');
  if (!isRecord(sample) || !('document' in sample)) {
    refuse(`${where} has no sample`, 'add `sample: { document, files }`: a small document and exactly the files it produces', 'E_NO_STATIC_PROJECTION');
  }
  if (sample.options !== undefined && !isRecord(sample.options)) refuse(`${where}: sample.options must be an object`, 'pass the options the sample was generated with');
  validateFiles(sample.files, `${where}: sample`);
};

const each = (group: unknown, plugin: string, key: string, validateOne: (value: unknown, where: string) => void): void => {
  if (group === undefined) return;
  if (!isRecord(group)) refuse(`plugin "${plugin}": ${key} must be an object`, `map a name to each of the ${key}`);
  for (const [name, value] of Object.entries(group)) validateOne(value, `plugin "${plugin}": ${key}.${name}`);
};

/** Refuse, at the door, a plugin this host cannot use. */
export function validate(plugin: unknown): asserts plugin is Plugin {
  if (!isRecord(plugin)) refuse('a plugin is a plain object', 'export an object, not a function or an array');
  const { name, contract } = plugin;
  if (!text(name)) refuse('a plugin needs a name', 'add `name: "…"`: it is how a refused plugin is reported');
  if (contract !== undefined && (!Number.isInteger(contract) || (contract as number) < 1 || (contract as number) > CONTRACT)) {
    refuse(`plugin "${name}" declares contract ${String(contract)}; this apicontract knows ${String(CONTRACT)}`, "upgrade apicontract, or lower the plugin's `contract`", 'E_PLUGIN_CONTRACT');
  }
  each(plugin.adapters, name, 'adapters', validateAdapter);
  each(plugin.generators, name, 'generators', validateGenerator);
}

/** A set of registered plugins. One per program run; tests make their own. */
export interface Host {
  readonly register: (plugin: unknown) => void;
  readonly plugins: () => readonly Plugin[];
  /** Read a parsed document with the adapter that recognises it. */
  readonly read: (document: unknown) => Contract;
  /** The generator registered under `target`. */
  readonly generator: (target: string) => Generator;
  /** Run a generator on a document and return the files it would write. */
  readonly generate: (target: string, document: unknown, options?: Options) => Promise<GeneratedFile[]>;
}

export const createHost = (): Host => {
  const order: Plugin[] = [];

  // Later wins, like ESLint flat config: the last plugin to name a generator or recognise a document is used.
  const latest = <T>(pick: (plugin: Plugin) => T | undefined): T | undefined => {
    for (const plugin of order.toReversed()) {
      const found = pick(plugin);
      if (found !== undefined) return found;
    }
    return undefined;
  };
  const names = (key: 'adapters' | 'generators'): string => {
    const all = [...new Set(order.flatMap((plugin) => Object.keys(plugin[key] ?? {})))].toSorted();
    return all.length === 0 ? 'none' : all.join(', ');
  };

  const read = (document: unknown, accepted?: readonly string[]): Contract => {
    const adapter = latest((plugin) =>
      Object.entries(plugin.adapters ?? {}).find(([name, candidate]) => (accepted?.includes(name) ?? true) && candidate.detect(document))?.[1],
    );
    if (adapter === undefined) {
      const wanted = accepted === undefined ? names('adapters') : accepted.join(', ');
      return refuse('no input format recognises this document', `pass one of: ${wanted}; or install the plugin that reads it`, 'E_NO_CONTRIBUTION');
    }
    return adapter.read(document);
  };

  const generator = (target: string): Generator => {
    // eslint-disable-next-line conventions/consistent-existence-index-check -- Own names only: `gen toString` must not find an inherited function
    const found = latest((plugin) => (plugin.generators !== undefined && Object.hasOwn(plugin.generators, target) ? plugin.generators[target] : undefined));
    if (found === undefined) {
      return refuse(`no generator is named "${target}"`, `use one of: ${names('generators')}; or install the plugin that provides it and add it to \`plugins\``, 'E_NO_CONTRIBUTION');
    }
    return found;
  };

  return {
    register: (plugin) => {
      validate(plugin);
      order.push(plugin);
    },
    plugins: () => order,
    read: (document) => read(document),
    generator,
    generate: async (target, document, options = {}) => {
      const chosen = generator(target);
      return validateFiles(await chosen.run(read(document, chosen.inputs), options), `generator "${target}"`);
    },
  };
};

export interface Finding {
  readonly generator: string;
  readonly path: string;
  readonly problem: 'missing' | 'unexpected' | 'different' | 'not deterministic';
  readonly fix: string;
}

type Rendered = ReadonlyMap<string, string>;

const FIXES = {
  'not deterministic': 'remove whatever changes between runs: time, random values, iteration order',
  unexpected: 'add the file to `sample.files`, or stop generating it',
  different: 'update `sample.files` to what `run` returns, or fix `run`',
  missing: 'generate the file, or remove it from `sample.files`',
} as const;

const problemWith = (content: string, again: string | undefined, declared: string | undefined): Finding['problem'] | undefined => {
  if (again !== content) return 'not deterministic';
  if (declared === undefined) return 'unexpected';
  return declared === content ? undefined : 'different';
};

/** Two runs of one generator against what its sample declares. */
const compare = (generator: string, first: Rendered, second: Rendered, declared: Rendered): Finding[] => {
  const findings: Finding[] = [];
  for (const [path, content] of first) {
    const problem = problemWith(content, second.get(path), declared.get(path));
    if (problem !== undefined) findings.push({ generator, path, problem, fix: FIXES[problem] });
  }
  for (const path of second.keys()) {
    if (!first.has(path)) findings.push({ generator, path, problem: 'not deterministic', fix: 'return the same files on every run' });
  }
  for (const path of declared.keys()) {
    if (!first.has(path)) findings.push({ generator, path, problem: 'missing', fix: FIXES.missing });
  }
  return findings;
};

// The owner is part of what a file is: the same bytes under another owner is a different result.
const render = (files: readonly GeneratedFile[]): Rendered => new Map(files.map((file) => [file.path, `${file.owner}\n${file.content}`]));

/**
 * `apicontract check <plugin>` (R-PL5): run every generator on its own sample, twice, and compare
 * both runs with the files the sample declares, byte for byte. It proves the output is what the
 * author says it is, and that it is the same on every run.
 */
export const checkPlugin = async (plugin: unknown): Promise<Finding[]> => {
  validate(plugin);
  const host = createHost();
  host.register(plugin);
  const checkOne = async ([name, generator]: [string, Generator]): Promise<Finding[]> => {
    const contract = host.read(generator.sample.document);
    const run = async (): Promise<Rendered> =>
      render(validateFiles(await generator.run(contract, generator.sample.options ?? {}), `generator "${name}"`));
    const first = await run();
    return compare(name, first, await run(), render(generator.sample.files));
  };
  const findings = await Promise.all(Object.entries(plugin.generators ?? {}).map(async (entry) => checkOne(entry)));
  return findings.flat();
};
