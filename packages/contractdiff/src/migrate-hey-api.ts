/**
 * `contractdiff migrate hey-api` (apicontract-kit R4): `openapi-ts.config.*` (or the CLI flags in
 * a script) read as data, its plugins mapped to our targets one by one. A plugin with no target,
 * and every plugin option, is a finding.
 *
 * Config: https://github.com/hey-api/openapi-ts/blob/main/web/src/content/docs/docs/openapi/typescript/configuration.mdx
 * Plugins: the same folder, `plugins/*.mdx` and `clients/fetch.mdx`.
 */
import { type ContractFinding } from './core/model.js';
import { isUnreadable, type Literal, readExport } from './migrate-literal.js';
import { type Config, commandParts, editScripts, finding, type Files, type Migrate, scripts, type Target } from './migrate-shared.js';

/** Hey API plugin → our generator. */
const MAPPED: ReadonlyMap<string, string> = new Map([
  ['@hey-api/typescript', 'types'],
  ['@hey-api/sdk', 'fetch'],
  ['@hey-api/client-fetch', 'fetch'],
  ['@hey-api/schemas', 'json-schema'],
  ['@tanstack/react-query', 'tanstack-query'],
  ['swr', 'swr'],
  ['msw', 'msw'],
  ['fastify', 'fastify'],
  ['hono', 'hono'],
  ['nest', 'nest'],
  ['express', 'express'],
]);

/** Validator plugins: they become our `validator` target, which is not their library. */
const VALIDATORS = new Set(['zod', 'valibot', 'arktype', 'joi', 'yup', 'typebox', 'superstruct', 'ajv']);

/** What Hey API generates when `plugins` is not set. */
const DEFAULT_PLUGINS = ['@hey-api/typescript', '@hey-api/sdk'];

const POINTER = 'openapi-ts.config';

const isDict = (value: unknown): value is Record<string, Literal> => typeof value === 'object' && value !== null && !Array.isArray(value) && !isUnreadable(value);

const unreadable = (pointer: string, value: Literal): ContractFinding =>
  finding('unreadable', pointer, `\`${isUnreadable(value) ? value.unreadable : JSON.stringify(value)}\` is not data this migration can read`, 'write the value out as a literal, or carry it over by hand');

const dropped = (pointer: string, key: string): ContractFinding =>
  finding('option-dropped', `${pointer}/${key}`, `\`${key}\` has no counterpart in contractdiff`, 'remove it, or carry it over by hand; `contractdiff gen --help` lists what each target takes');

/** A string, the first of a list (the rest reported), or the `path` of an object (its other keys reported). */
const pathOf = (value: Literal, pointer: string, findings: ContractFinding[], what: 'input' | 'output'): string | undefined => {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    const [first, ...rest] = value as Literal[];
    rest.forEach((other, index) => findings.push(finding(`second-${what}`, `${pointer}/${String(index + 1)}`, `${JSON.stringify(other)} is a second ${what}, and one contractdiff.config.json has one`, 'write a second contractdiff.config.json for it in its own folder')));
    return pathOf(first, `${pointer}/0`, findings, what);
  }
  if (isDict(value)) {
    const { path, ...rest } = value;
    for (const key of Object.keys(rest)) findings.push(dropped(pointer, key));
    return pathOf(path, `${pointer}/path`, findings, what);
  }
  if (value !== undefined) findings.push(unreadable(pointer, value));
  return undefined;
};

/** Each plugin as a target, or a finding. */
const plugins = (list: readonly Literal[], output: string, findings: ContractFinding[]): Record<string, Target> => {
  const targets = new Map<string, Target>();
  list.forEach((entry, index) => {
    const pointer = `${POINTER}#/plugins/${String(index)}`;
    let name: Literal = entry;
    if (isDict(entry)) {
      const { name: named, ...options } = entry;
      name = named;
      for (const key of Object.keys(options)) findings.push(dropped(pointer, key));
    }
    if (typeof name !== 'string') {
      findings.push(unreadable(pointer, entry));
      return;
    }
    const generator = MAPPED.get(name) ?? (VALIDATORS.has(name) ? 'validator' : undefined);
    if (generator === undefined) {
      findings.push(finding('plugin-dropped', pointer, `the \`${name}\` plugin has no contractdiff target`, 'keep Hey API for it, or write the plugin: `contractdiff plugin new`'));
      return;
    }
    if (VALIDATORS.has(name)) {
      findings.push(finding('plugin-translated', pointer, `\`${name}\` schemas become the \`validator\` target, contractdiff's own validators, not ${name}'s`, `import the validators from the \`validator\` target's output, or keep Hey API for ${name}`));
    }
    targets.set(generator, { generator, out: output });
  });
  return Object.fromEntries(targets);
};

