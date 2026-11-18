import { describe, expect, it } from 'vitest';

import { extractCommand, genCommand } from './run-command.js';

const writing = {
  check: { type: 'boolean', description: 'write nothing; exit 1 and list the files that are stale' },
  dryRun: { type: 'boolean', description: 'write nothing; print the diff a run would write' },
  force: { type: 'boolean', description: 'overwrite a generated file that was edited by hand' },
  config: { type: 'string', description: 'the config file (default: apicontract.config.json, .mjs or .ts in this folder)', placeholder: 'path' },
};

describe('the declarations', () => {
  it('declares gen with the writing switches and a repeatable --target, as idempotent', () => {
    expect(genCommand).toMatchObject({ name: 'gen', description: 'Code from a spec, one plugin per target: TypeScript types, validators, NestJS modules', effects: 'idempotent' });
    expect(genCommand.options).toEqual({ ...writing, target: { type: 'string', multiple: true, description: 'run only this target (repeatable)', placeholder: 'name' } });
  });

  it('declares extract with the writing switches, --from and --out, as idempotent', () => {
    expect(extractCommand).toMatchObject({ name: 'extract', description: 'A spec from your code, one plugin per source: validator schemas, NestJS, Hono', effects: 'idempotent' });
    expect(extractCommand.options).toEqual({
      ...writing,
      from: { type: 'string', description: 'the extractor to run (default: `extract.from` in the config)', placeholder: 'extractor' },
      out: { type: 'string', description: 'the spec file to write (default: spec.json)', placeholder: 'file' },
    });
  });
});
