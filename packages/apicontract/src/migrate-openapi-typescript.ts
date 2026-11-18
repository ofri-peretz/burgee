/**
 * `apicontract migrate openapi-typescript` (apicontract-kit R4): its CLI flags in `package.json`
 * scripts and its `redocly.yaml` `apis` become `apicontract.config.json` with the `types` target in
 * `openapi-typescript` compat mode. The output is the same, so no import changes; the scripts that
 * ran it run `apicontract gen` instead.
 *
 * Flags: https://github.com/openapi-ts/openapi-typescript/blob/main/docs/cli.md (§ Flags, § Multiple schemas).
 */
import { parse as parseYaml } from 'seniority/yaml';

import { type ContractFinding } from './core/model.js';
import { camel, type Config, commandParts, editScripts, finding, type Files, type Migrate, scripts, type Target } from './migrate-shared.js';

/** The flags `types` carries over in compat mode: every documented flag that shapes the output. */
const CARRIED = new Set([
  'additional-properties',
  'alphabetize',
  'array-length',
  'default-non-nullable',
  'properties-required-by-default',
  'empty-objects-unknown',
  'enum',
  'enum-values',
  'conditional-enums',
  'dedupe-enums',
  'exclude-deprecated',
  'export-type',
  'immutable',
  'path-params-as-types',
  'root-types',
  'root-types-no-schema-prefix',
  'root-types-keep-casing',
  'make-paths-enum',
  'generate-path-params',
  'read-write-markers',
]);

const ALIASES: ReadonlyMap<string, string> = new Map([
  ['-o', '--output'],
  ['-t', '--export-type'],
]);

/** Words that run a package's binary, dropped with it. */
const RUNNERS = new Set(['npx', 'bunx', 'pnpx', 'pnpm', 'yarn', 'npm', 'exec', 'dlx']);

/** The default output name when the incumbent printed to stdout. */
export const STDOUT_OUT = 'schema.ts';

/** One run of openapi-typescript, from a script or a `redocly.yaml` api. */
interface Run {
  readonly input: string | undefined;
  readonly out: string | undefined;
  readonly options: Readonly<Record<string, unknown>>;
  readonly pointer: string;
  readonly findings: readonly ContractFinding[];
}

/** A command line as words, quotes removed. */
const words = (command: string): string[] => [...command.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/gu)].map((match) => match[1] ?? match[2] ?? (match[3] as string));

const flagValue = (value: string | undefined): unknown => {
  if (value === undefined || value === 'true') return true;
  return value === 'false' ? false : value;
};

/** Read the words after `openapi-typescript`. */
const parseArgs = (args: readonly string[], pointer: string): { run: Run; check: boolean } => {
  let input: string | undefined;
  let out: string | undefined;
  let check = false;
  const options = new Map<string, unknown>();
  const findings: ContractFinding[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const word = args[index] as string;
    const equals = word.indexOf('=');
    const rawName = equals === -1 ? word : word.slice(0, equals);
    const inline = equals === -1 ? undefined : word.slice(equals + 1);
    const name = ALIASES.get(rawName) ?? rawName;
    const next = (): string | undefined => {
      if (inline !== undefined) return inline;
      index += 1;
      return args[index];
    };
    if (name === '>') out = next();
    else if (name === '--output') out = next();
    else if (name === '--check') check = true;
    else if (name.startsWith('--') && CARRIED.has(name.slice(2))) options.set(camel(name.slice(2)), flagValue(inline));
    else if (name === '--redocly') {
      findings.push(finding('option-dropped', pointer, `\`--redocly ${String(next())}\` names a config this migration did not read`, 'move its `apis` into `redocly.yaml` at the project root and run the migration again'));
    } else if (name.startsWith('-')) {
      findings.push(finding('option-dropped', pointer, `\`${word}\` is not an openapi-typescript flag apicontract carries`, 'remove it; `apicontract gen --help` lists what the types target takes'));
    } else input ??= word;
  }
  return { run: { input, out, options: Object.fromEntries(options), pointer, findings }, check };
};

/** Every openapi-typescript run in the scripts, and each script rewritten to `apicontract gen`. */
const fromScripts = (files: Files): { runs: Run[]; replaced: Record<string, string> } => {
  const runs: Run[] = [];
  const replaced = new Map<string, string>();
  for (const [name, command] of Object.entries(scripts(files))) {
    const parts = commandParts(command);
    const rewritten = parts.map((part) => {
      const list = words(part);
      const at = list.indexOf('openapi-typescript');
      if (at === -1) return part;
      const { run, check } = parseArgs(list.slice(at + 1), `package.json#/scripts/${name}`);
      runs.push(run);
      const before = list.slice(0, at);
      while (RUNNERS.has(before.at(-1) as string)) before.pop();
      return [...before, 'apicontract', 'gen', ...(check ? ['--check'] : [])].join(' ');
    });
    if (rewritten.join('') !== command) replaced.set(name, rewritten.join(''));
  }
  return { runs, replaced: Object.fromEntries(replaced) };
};

