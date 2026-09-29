/**
 * `finish` — where the harness reads a `--json` run's envelope from (R2). On stdout, which is
 * where both success and a reported failure put it since D-140; on stderr's first line only for
 * a run that failed and left stdout empty, which is where a program that writes its own
 * envelope, or one built before D-140, put it.
 */
import { describe, expect, it } from 'vitest';

import { ExitCode } from './exit-code.js';
import { fakeRuntime, finish } from './testing-helpers.js';

const ran = (stdout: string, stderr: string): ReturnType<typeof fakeRuntime> => {
  const rt = fakeRuntime({ argv: ['go', '--json'] });
  rt.out.push(stdout);
  rt.err.push(stderr);
  return rt;
};

describe('finish reads the envelope', () => {
  it('from stderr’s first line when a failed run left stdout empty', () => {
    const r = finish(ran('', '{"ok":false,"error":{"code":2}}\nnot the envelope\n'), ExitCode.USAGE, 0);
    expect(r.json).toEqual({ ok: false, error: { code: 2 } });
    expect(r.code).toBe(ExitCode.USAGE);
  });
  it('from stdout when there is one, however the run ended', () => {
    expect(finish(ran('{"ok":false}\n', '{"stderr":true}\n'), ExitCode.RUNTIME, 0).json).toEqual({ ok: false });
  });
  it('from stdout on success even when it is empty, which is a parse failure, not a stderr read', () => {
    const r = finish(ran('', '{"ok":true}\n'), ExitCode.OK, 0);
    expect(r.code).toBe(ExitCode.RUNTIME);
    expect(r.stderr).toMatch(/--json output did not parse/);
  });
});