/** The CLI form, `openapi-ts -i <input> -o <output> -c <client>`, as the config it stands for. */
const fromFlags = (args: readonly string[]): Record<string, Literal> => {
  const config = new Map<string, Literal>();
  const list: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index] as string;
    const value = args[index + 1] ?? '';
    if (flag === '-i' || flag === '--input') config.set('input', value);
    else if (flag === '-o' || flag === '--output') config.set('output', value);
    else if (flag === '-c' || flag === '--client' || flag === '-p' || flag === '--plugins') list.push(...value.split(','));
    else {
      config.set(flag, flag);
      continue;
    }
    index += 1;
  }
  config.set('plugins', [...DEFAULT_PLUGINS, ...list]);
  return Object.fromEntries(config);
};

const BINARY = /^(\s*)(?:npx\s+)?(?:@hey-api\/)?openapi-ts(?:\s|$)/u;

/** The scripts that run Hey API, rewritten, and the flags of the first. */
const fromScripts = (files: Files): { replaced: Record<string, string>; args: string[] | undefined } => {
  const replaced = new Map<string, string>();
  let args: string[] | undefined;
  for (const [name, command] of Object.entries(scripts(files))) {
    const parts = commandParts(command);
    const rewritten = parts.map((part) => {
      const found = BINARY.exec(part);
      if (found === null) return part;
      const rest = part.slice(found[0].length).trim();
      args ??= rest === '' ? [] : rest.split(/\s+/u).filter((word) => word !== '\\');
      return `${found[1] as string}contractdiff gen`;
    });
    if (rewritten.join('') !== command) replaced.set(name, rewritten.join(''));
  }
  return { replaced: Object.fromEntries(replaced), args };
};

/** One Hey API config object as ours. */
const convert = (value: Literal, findings: ContractFinding[]): Config | undefined => {
  if (!isDict(value)) {
    findings.push(value === undefined ? finding('config-unreadable', POINTER, 'no `export default` or `module.exports` was found', 'write contractdiff.config.json by hand') : unreadable(POINTER, value));
    return undefined;
  }
  const { input, output, plugins: listed, ...rest } = value;
  for (const key of Object.keys(rest)) findings.push(dropped(`${POINTER}#`, key));
  const path = pathOf(input, `${POINTER}#/input`, findings, 'input');
  const out = pathOf(output, `${POINTER}#/output`, findings, 'output') ?? 'src/client';
  if (path === undefined || path === '') {
    findings.push(finding('nothing-to-migrate', `${POINTER}#/input`, 'the config names no input document', 'set `input` and run the migration again'));
    return undefined;
  }
  if (/^https?:\/\//u.test(path)) findings.push(finding('remote-input', 'contractdiff.config.json#/input', `${path} is fetched over the network, and contractdiff reads local files`, 'download the document into the project and point `input` at it'));
  else if (/^[\w-]+\/[\w-]+(?:[?@].*)?$/u.test(path)) findings.push(finding('registry-input', 'contractdiff.config.json#/input', `${path} is a Hey API Platform registry address`, 'download the document from the registry into the project and point `input` at it'));
  const list = Array.isArray(listed) ? (listed as Literal[]) : DEFAULT_PLUGINS;
  if (listed !== undefined && !Array.isArray(listed)) findings.push(unreadable(`${POINTER}#/plugins`, listed));
  findings.push(finding('imports-change', `${POINTER}#/output`, `the files under ${out} are written with contractdiff's module names, not Hey API's \`*.gen.ts\``, `after \`contractdiff gen\`, point imports of ${out}/*.gen at the targets' files`));
  return { input: path, targets: plugins(list, out, findings) };
};

export const migrate: Migrate = (configText, files) => {
  const findings: ContractFinding[] = [];
  const { replaced, args } = fromScripts(files);
  const flags = args === undefined ? undefined : fromFlags(args);
  let value: Literal = configText === undefined ? flags : readExport(configText);
  if (Array.isArray(value)) {
    const [first, ...rest] = value as Literal[];
    rest.forEach((_other, index) => findings.push(finding('second-input', `${POINTER}#/${String(index + 1)}`, 'a second config, and one contractdiff.config.json reads one input', 'write a second contractdiff.config.json for it in its own folder')));
    value = first;
  }
  const config = convert(value, findings);
  const { edits, findings: unwritten } = editScripts(files, replaced);
  return { config, edits, findings: [...findings, ...unwritten], uninstall: 'npm uninstall @hey-api/openapi-ts @hey-api/client-fetch' };
};
