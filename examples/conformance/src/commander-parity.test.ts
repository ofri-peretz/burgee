/**
 * commander-compat X7 — the demo on real commander and on `burgee/commander`, byte for
 * byte: exit code, stdout and stderr, across the happy paths, every error class, help
 * at every level and version. A pass/fail suite tolerates formatting drift; this does not.
 */
import { describe, expect, it } from 'vitest';

import { HOSTS } from './hosts.js';

const CASES: string[][] = [
  ['greet', 'ada'],
  ['greet', 'ada', '--shout'],
  ['greet', 'ada', '--greeting', 'Yo'],
  ['greet', 'ada', '--greeting=Yo', '--shout'],
  ['config', 'get', 'user.name'],
  ['config', 'get', 'user.name', '--json'],
  ['config', 'get', 'nope'],
  ['fail'],
  ['fail', '--code', '3'],
  ['fail', '--code', '99'],
  ['confg'],
  ['greet'],
  ['greet', 'ada', 'extra'],
  ['greet', 'ada', '--nope'],
  ['greet', 'ada', '--shot'],
  ['config'],
  ['config', 'gett'],
  [],
  ['--help'],
  ['-h'],
  ['greet', '--help'],
  ['config', '--help'],
  ['config', 'get', '-h'],
  ['help', 'greet'],
  ['help'],
  ['--version'],
  ['-V'],
  ['--', 'greet'],
];

describe('X7 · burgee/commander is byte-identical to commander on the demo', () => {
  it.each(CASES.map((argv) => [argv.join(' ') || '(no arguments)', argv] as const))('%s', async (_label, argv) => {
    const [real, ours] = await Promise.all([HOSTS.commander({ argv }), HOSTS['burgee-commander']({ argv })]);
    expect({ code: ours.code, stdout: ours.stdout, stderr: ours.stderr }).toEqual({ code: real.code, stdout: real.stdout, stderr: real.stderr });
  });

  it('reads the env-bound option identically', async () => {
    const env = { DEMO_GREETING: 'Hi' };
    const [real, ours] = await Promise.all([HOSTS.commander({ argv: ['greet', 'ada'], env }), HOSTS['burgee-commander']({ argv: ['greet', 'ada'], env })]);
    expect(ours).toMatchObject({ code: real.code, stdout: real.stdout, stderr: real.stderr });
  });
});
