import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { ExitCode } from 'burgee';
import { runBurgee } from 'burgee/testing';
import { beforeAll, describe, expect, it } from 'vitest';

import { scratchDirs } from './__fixtures__/run/scratch-dir.js';
import { command, diff, type GitReader, noGit, toSarif, toText, uriOf } from './command-diff.js';
import { type Contract, type Payload } from './core/model.js';
import { compareContracts } from './diff-contract.js';

import { program } from './index.js';

const FIXTURES = fileURLToPath(new URL('__fixtures__/diff/', import.meta.url));
const OLD = join(FIXTURES, 'pets-old.yaml');
const NEW = join(FIXTURES, 'pets-new.yaml');
const TEXT = Symbol.for('burgee.text');

const text = (data: Record<string | symbol, unknown>): string => (data[TEXT] as () => string)();

const makeDir = scratchDirs();

const scratch = (files: Record<string, string>): string => {
  const dir = makeDir('apicontract-diff-');
  for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content);
  return dir;
};

const spec = (extra: string): string =>
  `openapi: 3.1.0\ninfo: { title: t, version: '1' }\npaths:\n  /a:\n    get:\n      operationId: a\n      responses:\n        '200':\n          content:\n            application/json:\n              schema: { type: object${extra} }\n`;

const tools = (query: object) => JSON.stringify({ tools: [{ name: 'search', inputSchema: { type: 'object', properties: { query } } }] });
const schema = (extra: string) => `$schema: https://json-schema.org/draft/2020-12/schema\ntype: object\nproperties:\n  id: { type: string${extra} }\n`;

describe('contractdiff diff, through burgee', () => {
  // burgee's first run loads its renderers lazily; paying that here keeps each case under 5 s.
  beforeAll(async () => {
    await runBurgee(program, { argv: ['--version'] });
  });

  it('is described for --help and the MCP tool list, and says whether it wrote anything', () => {
    expect(command.description).toBe('What a contract change breaks, and for whom, under the compatibility mode you pick');
    expect(command.effects).toBe('idempotent');
    expect(command.examples).toEqual([
      { command: 'contractdiff diff old.yaml new.yaml', description: 'what breaks for callers built on old.yaml' },
      { command: 'contractdiff diff old.yaml new.yaml --mode full --sarif', description: 'both directions, for code scanning' },
      { command: 'contractdiff diff releases/ openapi.yaml --transitive', description: 'what breaks for callers on any past release, the oldest named' },
    ]);
    expect(command.arguments).toEqual([
      { name: 'old', description: 'the contract before: a file, or git:<ref>:<path>' },
      { name: 'new', description: 'the contract after: a file, or git:<ref>:<path>' },
      {
        name: 'more',
        variadic: true,
        required: false,
        description: 'with --transitive: more contracts, oldest first; the last is the new one, and a directory stands for its files in version order',
      },
    ]);
    expect(command.options).toEqual({
      mode: { type: 'string', choices: ['backward', 'forward', 'full'], description: 'backward: old peers keep working; forward: the side may move first; full: both (default backward)' },
      side: { type: 'string', choices: ['caller', 'server'], description: 'whose code the question is about (default caller)' },
      sarif: { type: 'boolean', description: 'print SARIF 2.1.0 for code scanning instead of text' },
      changeset: { type: 'string', description: 'write .changeset/<hash>.md bumping this package by the verdict', placeholder: 'package' },
      decisions: {
        type: 'string',
        choices: ['warn', 'error', 'off'],
        description: "hold a change to the decision written in the contract: warn (default; prints, exit code unchanged), error (fails the run) or off. Read from the base ref's contractdiff.config.json first",
      },
      usage: { type: 'string', description: 'a JSON file of the operations and members callers use (or an contractdiff.map.json): a breaking change nobody uses is non-breaking', placeholder: 'file' },
      transitive: { type: 'boolean', description: 'compare the last contract with every one before it, not only the last: findings say which release they break' },
      level: { type: 'string', choices: ['file', 'package', 'wire-json', 'wire'], description: 'protobuf only: also judge the wire encoding with buf breaking at this category; its findings count as breaking' },
      dangerousBreaking: { type: 'boolean', description: 'report dangerous changes (a default changed, a value a reader may not expect) as breaking, so they fail the run' },
      today: { type: 'string', description: 'the date x-sunset is judged against (default: today, UTC)', placeholder: 'YYYY-MM-DD' },
    });
  });

  it('exits 1 on a breaking change, with the findings and a fix line in the --json envelope', async () => {
    const r = await runBurgee(program, { argv: ['diff', OLD, NEW, '--json'] });
    expect(r.code).toBe(ExitCode.RUNTIME);
    const { data } = r.json as { data: Record<string, unknown> };
    expect(data).toMatchObject({
      verdict: 'breaking',
      mode: 'backward',
      side: 'caller',
      old: OLD,
      new: NEW,
      summary: { breaking: 4, unknown: 0, 'non-breaking': 3 },
      exitCode: ExitCode.RUNTIME,
      fix: 'make each breaking change compatible as its own fix line says, or release it as a major version',
    });
    expect((data.findings as unknown[]).length).toBe(8);
  });

  it('prints text grouped by operation, each breaking finding with its fix', async () => {
    const r = await runBurgee(program, { argv: ['diff', OLD, NEW] });
    expect(r.code).toBe(ExitCode.RUNTIME);
    expect(r.stdout).toContain('breaking: 4 breaking, 0 unknown, 1 dangerous, 3 non-breaking (--mode backward --side caller)');
    expect(r.stdout).toContain('deletePet  #/paths/~1pets~1{id}/delete\n  breaking      api-removed-without-deprecation    "deletePet" -> -\n');
  });

  it('passes --mode and --side through, and refuses a mode it does not know', async () => {
    const r = await runBurgee(program, { argv: ['diff', OLD, NEW, '--mode', 'full', '--side', 'server', '--json'] });
    expect((r.json as { data: unknown }).data).toMatchObject({ mode: 'full', side: 'server', summary: { breaking: 5 } });
    expect((await runBurgee(program, { argv: ['diff', OLD, NEW, '--mode', 'sideways'] })).code).toBe(ExitCode.USAGE);
  });

  it('prints SARIF with --sarif', async () => {
    const r = await runBurgee(program, { argv: ['diff', OLD, NEW, '--sarif', '--decisions', 'off'] });
    const sarif = JSON.parse(r.stdout) as { version: string; runs: { results: { level: string }[] }[] };
    expect(sarif.version).toBe('2.1.0');
    expect(sarif.runs[0]?.results.map((result) => result.level)).toEqual(['error', 'error', 'error', 'error', 'warning', 'note', 'note', 'note']);
  });

  it('exits 0 when nothing breaks', async () => {
    const r = await runBurgee(program, { argv: ['diff', OLD, OLD] });
    expect(r.code).toBe(ExitCode.OK);
    expect(r.stdout).toContain(`no changes between ${OLD} and ${OLD}`);
  });
});

