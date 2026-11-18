/**
 * `apicontract migrate orval` (apicontract-kit R4): `orval.config.*` read as data. Each project
 * names an input and an output; the output's `client` maps to our targets, the models always
 * become `types`, and `mock: true` becomes `msw`. Every other output option is a finding.
 *
 * Config: https://github.com/orval-labs/orval/blob/master/docs/content/docs/reference/configuration/output.mdx
 * Examples: https://github.com/orval-labs/orval/blob/master/docs/content/docs/quick-start.mdx and
 * https://github.com/orval-labs/orval/blob/master/docs/content/docs/reference/configuration/full-example.mdx
 */
import { type ContractFinding } from './core/model.js';
import { isUnreadable, type Literal, readExport } from './migrate-literal.js';
import { type Config, editScripts, finding, type Files, type Migrate, scripts, type Target } from './migrate-shared.js';

/** orval `output.client` → our generators. */
const CLIENTS: ReadonlyMap<string, readonly string[]> = new Map([
  ['fetch', ['fetch']],
  ['axios', ['fetch']],
  ['axios-functions', ['fetch']],
  ['react-query', ['fetch', 'tanstack-query']],
  ['swr', ['fetch', 'swr']],
  ['zod', ['validator']],
  ['hono', ['hono']],
  ['mcp', ['mcp']],
]);

/** Clients we map, with what is lost on the way. */
const TRANSLATED: ReadonlyMap<string, string> = new Map([
  ['axios-functions', 'the `fetch` target, which calls `fetch` and not axios'],
  ['axios', 'the `fetch` target, which calls `fetch` and not axios'],
  ['zod', "the `validator` target, apicontract's own validators and not Zod"],
]);

/** orval's default client. */
const DEFAULT_CLIENT = 'axios-functions';

/** Output keys this migration reads; every other one is reported. */
const READ = new Set(['target', 'schemas', 'client', 'mock']);

const isDict = (value: unknown): value is Record<string, Literal> => typeof value === 'object' && value !== null && !Array.isArray(value) && !isUnreadable(value);

const text = (value: Literal): string => (isUnreadable(value) ? value.unreadable : JSON.stringify(value));

const dropped = (pointer: string, key: string): ContractFinding =>
  finding('option-dropped', `${pointer}/${key}`, `\`${key}\` has no counterpart in apicontract`, 'remove it, or carry it over by hand; `apicontract gen --help` lists what each target takes');

const unreadable = (pointer: string, value: Literal): ContractFinding =>
  finding('unreadable', pointer, `\`${text(value)}\` is not data this migration can read`, 'write the value out as a literal, or carry it over by hand');

/** A string, or the `target` of an object with its other keys reported. */
const targetOf = (value: Literal, pointer: string, findings: ContractFinding[], read: ReadonlySet<string>): string | undefined => {
  if (typeof value === 'string') return value;
  if (!isDict(value)) {
    if (value !== undefined) findings.push(unreadable(pointer, value));
    return undefined;
  }
  for (const key of Object.keys(value).filter((name) => !read.has(name))) findings.push(dropped(pointer, key));
  return typeof value.target === 'string' ? value.target : targetOf(value.target, `${pointer}/target`, findings, read);
};

/** The targets an orval output stands for: the models, the client, and the mocks. */
const targetsOf = (settings: Readonly<Record<string, Literal>>, out: string, pointer: string, findings: ContractFinding[]): Record<string, Target> => {
  const targets = new Map<string, Target>([['types', { generator: 'types', out: typeof settings.schemas === 'string' ? settings.schemas : out }]]);
  const client = settings.client ?? DEFAULT_CLIENT;
  const generators = typeof client === 'string' ? (CLIENTS.get(client) ?? []) : [];
  const translated = typeof client === 'string' ? TRANSLATED.get(client) : undefined;
  if (typeof client !== 'string') findings.push(unreadable(`${pointer}/output/client`, client));
  else if (translated !== undefined) findings.push(finding('client-translated', `${pointer}/output/client`, `the \`${client}\` client becomes ${translated}`, `check the call sites after \`apicontract gen\`, or keep orval for ${client}`));
  else if (generators.length === 0) findings.push(finding('client-dropped', `${pointer}/output/client`, `the \`${client}\` client has no apicontract target`, 'keep orval for it, or write the plugin: `apicontract plugin new`'));
  for (const generator of generators) targets.set(generator, { generator, out });
  if (settings.mock === true) targets.set('msw', { generator: 'msw', out });
  else if (settings.mock !== undefined && settings.mock !== false) findings.push(finding('option-dropped', `${pointer}/output/mock`, 'mock options other than `true` have no counterpart in apicontract', 'set `mock: true` and run the migration again, or carry the options over by hand'));
  findings.push(finding('imports-change', `${pointer}/output`, `the files under ${out} are written with apicontract's module names, not orval's`, `after \`apicontract gen\`, point imports of ${out} at the targets' files`));
  return Object.fromEntries(targets);
};