const isDict = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** One `redocly.yaml` api, when it has an `x-openapi-ts` block. */
const fromApi = (name: string, api: unknown): Run[] => {
  const pointer = `redocly.yaml#/apis/${name}`;
  if (!isDict(api) || !isDict(api['x-openapi-ts'])) return [];
  const { output, ...flags } = api['x-openapi-ts'];
  const options = new Map<string, unknown>();
  const dropped: ContractFinding[] = [];
  for (const [flag, value] of Object.entries(flags)) {
    const kebab = flag.replaceAll(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`);
    if (CARRIED.has(kebab)) options.set(camel(kebab), value);
    else dropped.push(finding('option-dropped', `${pointer}/x-openapi-ts/${flag}`, `\`${flag}\` is not an openapi-typescript option apicontract carries`, 'remove it; `apicontract gen --help` lists what the types target takes'));
  }
  return [{ input: typeof api.root === 'string' ? api.root : undefined, out: typeof output === 'string' ? output : undefined, options: Object.fromEntries(options), pointer, findings: dropped }];
};

/** Every `redocly.yaml` api with an `x-openapi-ts` block, and a finding for each setting left behind. */
const fromRedocly = (text: string): { runs: Run[]; findings: ContractFinding[] } => {
  const findings: ContractFinding[] = [];
  let parsed: unknown;
  try {
    parsed = parseYaml(text);
  } catch (error) {
    return { runs: [], findings: [finding('config-unreadable', 'redocly.yaml', `redocly.yaml is not YAML this migration reads: ${(error as Error).message}`, 'fix the YAML, or write apicontract.config.json by hand')] };
  }
  const root = isDict(parsed) ? parsed : {};
  for (const key of Object.keys(root).filter((name) => name !== 'apis')) {
    findings.push(finding('option-dropped', `redocly.yaml#/${key}`, `\`${key}\` configures Redocly, not the types`, 'keep redocly.yaml for `redocly lint`; apicontract does not read it'));
  }
  const runs = Object.entries(isDict(root.apis) ? root.apis : {}).flatMap(([name, api]) => fromApi(name, api));
  return { runs, findings };
};

/** The runs as one config: the first input, one `types` target per run that reads it. */
const assemble = (runs: readonly Run[]): { config: Config | undefined; findings: ContractFinding[] } => {
  const findings = runs.flatMap((run) => run.findings);
  const input = runs.find((run) => run.input !== undefined)?.input;
  if (input === undefined) {
    findings.push(finding('nothing-to-migrate', 'package.json#/scripts', 'no script runs openapi-typescript on a document, and redocly.yaml names no api with `x-openapi-ts`', 'run `apicontract plugin new` or write apicontract.config.json by hand'));
    return { config: undefined, findings };
  }
  if (/^https?:\/\//u.test(input)) {
    findings.push(finding('remote-input', 'apicontract.config.json#/input', `${input} is fetched over the network, and apicontract reads local files`, 'download the document into the project and point `input` at it'));
  }
  const targets = new Map<string, Target>();
  // A run with no input of its own (`npx openapi-typescript` beside redocly.yaml) runs the apis, read above.
  for (const run of runs.filter((one) => one.input !== undefined)) {
    if (run.input !== input) {
      findings.push(finding('second-input', run.pointer, `${run.input as string} is a second input, and one apicontract.config.json reads one`, 'write a second apicontract.config.json for it in its own folder'));
      continue;
    }
    if (run.out === undefined) {
      findings.push(finding('stdout-output', run.pointer, 'openapi-typescript printed to stdout, and apicontract writes a file', `the target writes ${STDOUT_OUT}: change \`out\` to where the types belong`));
    }
    const name = targets.size === 0 ? 'types' : `types-${String(targets.size + 1)}`;
    targets.set(name, { generator: 'types', out: run.out ?? STDOUT_OUT, options: { compat: 'openapi-typescript', ...run.options } });
  }
  return { config: { input, targets: Object.fromEntries(targets) }, findings };
};

export const migrate: Migrate = (configText, files) => {
  const scripted = fromScripts(files);
  const redocly = configText === undefined ? { runs: [], findings: [] } : fromRedocly(configText);
  const { config, findings } = assemble([...scripted.runs, ...redocly.runs]);
  const { edits, findings: unwritten } = editScripts(files, scripted.replaced);
  return { config, edits, findings: [...redocly.findings, ...findings, ...unwritten], uninstall: 'npm uninstall openapi-typescript' };
};
