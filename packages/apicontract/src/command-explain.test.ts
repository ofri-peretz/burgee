import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { defineProgram, ExitCode } from 'burgee';
import { runBurgee } from 'burgee/testing';
import { beforeAll, describe, expect, it } from 'vitest';

import { program } from './cli.js';
import { command, explain } from './command-explain.js';

const FIXTURE = new URL('__fixtures__/agents/pets.openapi.yaml', import.meta.url).pathname;
const failure = async (promise: Promise<unknown>): Promise<Error & { code?: string }> => promise.then(() => new Error('resolved'), (error: unknown) => error as Error);

const spec = (count: number) => ({ openapi: '3.1.0', paths: Object.fromEntries(Array.from({ length: count }, (_, at) => [`/p${String(at)}`, { get: { operationId: `op${String(at)}`, responses: {} } }])) });

describe('explain', () => {
  it('lists the operation ids in document order', async () => {
    expect(await explain({ cwd: '/', input: FIXTURE, list: true })).toEqual(['listPets', 'createPet', 'deletePet', 'getTree']);
  });

  it('explains one operation, with its Markdown as the text surface', async () => {
    const result = await explain({ cwd: '/', input: FIXTURE, operation: 'deletePet' });
    expect(result).toEqual({
      id: 'deletePet',
      format: 'openapi',
      source: '#/paths/~1pets~1{petId}/delete',
      method: 'DELETE',
      path: '/pets/{petId}',
      payloads: [
        { name: 'param:path:petId', direction: 'request', required: true, schema: { type: 'string' } },
        { name: 'response:204', direction: 'response', required: true, schema: false },
      ],
    });
    const text = (result as unknown as Record<symbol, () => string>)[Symbol.for('burgee.text')]?.();
    expect(text?.startsWith('# deletePet\n\n`DELETE /pets/{petId}`')).toBe(true);
    expect(Object.keys(result)).not.toContain('text');
  });

  it('caps under maxBytes', async () => {
    const result = (await explain({ cwd: '/', input: FIXTURE, operation: 'createPet', maxBytes: 600 })) as { truncated?: unknown };
    expect(JSON.stringify(result).length).toBeLessThanOrEqual(600);
    expect(result.truncated).toBeDefined();
  });

  it('refuses a missing operation, an unknown one and a bad budget, each with a fix', async () => {
    expect((await failure(explain({ cwd: '/', input: FIXTURE }))).message).toContain('fix: run `apicontract explain --list`');
    const unknown = await failure(explain({ cwd: '/', input: FIXTURE, operation: 'nope' }));
    expect(unknown.message).toBe('no operation is named "nope". fix: pass one of: listPets, createPet, deletePet, getTree (`--list` prints them all)');
    expect(unknown.code).toBe('USAGE');
    const budgets = await Promise.all([0, 1.5].map(async (maxBytes) => failure(explain({ cwd: '/', input: FIXTURE, operation: 'x', maxBytes }))));
    for (const refusal of budgets) expect(refusal.message).toContain('--max-bytes takes a whole number of bytes above 0');
  });

  it('shows ten ids, and an ellipsis only when there are more', async () => {
    const root = mkdtempSync(join(tmpdir(), 'explain-'));
    writeFileSync(join(root, 'many.json'), JSON.stringify(spec(11)));
    writeFileSync(join(root, 'ten.json'), JSON.stringify(spec(10)));
    expect((await failure(explain({ cwd: root, input: 'many.json', operation: 'nope' }))).message).toContain('op8, op9, … (`--list`');
    expect((await failure(explain({ cwd: root, input: 'ten.json', operation: 'nope' }))).message).toContain('op8, op9 (`--list`');
  });

  it('takes a budget of 1 byte as a budget, refused only because nothing fits it', async () => {
    expect((await failure(explain({ cwd: '/', input: FIXTURE, operation: 'getTree', maxBytes: 1 }))).name).toBe('BudgetError');
  });

  it('names --input in the refusal for a spec it cannot read', async () => {
    expect((await failure(explain({ cwd: '/', input: '/nope.json', list: true }))).message).toContain('--input cannot be used');
  });

  it("reads the config's input with its overlays when --input is absent, and refuses when there is neither", async () => {
    const root = mkdtempSync(join(tmpdir(), 'explain-'));
    expect(await failure(explain({ cwd: root, list: true }))).toMatchObject({ code: 'CONFIG' });
    expect((await failure(explain({ cwd: root, list: true }))).message).toBe(
      `${join(root, 'apicontract.config.json')} cannot be used:\n  - no spec was named. fix: pass --input <file>, or add \`"input"\` to apicontract.config.json`,
    );
    writeFileSync(join(root, 'apicontract.config.json'), JSON.stringify({ targets: {} }));
    expect(await failure(explain({ cwd: root, list: true }))).toMatchObject({ code: 'CONFIG' });
    writeFileSync(join(root, 'spec.json'), JSON.stringify({ openapi: '3.1.0', paths: { '/a': { get: { operationId: 'a', responses: {} } } } }));
    writeFileSync(
      join(root, 'rename.json'),
      JSON.stringify({ overlay: '1.0.0', info: { title: 't', version: '1' }, actions: [{ target: "$.paths['/a'].get", update: { operationId: 'renamed' } }] }),
    );
    writeFileSync(join(root, 'apicontract.config.json'), JSON.stringify({ input: 'spec.json', overlays: ['rename.json'] }));
    expect(await explain({ cwd: root, list: true })).toEqual(['renamed']);
  });
});