/** One orval project as ours. */
const project = (name: string, value: Literal, findings: ContractFinding[]): Config | undefined => {
  const pointer = `orval.config#/${name}`;
  if (!isDict(value)) {
    findings.push(unreadable(pointer, value));
    return undefined;
  }
  const { input, output, ...rest } = value;
  for (const key of Object.keys(rest)) findings.push(dropped(pointer, key));
  const path = targetOf(input, `${pointer}/input`, findings, new Set(['target']));
  const out = targetOf(output, `${pointer}/output`, findings, READ);
  if (path === undefined || out === undefined) {
    findings.push(finding('nothing-to-migrate', pointer, `the \`${name}\` project names no input or no output`, 'set `input` and `output` and run the migration again'));
    return undefined;
  }
  if (/^https?:\/\//u.test(path)) findings.push(finding('remote-input', 'apicontract.config.json#/input', `${path} is fetched over the network, and apicontract reads local files`, 'download the document into the project and point `input` at it'));
  return { input: path, targets: targetsOf(isDict(output) ? output : {}, out, pointer, findings) };
};

const BINARY = /^(\s*)(?:npx\s+)?orval(\s.*)?$/u;

/** The CLI form, `orval --input <spec> --output <file> [--client <name>]`, as the project it stands for. */
const fromFlags = (args: readonly string[]): Record<string, Literal> | undefined => {
  const pairs: [string, string][] = [];
  for (let index = 0; index + 1 < args.length; index += 2) pairs.push([(args[index] as string).replace(/^-+/u, ''), args[index + 1] as string]);
  const { input, output, client, ...rest } = Object.fromEntries(pairs);
  if (input === undefined) return undefined;
  return { cli: { input, output: output === undefined ? undefined : { target: output, ...(client === undefined ? {} : { client }) }, ...rest } };
};

export const migrate: Migrate = (configText, files) => {
  const findings: ContractFinding[] = [];
  const replaced = new Map<string, string>();
  let args: string[] | undefined;
  for (const [name, command] of Object.entries(scripts(files))) {
    const parts = command.split(/(\s*(?:&&|\|\||;)\s*)/u);
    const rewritten = parts
      .map((part) => {
        const found = BINARY.exec(part);
        if (found === null) return part;
        args ??= (found[2] ?? '').split(/\s+/u).filter((word) => word !== '');
        return `${found[1] as string}apicontract gen`;
      })
      .join('');
    if (rewritten !== command) replaced.set(name, rewritten);
  }
  const value = configText === undefined ? fromFlags(args ?? []) : readExport(configText);
  let config: Config | undefined;
  if (isDict(value)) {
    const [first, ...rest] = Object.entries(value);
    for (const [name] of rest) findings.push(finding('second-input', `orval.config#/${name}`, `the \`${name}\` project is a second input, and one apicontract.config.json reads one`, 'write a second apicontract.config.json for it in its own folder'));
    config = first === undefined ? undefined : project(first[0], first[1], findings);
    if (first === undefined) findings.push(finding('nothing-to-migrate', 'orval.config', 'the config names no project', 'add a project and run the migration again'));
  } else {
    findings.push(value === undefined ? finding('config-unreadable', 'orval.config', 'no orval.config file, or no `export default` in it', 'write apicontract.config.json by hand') : unreadable('orval.config', value));
  }
  const { edits, findings: unwritten } = editScripts(files, Object.fromEntries(replaced));
  return { config, edits, findings: [...findings, ...unwritten], uninstall: 'npm uninstall orval' };
};