describe('diff', () => {
  it('reads files relative to cwd, JSON as well as YAML', () => {
    const dir = scratch({ 'old.json': JSON.stringify({ openapi: '3.1.0', paths: {} }), 'new.yaml': spec('') });
    const data = diff({ cwd: dir, old: 'old.json', new: 'new.yaml' });
    expect(data).toMatchObject({ verdict: 'non-breaking', summary: { 'non-breaking': 1 }, old: 'old.json', new: 'new.yaml' });
    expect(data).not.toHaveProperty('exitCode');
    expect(data).not.toHaveProperty('fix');
    expect(data).not.toHaveProperty('sarif');
    expect(data).not.toHaveProperty('changeset');
    expect(data.changed).toBe(false);
    expect(text(data)).toBe('non-breaking: 0 breaking, 0 unknown, 1 non-breaking (--mode backward --side caller)\n\na  #/paths/~1a/get\n  non-breaking  endpoint-added    - -> "a"');
  });

  it('exits 1 on an unknown change too: a keyword it cannot judge is never compatible', () => {
    const dir = scratch({ 'old.yaml': spec(', multipleOf: 2'), 'new.yaml': spec(', multipleOf: 3') });
    const data = diff({ cwd: dir, old: 'old.yaml', new: 'new.yaml' });
    expect(data).toMatchObject({ verdict: 'unknown', exitCode: ExitCode.RUNTIME, fix: 'make each unknown change compatible as its own fix line says, or release it as a major version' });
    expect(text(data)).toContain(
      '  unknown       ac-keyword-changed  response:200:application/json /multipleOf  2 -> 3\n                fix: review a response:200:application/json /multipleOf by hand',
    );
  });

  it('diffs an MCP tools/list snapshot: a narrower input breaks callers, under our ids', () => {
    const dir = scratch({ 'old.json': tools({ type: 'string' }), 'new.json': tools({ type: 'string', maxLength: 64 }) });
    const data = diff({ cwd: dir, old: 'old.json', new: 'new.json' });
    expect(data).toMatchObject({ verdict: 'breaking', findings: [{ id: 'ac-maxLength-set', operation: 'search', payload: 'arguments', direction: 'tool-call' }] });
  });

  it('diffs two JSON Schema documents', () => {
    const dir = scratch({ 'old.yaml': schema(''), 'new.yaml': schema(', format: uuid') });
    expect(diff({ cwd: dir, old: 'old.yaml', new: 'new.yaml' })).toMatchObject({ verdict: 'breaking', findings: [{ id: 'ac-format-set', pointer: '/properties/id/format' }] });
  });

  it('reads a git:<ref>:<path> side through the git reader, from cwd', () => {
    const calls: unknown[] = [];
    const git: GitReader = (ref, path, cwd) => {
      calls.push([ref, path, cwd]);
      return spec('');
    };
    const dir = scratch({ 'new.yaml': spec(', required: [id]') });
    const data = diff({ cwd: dir, old: 'git:origin/main:api/spec.yaml', new: 'new.yaml', git });
    // The base ref's config is asked for too (R12), after the sides; the reader here has it as the same text, which is no config.
    expect(calls).toEqual([
      ['origin/main', 'api/spec.yaml', dir],
      ['origin/main', 'contractdiff.config.json', dir],
    ]);
    expect(data).toMatchObject({ old: 'git:origin/main:api/spec.yaml', verdict: 'non-breaking' });
  });

  it('refuses a git side by default, with the command to run instead', () => {
    expect(() => noGit('HEAD~1', 'a.yaml', '.')).toThrow('cannot read `git:HEAD~1:a.yaml`: this build of contractdiff does not run git. fix: `git show HEAD~1:a.yaml > old.yaml` and diff that file');
    expect(() => diff({ cwd: '.', old: 'git:HEAD:a.yaml', new: 'b.yaml' })).toThrow('fix: `git show HEAD:a.yaml > old.yaml`');
    // Only a side that starts with `git:` is one.
    expect(() => diff({ cwd: scratch({}), old: 'my-git:HEAD:a.yaml', new: 'b.yaml', git: () => spec('') })).toThrow('ENOENT');
  });

  it('refuses what it cannot parse or read, with a fix line', () => {
    const dir = scratch({ 'bad.yaml': 'a: [', 'plain.yaml': 'just: data\n' });
    expect(() => diff({ cwd: dir, old: 'bad.yaml', new: 'bad.yaml' })).toThrow(/^cannot parse bad\.yaml: [\s\S]+\. fix: pass a JSON or YAML document$/);
    expect(() => diff({ cwd: dir, old: 'bad.yaml', new: 'bad.yaml' })).toThrow(expect.objectContaining({ cause: expect.any(Error) }));
    expect(() => diff({ cwd: dir, old: 'plain.yaml', new: 'plain.yaml' })).toThrow(
      'no input format reads plain.yaml. fix: pass a document one of these reads: openapi, swagger2, asyncapi, mcp, protobuf, jsonschema',
    );
  });

  it('writes a changeset whose bump follows the verdict, named by its content', () => {
    const dir = scratch({ 'a.yaml': spec(', maxProperties: 1'), 'b.yaml': spec(', maxProperties: 1, required: [id]'), 'c.yaml': spec('') });
    const breaking = diff({ cwd: dir, old: 'a.yaml', new: 'c.yaml', changeset: 'pets-api' });
    const file = breaking.changeset as string;
    expect(file).toMatch(/^\.changeset\/apicontract-diff-[0-9a-f]{8}\.md$/);
    expect(readFileSync(join(dir, file), 'utf8')).toBe(
      "---\n'pets-api': major\n---\n\nContract changes from a.yaml to c.yaml: breaking.\n\n- breaking: `ac-maxProperties-unset` in a response:200:application/json /maxProperties\n",
    );
    expect(breaking.changed).toBe(true);
    // The same input again: the same file, already there, so nothing changed.
    expect(diff({ cwd: dir, old: 'a.yaml', new: 'c.yaml', changeset: 'pets-api' })).toMatchObject({ changeset: file, changed: false });
    const minor = diff({ cwd: dir, old: 'a.yaml', new: 'b.yaml', changeset: 'pets-api' });
    expect(readFileSync(join(dir, minor.changeset as string), 'utf8')).toBe("---\n'pets-api': minor\n---\n\nContract changes from a.yaml to b.yaml: non-breaking.\n");
    expect(diff({ cwd: dir, old: 'a.yaml', new: 'a.yaml', changeset: 'pets-api' })).not.toHaveProperty('changeset');
    writeFileSync(join(dir, 'd.yaml'), spec(', maxProperties: 1, multipleOf: 2'));
    const unknown = diff({ cwd: dir, old: 'a.yaml', new: 'd.yaml', changeset: 'pets-api' });
    expect(readFileSync(join(dir, unknown.changeset as string), 'utf8')).toMatch(/^---\n'pets-api': major\n---\n\nContract changes from a\.yaml to d\.yaml: unknown\./);
    expect(readdirSync(join(dir, '.changeset'))).toHaveLength(3);
  });

  it('puts SARIF in the data and the text with --sarif', () => {
    const data = diff({ cwd: FIXTURES, old: 'pets-old.yaml', new: 'pets-new.yaml', sarif: true });
    expect(text(data)).toBe(JSON.stringify(data.sarif, undefined, 2));
  });
});

