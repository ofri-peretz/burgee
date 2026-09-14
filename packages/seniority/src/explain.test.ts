/** R4 (Y5) — one record, three renderings, and the text `explain` already printed is one of them. */
import { describe as suite, expect, it } from 'vitest';

import { explanation, explanationEvent, explanationJson, renderExplanation } from './explain.js';
import { explain, ORDER, resolve, type Layers } from './precedence.js';

const specs = {
  region: { type: 'string' as const, default: 'us-1' },
  token: { type: 'string' as const, env: 'MY_TOKEN' },
};
const layers: Layers = {
  flags: {},
  env: { APP_REGION: 'env' },
  envPrefix: 'APP',
  config: { path: './app.config.json', data: { region: 'cfg' }, lines: { region: 7 } },
  pkg: { path: 'package.json', data: { region: 'pkg' } },
};
const resolution = resolve(specs, layers);

suite('the record (R4)', () => {
  it('names the winner and every candidate, in ORDER, whether it was set or not', () => {
    const record = explanation('region', resolution);
    expect(record.winner?.source).toBe('env');
    expect(record.value).toBe('env');
    expect(record.candidates.map((c) => c.source)).toEqual([...ORDER]);
  });

  it('separates the candidates that lost from the ones that were never set — `--explain` must not conflate them', () => {
    const record = explanation('region', resolution);
    expect(record.lost.map((c) => c.source)).toEqual(['config', 'package', 'default']);
    expect(record.unset.map((c) => c.source)).toEqual(['flag']);
  });

  it('carries the line a file layer recorded, so the record locates the value and not just the file', () => {
    expect(explanation('region', resolution).candidates.find((c) => c.source === 'config')?.line).toBe(7);
  });

  it('says an option is undeclared rather than pretending it is unset', () => {
    const record = explanation('nope', resolution);
    expect(record.declared).toBe(false);
    expect(record.candidates).toEqual([]);
  });

  it('says unset for a declared option no source reached', () => {
    const record = explanation('token', resolve(specs, { flags: {}, env: {} }));
    expect(record.declared).toBe(true);
    expect(record.winner).toBeUndefined();
  });
});

suite('the three renderings are renderings, not three implementations (R4)', () => {
  it('the human text `explain` prints IS the record rendered — same function, same bytes', () => {
    expect(explain('region', resolution)).toBe(renderExplanation(explanation('region', resolution)));
  });

  it('--json is the record as data: the winner, and every candidate with its source, location and value', () => {
    const json = explanationJson(explanation('region', resolution));
    expect(json).toEqual({
      option: 'region',
      value: 'env',
      source: 'env',
      location: 'APP_REGION',
      candidates: [
        { source: 'flag', location: '--region', set: false },
        { source: 'env', location: 'APP_REGION', set: true, value: 'env' },
        { source: 'config', location: './app.config.json', line: 7, set: true, value: 'cfg' },
        { source: 'package', location: 'package.json', set: true, value: 'pkg' },
        { source: 'default', location: 'default', set: true, value: 'us-1' },
      ],
    });
  });

  it('the agent event is the same record under the family’s event shape', () => {
    const event = explanationEvent(explanation('region', resolution));
    expect(event.event).toBe('config.explain');
    expect(event.data.source).toBe('env');
    expect(event.data.candidates).toHaveLength(ORDER.length);
  });

  it('a plugin source it has never heard of renders from what the plugin declared (R13)', () => {
    const withVault = resolve(specs, { flags: {}, env: {}, sources: [{ source: 'vault', location: 'acme://vault/ci', rank: 5, data: { region: 'v' } }] });
    expect(renderExplanation(explanation('region', withVault))).toContain('from vault acme://vault/ci');
    expect(explanationJson(explanation('region', withVault)).source).toBe('vault');
  });
});
