import { describe, expect, it } from 'vitest';

import { plugin as hono } from './plugin-extract-hono.js';
import { plugin as nest } from './plugin-extract-nest.js';
import { plugin as trpc } from './plugin-extract-trpc.js';
import { BUILTIN_EXTRACTORS, extractCommand, genCommand } from './run-command.js';

const writing = {
  check: { type: 'boolean', description: 'write nothing; exit 1 and list the files that are stale' },
  dryRun: { type: 'boolean', description: 'write nothing; print the diff a run would write' },
  force: { type: 'boolean', description: 'overwrite a generated file that was edited by hand' },
  config: { type: 'string', description: 'the config file (default: contractdiff.config.json, .mjs or .ts in this folder)', placeholder: 'path' },
};

describe('the declarations', () => {
  it('declares gen with the writing switches and a repeatable --target, as idempotent', () => {
    expect(genCommand).toMatchObject({ name: 'gen', description: 'Code from a spec, one plugin per target: TypeScript types, validators, NestJS modules', effects: 'idempotent' });
    expect(genCommand.options).toEqual({ ...writing, target: { type: 'string', multiple: true, description: 'run only this target (repeatable)', placeholder: 'name' } });
  });

  it('declares extract with the writing switches, --from and --out, as idempotent', () => {
    expect(extractCommand).toMatchObject({
      name: 'extract',
      description: 'A spec from your code, one plugin per source: Standard Schema exports (Zod 4, Valibot, ArkType, truefit), ts-rest contracts, routes declared with schemas',
      effects: 'idempotent',
    });
    expect(extractCommand.options).toEqual({
      ...writing,
      from: { type: 'string', description: 'the extractor to run: standard-schema, openapi-from-schemas, ts-rest, or a plugin\'s (default: `extract.from` in the config)', placeholder: 'extractor' },
      out: { type: 'string', description: 'the spec file to write (default: spec.json)', placeholder: 'file' },
    });
  });
});

describe('extract --help names only what runs', () => {
  it('lists the built-in extractors, and no framework whose extractor is still a stub', () => {
    expect(BUILTIN_EXTRACTORS).toEqual(['standard-schema', 'openapi-from-schemas', 'ts-rest']);
    // The NestJS, Hono and tRPC extractors are planned stubs: when one lands, name it in the description.
    expect([nest, hono, trpc]).toEqual([undefined, undefined, undefined]);
    expect(extractCommand.description).not.toMatch(/NestJS|Hono|tRPC/u);
  });
});
