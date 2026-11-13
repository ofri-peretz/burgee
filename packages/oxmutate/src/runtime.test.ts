import { readFileSync } from 'node:fs';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { ACTIVE_MUTANT_ENV, FILE_KEY, NAMESPACE, cwd, exit } from './runtime.js';

// The emitter that writes the other half of the contract.
const emitter = readFileSync(new URL('../native/src/instrument.rs', import.meta.url), 'utf8');

describe('the instrumentation contract', () => {
  it('names the namespace the native emitter writes', () => {
    expect(emitter).toContain(`pub const NAMESPACE: &str = "${NAMESPACE}";`);
    expect(NAMESPACE).toBe('__oxmutate__');
  });
  it('arms a mutant from the variable the emitted header reads', () => {
    expect(emitter).toContain(`g.process.env.${ACTIVE_MUTANT_ENV}`);
    expect(ACTIVE_MUTANT_ENV).toBe('__OXMUTATE_ACTIVE_MUTANT__');
  });
  it('prefixes collection-time coverage keys with file:', () => {
    expect(FILE_KEY).toBe('file:');
  });
});

const stayAlive = (() => undefined) as never;

describe('the process seam', () => {
  afterEach(() => vi.restoreAllMocks());

  it('cwd is the process working directory', () => {
    expect(cwd()).toBe(process.cwd());
  });
  it('exit hands the code to the process', () => {
    const spy = vi.spyOn(process, 'exit').mockImplementation(stayAlive);
    exit(3);
    expect(spy).toHaveBeenCalledWith(3);
  });
});

// The runner writes a mark and a record for every mutant run. Opening the file for each write cost
// 6.6 ms a run on a laptop whose endpoint scanner inspects every close, against 0.003 ms on an
// open descriptor, where the median test took 0.07 ms (burgee/paratext, 2026-11-11).
describe('the runner writes through open descriptors', () => {
  const runner = readFileSync(new URL('./runner.ts', import.meta.url), 'utf8');
  it('calls no fs function that opens and closes a file for one write', () => {
    expect(runner.match(/\b(?:writeFileSync|appendFileSync)\(/gu) ?? []).toEqual([]);
  });
  it('writes the mark through the one module that keeps it open', () => {
    expect(runner).toMatch(/progress \?\?= markWriter\(progressPath\)/u);
    const scheduler = readFileSync(new URL('./scheduler.ts', import.meta.url), 'utf8');
    expect(scheduler).toMatch(/const progress = markReader\(unit\.progress\)/u);
    expect(scheduler).toMatch(/const line = progress\.read\(\)/u);
  });
  it('closes what it opened when the run ends, for a pool whose workers are threads', () => {
    expect(runner).toMatch(/closeFiles\(\);\n\s+return super\.onAfterRunFiles/u);
  });
});