const toolDoc = (schema: Readonly<Record<string, unknown>>) => ({ format: 'mcp', document: {}, operations: [{ id: 't', source: '#/tools/0', payloads: [{ name: 'arguments', direction: 'tool-call' as const, schema, required: true }] }] });

describe('toSarif', () => {
  it('locates each result at its side’s file and operation, one rule per id', () => {
    const old = { format: 'mcp', document: {}, operations: [{ id: 't', source: '#/tools/0', payloads: [{ name: 'arguments', direction: 'tool-call' as const, schema: {}, required: true }] }] };
    const nu = { format: 'mcp', document: {}, operations: [{ id: 'u', source: '#/tools/0', payloads: [{ name: 'arguments', direction: 'tool-call' as const, schema: { multipleOf: 2 }, required: true }] }] };
    const sarif = toSarif(compareContracts(old, nu), { file: 'old.json' }, { file: 'new.json' });
    expect(sarif).toEqual({
      version: '2.1.0',
      $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
      runs: [
        {
          tool: { driver: { name: 'contractdiff diff', rules: [{ id: 'ac-operation-added' }, { id: 'ac-operation-removed' }] } },
          results: [
            {
              ruleId: 'ac-operation-removed',
              level: 'error',
              message: { text: 'breaking: t  "t" -> -. fix: keep accepting at t what the old contract accepted, or release this as a major version' },
              locations: [{ physicalLocation: { artifactLocation: { uri: 'old.json' } }, logicalLocations: [{ fullyQualifiedName: '#/tools/0' }] }],
            },
            {
              ruleId: 'ac-operation-added',
              level: 'note',
              message: { text: 'non-breaking: u  - -> "u". fix: nothing to do' },
              locations: [{ physicalLocation: { artifactLocation: { uri: 'new.json' } }, logicalLocations: [{ fullyQualifiedName: '#/tools/0' }] }],
            },
          ],
        },
      ],
    });
  });

  it('names a payload and pointer in the logical location, and warns on unknown', () => {
    const sarif = toSarif(compareContracts(toolDoc({ multipleOf: 2 }), toolDoc({ multipleOf: 3 })), { file: 'a' }, { file: 'b' }) as { runs: { results: { level: string; locations: { logicalLocations: unknown }[] }[] }[] };
    expect(sarif.runs[0]?.results[0]).toMatchObject({ level: 'warning', locations: [{ logicalLocations: [{ fullyQualifiedName: '#/tools/0 arguments/multipleOf' }] }] });
  });
});

