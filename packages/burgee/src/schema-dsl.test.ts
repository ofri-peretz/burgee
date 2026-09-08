/**
 * commander-schema S1–S8 — declared once, derived everywhere: types inferred from the
 * spec, kebab-case on the command line, numbers that never become NaN, repeatable
 * options with a separator, choices enforced, relations validated before the handler, a
 * Standard Schema accepted as a type, and definition-time errors for the mistakes yargs
 * accepts silently.
 */
import { describe, expect, expectTypeOf, it } from 'vitest';

import { checkDefinition, defineCommand, defineProgram, type InferOptions, schemaOf, type StandardSchemaV1 } from './index.js';
import { runBurgee } from './testing.js';

/** A Standard Schema implementation in ten lines — what zod, valibot or arktype provide. */
const upperCase: StandardSchemaV1<string> = {
  '~standard': {
    version: 1,
    vendor: 'test',
    validate: (value) => (typeof value === 'string' && value === value.toUpperCase() ? { value } : { issues: [{ message: 'must be upper case' }] }),
  },
};

const onProd = (v: Record<string, unknown>): boolean => v['env'] === 'prod';
const deploy = defineCommand({
      name: 'deploy',
      options: {
        env: { type: 'string', choices: ['dev', 'prod'], required: true },
        region: { type: 'string', default: 'eu-1' },
        replicas: { type: 'number', minimum: 1, maximum: 20, integer: true, default: 1 },
        ratio: { type: 'number' },
        force: { type: 'boolean' },
        dryRun: { type: 'boolean' },
        tags: { type: 'string', multiple: true },
        ports: { type: 'number', multiple: true, separator: ':' },
        code: { type: 'string', schema: upperCase },
        config: { type: 'string' },
        inline: { type: 'string' },
      },
      relations: [{ atMostOneOf: ['config', 'inline'] }, { conflicts: ['dryRun', 'force'] }, { implies: ['force', onProd] }],
      run: ({ options }) => options,
    });
const program = defineProgram({ name: 'app', envPrefix: 'APP', commands: [deploy] });
const run = (argv: string[], env: Record<string, string> = {}) => runBurgee(program, { argv: ['deploy', '--json', ...argv], env });
const data = async (argv: string[], env?: Record<string, string>): Promise<Record<string, unknown>> => ((await run(argv, env)).json as { data: Record<string, unknown> }).data;
/** The E3 envelope's message, which under --json is on stderr. */
async function failure(argv: string[], env?: Record<string, string>): Promise<{ code: number; message: string; hint?: string }> {
  const r = await run(argv, env);
  const { error } = r.json as { error: { message: string; hint?: string } };
  return { code: r.code, ...error };
}

describe('types are derived from the declaration (S1)', () => {
  it('infers choices as a union, number as number, multiple as an array, and presence from required/default', () => {
    type O = InferOptions<NonNullable<(typeof deploy)['options']>>;
    expectTypeOf<O['env']>().toEqualTypeOf<'dev' | 'prod'>();
    expectTypeOf<O['region']>().toEqualTypeOf<string>();
    expectTypeOf<O['replicas']>().toEqualTypeOf<number>();
    expectTypeOf<O['ratio']>().toEqualTypeOf<number | undefined>();
    expectTypeOf<O['force']>().toEqualTypeOf<boolean | undefined>();
    expectTypeOf<O['tags']>().toEqualTypeOf<string[] | undefined>();
    expectTypeOf<O['ports']>().toEqualTypeOf<number[] | undefined>();
  });
  it('reaches the handler typed, without a generic', () => {
    defineCommand({
      name: 'typed',
      options: { level: { type: 'number', default: 1 }, mode: { type: 'string', choices: ['a', 'b'] } },
      run: ({ options }) => {
        expectTypeOf(options.level).toEqualTypeOf<number>();
        expectTypeOf(options.mode).toEqualTypeOf<'a' | 'b' | undefined>();
      },
    });
  });
});

describe('the command line is kebab-case, the key is camelCase (S5, yargs #1679)', () => {
  it('types --dry-run and reads options.dryRun; help, schema and env agree', async () => {
    expect(await data(['--env', 'dev', '--dry-run'])).toMatchObject({ dryRun: true });
    expect(schemaOf(program).commands[0]?.inputSchema.properties['dryRun']?.flag).toBe('--dry-run');
    expect(await data(['--env', 'dev'], { APP_DRY_RUN: 'true' })).toMatchObject({ dryRun: true });
  });
  it('rejects two keys that meet on the command line, and a repeated short alias, at definition time (yargs #887)', () => {
    expect(() => checkDefinition('x', { dryRun: { type: 'boolean' }, 'dry-run': { type: 'boolean' } })).toThrow(/both --dry-run/);
    expect(() => checkDefinition('x', { a: { type: 'boolean', short: 'v' }, b: { type: 'boolean', short: 'v' } })).toThrow(/both use -v/);
    expect(() => checkDefinition('x', { a: { type: 'text' as 'string' } })).toThrow(/unknown type "text"/);
    expect(() => checkDefinition('x', { a: { type: 'string', minimum: 1 } })).toThrow(/numeric bound/);
  });
});

