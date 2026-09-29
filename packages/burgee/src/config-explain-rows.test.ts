/**
 * `config explain`'s table, row by row, against a resolver whose answer the test chooses: a
 * source with a line number, an option nothing set, `--config <path>` read as a flag rather
 * than as part of the command path, and a program with no command to explain.
 */
import { type Resolution } from 'seniority/precedence';
import { describe, expect, it, type Mock, vi } from 'vitest';

import { explainConfig } from './config-explain.js';
import { defineCommand, defineProgram } from './execute.js';
import { Manifest, type OptionSpec } from './manifest.js';

const program = defineProgram({
  name: 'app',
  config: true,
  commands: [defineCommand({ name: 'deploy', effects: 'withheld', options: { region: { type: 'string' }, tier: { type: 'string' } }, run: () => undefined })],
});

type Resolve = (specs: Record<string, OptionSpec>, flags: Record<string, unknown>) => Promise<Resolution>;
const answer = (resolution: Pick<Resolution, 'values' | 'provenance'>): Mock<Resolve> => vi.fn<Resolve>(async () => resolution as Resolution);

describe('config explain, row by row', () => {
  it('names the file and line a value came from, and a dash for a value nothing set', async () => {
    const resolve = answer({ values: { region: 'eu' }, provenance: { region: { source: 'config', location: 'app.config.yaml', line: 3 } } });
    const text = await explainConfig(program, ['deploy'], resolve);
    expect(text.split('\n').slice(1, 3)).toEqual(['  --region  eu  (config app.config.yaml:3)', '  --tier    —  (unset)']);
  });

  it('reads the value after --config as the file, not as a command word', async () => {
    const resolve = answer({ values: {}, provenance: {} });
    // A config file that happens to be named like a command: still the file, and the command
    // explained is the root, which takes no options.
    await explainConfig(program, ['--config', 'deploy'], resolve);
    expect(resolve).toHaveBeenLastCalledWith({}, { config: 'deploy' });
    await explainConfig(program, ['deploy', '--config', 'x.json'], resolve);
    expect(resolve).toHaveBeenLastCalledWith(expect.objectContaining({ region: expect.anything(), tier: expect.anything() }), { config: 'x.json' });
  });

  it('says a command takes no options, rather than printing an empty table', async () => {
    const text = await explainConfig(program, [], answer({ values: {}, provenance: {} }));
    expect(text).toMatch(/\n {2}\(this command takes no options\)\n$/);
  });

  it('explains nothing for a program with no root node, and does not throw', async () => {
    const m = new Manifest();
    m.rootPath = ['bare'];
    m.config = { name: 'bare' };
    const resolve = answer({ values: {}, provenance: {} });
    expect(await explainConfig(m, [], resolve)).toMatch(/\(this command takes no options\)/);
    expect(resolve).toHaveBeenCalledWith({}, {});
  });
});
