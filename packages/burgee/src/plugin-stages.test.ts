/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * D-122 — plugin hooks at `parse` (argv in, argv out, before the command is resolved) and
 * `shutdown` (once, as the program leaves by any path).
 */
import { describe, expect, it } from 'vitest';

import { defineCommand, defineProgram, type Plugin } from './index.js';
import { runBurgee } from './testing.js';

function program(plugins: Plugin[]): ReturnType<typeof defineProgram> {
  const manifest = defineProgram({
    name: 'app',
    version: '1.0.0',
    commands: [
      defineCommand({ name: 'deploy', arguments: [{ name: 'env', required: false }], effects: 'non_idempotent', run: ({ positionals }) => ({ env: positionals[0] ?? 'none' }) }),
      defineCommand({
        name: 'fail',
        effects: 'read_only',
        run: () => {
          throw new Error('boom');
        },
      }),
    ],
  });
  for (const plugin of plugins) manifest.use({ contract: 1, ...plugin });
  return manifest;
}

describe('the parse stage', () => {
  it('rewrites argv before the command is resolved, so an alias can name a command', async () => {
    const alias: Plugin = { name: 'alias', hooks: { parse: { handler: ({ argv }) => (argv?.[0] === 'd' ? ['deploy', ...argv.slice(1)] : undefined) } } };
    const r = await runBurgee(program([alias]), { argv: ['d', 'prod', '--json'] });
    expect(r.code).toBe(0);
    expect((JSON.parse(r.stdout) as { data: unknown }).data).toEqual({ env: 'prod' });
  });

  it('chains in enforce order, each plugin handed what the last one returned', async () => {
    const seen: string[][] = [];
    const first: Plugin = {
      name: 'first',
      enforce: 'pre',
      hooks: {
        parse: {
          handler: ({ argv }) => {
            seen.push(argv ?? []);
            return ['deploy', 'staging', '--json'];
          },
        },
      },
    };
    const second: Plugin = { name: 'second', hooks: { parse: { handler: ({ argv }) => void seen.push(argv ?? []) } } };
    const r = await runBurgee(program([second, first]), { argv: ['anything', '--json'] });
    expect(seen).toEqual([['anything', '--json'], ['deploy', 'staging', '--json']]);
    expect(JSON.parse(r.stdout)).toMatchObject({ data: { env: 'staging' } });
  });

  it('matches a filter against the typed argv', async () => {
    let fired = 0;
    const only: Plugin = { name: 'only', hooks: { parse: { filter: { command: /^fail/ }, handler: () => void (fired += 1) } } };
    await runBurgee(program([only]), { argv: ['deploy'] });
    await runBurgee(program([only]), { argv: ['fail'] });
    expect(fired).toBe(1);
  });

  it('refuses a return that is not an argv, naming the plugin', async () => {
    const bad: Plugin = { name: 'bad', hooks: { parse: { handler: () => 'deploy' } } };
    const r = await runBurgee(program([bad]), { argv: ['deploy'] });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain(`plugin "bad"'s parse hook returned string`);
  });
});

describe('the shutdown stage', () => {
  it('fires once after a command succeeds, with the command it ran', async () => {
    const calls: string[] = [];
    const log: Plugin = { name: 'log', hooks: { postRun: { handler: () => void calls.push('postRun') }, shutdown: { handler: ({ command }) => void calls.push(`shutdown ${command}`) } } };
    const r = await runBurgee(program([log]), { argv: ['deploy'] });
    expect(r.code).toBe(0);
    expect(calls).toEqual(['postRun', 'shutdown deploy']);
  });

  it('fires once after a command fails too', async () => {
    const calls: string[] = [];
    const log: Plugin = { name: 'log', hooks: { onError: { handler: () => void calls.push('onError') }, shutdown: { handler: () => void calls.push('shutdown') } } };
    const r = await runBurgee(program([log]), { argv: ['fail'] });
    expect(r.code).toBe(1);
    expect(calls).toEqual(['onError', 'shutdown']);
  });

  it('is refused under any other spelling, as every stage is', () => {
    expect(() => program([{ name: 'typo', hooks: { shutDown: { handler: () => undefined } } } as unknown as Plugin])).toThrow(/shutDown/);
  });
});
