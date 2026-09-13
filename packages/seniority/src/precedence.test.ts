/** commander-env V1–V3, V5, R2, R7 — one case per precedence pair and per upstream issue, on the pure resolver. */
import { describe, expect, it } from 'vitest';

import { ConfigError, envName, explain, resolve, screaming, type Layers } from './precedence.js';

const specs = {
  region: { type: 'string' as const, default: 'us-1', description: 'the region' },
  dryRun: { type: 'boolean' as const },
  token: { type: 'string' as const, env: 'MY_TOKEN' },
};
const base: Layers = { flags: {}, env: {}, envPrefix: 'APP' };
const config = { path: './app.config.json', data: { region: 'cfg' } };
const caught = (fn: () => unknown): ConfigError => {
  try {
    fn();
  } catch (e) {
    if (e instanceof ConfigError) return e;
  }
  throw new Error('expected a ConfigError');
};
const pkg = { path: 'package.json', data: { region: 'pkg' } };

describe('flag > env > config > package.json > default (V1)', () => {
  it('flag beats env', () => {
    const r = resolve(specs, { ...base, flags: { region: 'flag' }, env: { APP_REGION: 'env' } });
    expect(r.values['region']).toBe('flag');
    expect(r.provenance['region']).toEqual({ source: 'flag', location: '--region' });
  });
  it('env beats config', () => {
    const r = resolve(specs, { ...base, env: { APP_REGION: 'env' }, config });
    expect(r.values['region']).toBe('env');
    expect(r.provenance['region']).toEqual({ source: 'env', location: 'APP_REGION' });
  });
  it('config beats the package.json field', () => {
    const r = resolve(specs, { ...base, config, pkg });
    expect(r.provenance['region']).toEqual({ source: 'config', location: './app.config.json' });
  });
  it('the package.json field beats the default', () => {
    const r = resolve(specs, { ...base, pkg });
    expect(r.values['region']).toBe('pkg');
    expect(r.provenance['region']).toEqual({ source: 'package', location: 'package.json' });
  });
  it('the default is last, and carries no location', () => {
    const r = resolve(specs, base);
    expect(r.values['region']).toBe('us-1');
    expect(r.provenance['region']).toEqual({ source: 'default' });
  });
});

describe('env applies only to declared options, by their own names (V1, V2)', () => {
  it('never reaches an option the running command does not declare (yargs #873)', () => {
    const r = resolve({ region: specs.region }, { ...base, env: { APP_DRY_RUN: '1', APP_REGION: 'x' } });
    expect(Object.keys(r.values)).toEqual(['region']);
  });
  it('names come from the prefix in SCREAMING_SNAKE, never camel-cased back (yargs #2005)', () => {
    expect(screaming('dryRun')).toBe('DRY_RUN');
    expect(screaming('log-level')).toBe('LOG_LEVEL');
    expect(envName('dryRun', specs.dryRun, 'APP')).toBe('APP_DRY_RUN');
  });
  it('an explicit env name wins over the prefix (yargs #1655), and without a prefix there is none', () => {
    expect(envName('token', specs.token, 'APP')).toBe('MY_TOKEN');
    expect(envName('region', specs.region, undefined)).toBeUndefined();
  });
});

describe('booleans from env: one spelling each way (R7)', () => {
  it.each([
    ['1', true],
    ['true', true],
    ['yes', true],
    ['0', false],
    ['false', false],
    ['no', false],
  ])('%s → %s', (raw, want) => {
    expect(resolve(specs, { ...base, env: { APP_DRY_RUN: raw } }).values['dryRun']).toBe(want);
  });
  it('anything else is a CONFIG error naming the fix', () => {
    const e = caught(() => resolve(specs, { ...base, env: { APP_DRY_RUN: 'maybe' } }));
    expect(e.message).toBe('APP_DRY_RUN="maybe" is not a boolean');
    expect(e.hint).toBe('use APP_DRY_RUN=true or APP_DRY_RUN=false');
  });
  it('PREFIX_NO_X is rejected with the one spelling named (yargs #2501)', () => {
    const e = caught(() => resolve(specs, { ...base, env: { APP_NO_DRY_RUN: '1' } }));
    expect(e.message).toBe('APP_NO_DRY_RUN is not supported');
    expect(e.hint).toBe('set APP_DRY_RUN=false instead');
  });
});

describe('--explain (V3)', () => {
  it('names the winner and every candidate it beat, unset ones included', () => {
    const r = resolve(specs, { ...base, env: { APP_REGION: 'env' }, config, pkg });
    const text = explain('region', r);
    expect(text).toMatch(/^region = "env"   from env APP_REGION\n/);
    expect(text).toContain('flag --region (unset)');
    expect(text).toContain('config file ./app.config.json "cfg"');
    expect(text).toContain('package.json field in package.json "pkg"');
    expect(text).toContain('default "us-1"');
  });
  it('says so for an option that is not declared', () => {
    expect(explain('nope', resolve(specs, base))).toMatch(/not an option/);
  });
});
