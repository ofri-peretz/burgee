/**
 * localised-human-surfaces R2 — a failure loads the localiser only for prose, and only when a
 * plugin carries `locales`: a program with no pack, or a caller asking for `--json`, never does.
 */
import { describe, expect, it, vi } from 'vitest';

import { ExitCode } from './exit-code.js';
import { reportFailure } from './failure.js';
import { type Manifest } from './manifest.js';

const localiserFor = vi.hoisted(() => vi.fn(() => ({ say: (english: string) => `«${english}»` })));
vi.mock('./locale.js', () => ({ localiserFor }));

const io = { out: { write: () => true }, err: { write: () => true, isTTY: true }, env: {} };
const failure = { code: ExitCode.RUNTIME, message: 'boom' };
const manifestWith = (plugins: object[]): Manifest => ({ rootPath: ['app'], plugins }) as unknown as Manifest;

describe('the language a failure is told in', () => {
  it('asks for no localiser when no plugin carries locales', async () => {
    localiserFor.mockClear();
    await reportFailure(failure, manifestWith([{ name: 'plain' }]), false, io);
    expect(localiserFor).not.toHaveBeenCalled();
  });

  it('asks for none under --json, even with a pack', async () => {
    localiserFor.mockClear();
    await reportFailure(failure, manifestWith([{ name: 'fr', locales: {} }]), true, io);
    expect(localiserFor).not.toHaveBeenCalled();
  });

  it('asks for one for prose when any plugin carries locales', async () => {
    localiserFor.mockClear();
    let err = '';
    await reportFailure(failure, manifestWith([{ name: 'plain' }, { name: 'fr', locales: {} }]), false, { ...io, err: { write: (s: string) => (err += s), isTTY: true } });
    expect(localiserFor).toHaveBeenCalledTimes(1);
    expect(err).toBe('error: «boom»\n');
  });
});
