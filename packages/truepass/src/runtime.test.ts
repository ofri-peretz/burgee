import { describe, expect, it } from 'vitest';

import { cwd, env, execPath, pid, setExitCode, writeErr } from './runtime.js';

describe("truepass's runtime seam", () => {
  it('reads this process', () => {
    expect(env()).toBe(process.env);
    expect(cwd()).toBe(process.cwd());
    expect(pid()).toBe(process.pid);
    expect(execPath()).toBe(process.execPath);
  });

  it('sets the exit code and writes to stderr', () => {
    const code = process.exitCode;
    const write = process.stderr.write;
    const seen: string[] = [];
    process.stderr.write = ((t: string) => seen.push(t) > 0) as typeof process.stderr.write;
    try {
      setExitCode(7);
      expect(process.exitCode).toBe(7);
      writeErr('hello');
    } finally {
      process.exitCode = code;
      process.stderr.write = write;
    }
    expect(seen).toEqual(['hello']);
  });
});
