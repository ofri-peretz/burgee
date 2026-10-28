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