const channel = (payloads: Payload[]): Contract => ({ format: 'asyncapi', document: {}, operations: [{ id: 'c', source: '#/c', payloads }] });

describe('uriOf', () => {
  it('gives a relative path with forward slashes, and an absolute one as a file: URL', () => {
    expect(uriOf('api/old.yaml')).toBe('api/old.yaml');
    expect(uriOf('api\\v1\\old.yaml')).toBe('api/v1/old.yaml');
    const absolute = join(tmpdir(), 'contracts', 'old yaml.json');
    expect(uriOf(absolute)).toBe(pathToFileURL(absolute).href);
    expect(uriOf(absolute)).toMatch(/^file:\/\/\/.*old%20yaml\.json$/);
  });

  it('is what --sarif puts in each location', async () => {
    const r = await runBurgee(program, { argv: ['diff', OLD, NEW, '--sarif'] });
    const sarif = JSON.parse(r.stdout) as { runs: { results: { locations: { physicalLocation: { artifactLocation: { uri: string } } }[] }[] }[] };
    expect(new Set(sarif.runs[0]?.results.map((result) => result.locations[0]?.physicalLocation.artifactLocation.uri))).toEqual(new Set([pathToFileURL(OLD).href, pathToFileURL(NEW).href]));
  });
});

describe('toText', () => {
  it('names a payload whose change is at its root without a trailing space', () => {
    const out = toText(compareContracts(channel([]), channel([{ name: 'message', direction: 'subscribe', schema: {}, required: true }])), 'a', 'b');
    expect(out.split('\n').at(-1)).toBe('  non-breaking  ac-payload-added  message  - -> {}');
  });

  it('says so when nothing changed', () => {
    expect(toText(compareContracts({ format: 'x', document: {}, operations: [] }, { format: 'x', document: {}, operations: [] }), 'a', 'b')).toBe('no changes between a and b');
  });
});