describe('apicontract explain, through burgee', () => {
  beforeAll(async () => {
    await runBurgee(program, { argv: ['--version'] });
  });

  it('is declared read-only, with the description --help and the MCP tool list show', () => {
    expect(command.description).toBe('One operation, message or tool, fully resolved and size-capped for an agent');
    expect(command.effects).toBe('read_only');
    expect(command.arguments).toEqual([{ name: 'operation', required: false, description: 'the operation id; `--list` prints them' }]);
    expect(command.options).toEqual({
      input: { type: 'string', description: 'the spec, JSON or YAML (default: `input` in apicontract.config.json)', placeholder: 'file' },
      list: { type: 'boolean', description: 'print the operation ids, one per line' },
      maxBytes: { type: 'number', description: 'cut the deepest schemas first until the JSON fits; the cuts are listed under `truncated`', placeholder: 'n' },
    });
  });

  it('answers --json with the { ok, data, meta } envelope', async () => {
    const r = await runBurgee(program, { argv: ['explain', 'getTree', '--input', FIXTURE, '--json'] });
    expect(r.stderr).toBe('');
    expect(r.code).toBe(ExitCode.OK);
    const envelope = r.json as { ok: boolean; data: { id: string; cycles: string[] }; meta: unknown };
    expect(Object.keys(envelope).toSorted()).toEqual(['data', 'meta', 'ok']);
    expect(envelope.ok).toBe(true);
    expect(envelope.data.id).toBe('getTree');
    expect(envelope.data.cycles).toEqual(['#/components/schemas/Node']);
    expect(typeof envelope.meta).toBe('object');
  });

  it('prints Markdown without --json, ids with --list, and keeps --max-bytes as its own option', async () => {
    const text = await runBurgee(program, { argv: ['explain', 'listPets', '--input', FIXTURE] });
    expect(text.stdout.startsWith('# listPets\n\n`GET /pets`')).toBe(true);
    expect((await runBurgee(program, { argv: ['explain', '--list', '--input', FIXTURE] })).stdout).toBe('listPets\ncreatePet\ndeletePet\ngetTree\n');
    const small = await runBurgee(program, { argv: ['explain', 'createPet', '--input', FIXTURE, '--max-bytes', '600', '--json'] });
    expect(small.code).toBe(ExitCode.OK);
    expect((small.json as { data: { truncated: { maxBytes: number } } }).data.truncated.maxBytes).toBe(600);
  });

  it('exits 2 with a fix on an unknown operation', async () => {
    const r = await runBurgee(defineProgram({ name: 'p', commands: [command] }), { argv: ['explain', 'nope', '--input', FIXTURE] });
    expect(r.code).toBe(ExitCode.USAGE);
    expect(r.stderr).toContain('fix: pass one of: listPets');
  });
});
