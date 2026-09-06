import { describe, expect, it } from 'vitest';

import { ExitCode } from './exit-code.js';
import { captureConsole, codeOf, fakeRuntime, finish, RuntimeExit, stripAnsi, swapEnv } from './testing.js';

describe('fakeRuntime', () => {
  it('captures both streams and reports the TTY-ness the test asked for', () => {
    const rt = fakeRuntime({ argv: ['x'], tty: { stdout: true } });
    rt.stdout.write('a');
    rt.stderr.write('b');
    expect(rt.out).toEqual(['a']);
    expect(rt.err).toEqual(['b']);
    expect(rt.isTTY).toEqual({ stdin: false, stdout: true, stderr: false });
  });

  it('exit unwinds with the code instead of ending the process', () => {
    const rt = fakeRuntime({ argv: [] });
    expect(() => rt.exit(ExitCode.CONFIG)).toThrow(RuntimeExit);
    try {
      rt.exit(ExitCode.CONFIG);
    } catch (e) {
      expect(codeOf(e)).toBe(ExitCode.CONFIG);
    }
  });

  it('turns a string stdin into a readable', async () => {
    const rt = fakeRuntime({ argv: [], stdin: 'hello\n' });
    let text = '';
    for await (const chunk of rt.stdin) text += String(chunk);
    expect(text).toBe('hello\n');
  });
});

describe('swapEnv (R7 lock)', () => {
  it('leaves process.env byte-identical after a run, even one that throws', () => {
    const before = JSON.stringify(process.env);
    const restore = swapEnv({ ONLY: 'this' });
    try {
      expect(process.env.ONLY).toBe('this');
      expect(process.env.PATH).toBeUndefined();
      throw new Error('the run failed');
    } catch {
      // the harness restores in finally; so does this test
    } finally {
      restore();
    }
    expect(JSON.stringify(process.env)).toBe(before);
  });

  it('is a no-op without an env to inject', () => {
    const before = JSON.stringify(process.env);
    swapEnv(undefined)();
    expect(JSON.stringify(process.env)).toBe(before);
  });
});

describe('captureConsole', () => {
  it('routes console output into the runtime and restores the real console', () => {
    const rt = fakeRuntime({ argv: [] });
    const original = console.log;
    const restore = captureConsole(rt);
    console.log('to', 'stdout');
    console.error('to stderr');
    restore();
    expect(rt.out).toEqual(['to stdout\n']);
    expect(rt.err).toEqual(['to stderr\n']);
    expect(console.log).toBe(original);
  });
});

describe('finish (R2)', () => {
  it('parses stdout under --json and fails the run when it does not parse', () => {
    const ok = fakeRuntime({ argv: ['--json'] });
    ok.out.push('{"a":1}\n');
    expect(finish(ok, ExitCode.OK, performance.now()).json).toEqual({ a: 1 });

    const bad = fakeRuntime({ argv: ['--json'] });
    bad.out.push('not json');
    const r = finish(bad, ExitCode.OK, performance.now());
    expect(r.code).toBe(ExitCode.RUNTIME);
    expect(r.stderr).toContain('--json output did not parse');
  });

  it('leaves json unset without --json', () => {
    const rt = fakeRuntime({ argv: [] });
    rt.out.push('{"a":1}');
    expect(finish(rt, ExitCode.OK, performance.now()).json).toBeUndefined();
  });
});

describe('codeOf and stripAnsi', () => {
  it('maps an error carrying an E1 exitCode, and RUNTIME otherwise', () => {
    expect(codeOf({ exitCode: ExitCode.USAGE })).toBe(ExitCode.USAGE);
    expect(codeOf({ exitCode: 99 })).toBe(ExitCode.RUNTIME);
    expect(codeOf(new Error('x'))).toBe(ExitCode.RUNTIME);
  });

  it('strips colour sequences and nothing else', () => {
    expect(stripAnsi('[31mred[0m plain')).toBe('red plain');
  });
});