describe('numbers (S3, yargs #1079)', () => {
  it('parses and enforces integer, minimum and maximum, each with the fix in the hint', async () => {
    expect(await data(['--env', 'dev', '--replicas', '3'])).toMatchObject({ replicas: 3 });
    const nan = await failure(['--env', 'dev', '--replicas', 'lots']);
    expect(nan.code).toBe(2);
    expect(nan.message).toBe('--replicas expects a number, got "lots"');
    expect((await failure(['--env', 'dev', '--replicas', '2.5'])).message).toMatch(/expects an integer/);
    expect((await failure(['--env', 'dev', '--replicas', '0'])).message).toMatch(/at least 1/);
    expect((await failure(['--env', 'dev', '--replicas', '99'])).hint).toBe('pass --replicas 20');
  });
  it('never lets NaN or Infinity through from env or the default path', async () => {
    expect((await failure(['--env', 'dev'], { APP_RATIO: 'Infinity' })).code).toBe(2);
    expect(await data(['--env', 'dev'], { APP_RATIO: '0.5' })).toMatchObject({ ratio: 0.5 });
  });
});

describe('a flag never consumes a value (S7, yargs #1532, #933)', () => {
  it('leaves the next word as a positional and rejects --force=value', async () => {
    const r = await runBurgee(program, { argv: ['deploy', '--json', '--env', 'prod', '--force', 'extra'] });
    expect((r.json as { data: Record<string, unknown> }).data).toMatchObject({ force: true });
    expect((await failure(['--env', 'prod', '--force=yes'])).code).toBe(2);
  });
});

describe('repeatable options with a separator (S8, yargs #846, #1318)', () => {
  it('collects repetitions and splits on the separator, from flags and from env', async () => {
    expect(await data(['--env', 'dev', '--tags', 'a', '--tags', 'b,c'])).toMatchObject({ tags: ['a', 'b', 'c'] });
    expect(await data(['--env', 'dev', '--ports', '80:443'])).toMatchObject({ ports: [80, 443] });
    expect(await data(['--env', 'dev'], { APP_TAGS: 'x, y' })).toMatchObject({ tags: ['x', 'y'] });
    expect((await failure(['--env', 'dev', '--ports', '80:x'])).message).toMatch(/expects a number/);
  });
});

describe('choices and Standard Schema are enforced (S1, S3, yargs #1186)', () => {
  it('rejects a value outside the choices, naming them', async () => {
    const r = await failure(['--env', 'staging']);
    expect(r.code).toBe(2);
    expect(r.message).toBe('--env must be one of dev, prod, got "staging"');
  });
  it('runs the Standard Schema on the parsed value and reports its issues as a usage error', async () => {
    expect(await data(['--env', 'dev', '--code', 'ABC'])).toMatchObject({ code: 'ABC' });
    const r = await failure(['--env', 'dev', '--code', 'abc']);
    expect(r.code).toBe(2);
    expect(r.message).toBe('--code: must be upper case');
  });
});

describe('relations, validated before choices and the handler (S2, S6)', () => {
  it('atMostOneOf, conflicts, and a value-aware implies (yargs #1093, #439, #1322)', async () => {
    expect((await failure(['--env', 'dev', '--config', 'a', '--inline', 'b'])).message).toMatch(/at most one of --config, --inline/);
    expect((await failure(['--env', 'dev', '--dry-run', '--force'])).message).toMatch(/--dry-run, --force cannot be used together/);
    expect((await failure(['--env', 'dev', '--force'])).message).toMatch(/--force is not allowed with these values/);
    expect(await data(['--env', 'prod', '--force'])).toMatchObject({ force: true });
  });
  it('checks relations before choices (yargs #1186): a bad choice with a conflict reports the conflict', async () => {
    expect((await failure(['--env', 'nope', '--dry-run', '--force'])).message).toMatch(/cannot be used together/);
  });
  it('exactlyOneOf and atLeastOneOf', async () => {
    const p = defineProgram({
      name: 'p',
      commands: [defineCommand({ name: 'x', options: { a: { type: 'boolean' }, b: { type: 'boolean' } }, relations: [{ exactlyOneOf: ['a', 'b'] }], run: () => 'ok' })],
    });
    expect((await runBurgee(p, { argv: ['x'] })).stderr).toMatch(/exactly one of --a, --b is required/);
    expect((await runBurgee(p, { argv: ['x', '--a', '--b'] })).stderr).toMatch(/drop all but one/);
    expect((await runBurgee(p, { argv: ['x', '--a'] })).code).toBe(0);
  });
});
