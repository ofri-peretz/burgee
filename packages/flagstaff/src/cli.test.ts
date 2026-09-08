/** R8 — `flagstaff check <file>`: a plugin file in, every contribution in every mode out; exit 1 with the fix on a refusal. */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
let dir: string;

function check(...args: string[]): { code: number; stdout: string } {
  try {
    return { code: 0, stdout: execFileSync(process.execPath, [cli, ...args], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) };
  } catch (e) {
    const { status, stdout } = e as { status: number; stdout: string };
    return { code: status, stdout };
  }
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'flagstaff-check-'));
  writeFileSync(join(dir, 'nyan.mjs'), "export default { name: 'nyan', spinners: { nyan: { frames: ['≋', '≈', '~'], interval: 80, static: '…' } } };\n");
  writeFileSync(join(dir, 'bad.mjs'), "export default { name: 'bad', spinners: { bad: { frames: ['a'], interval: 80 } } };\n");
  writeFileSync(join(dir, 'box.mjs'), 'export default { name: \'boxy\', components: { box: { static: (s) => `[${s.phase}]` } } };\n');
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('flagstaff check', () => {
  it('prints the plugin in all five modes side by side and exits 0', () => {
    const { code, stdout } = check('check', 'nyan.mjs');
    expect(code).toBe(0);
    expect(stdout).toContain('nyan: ok\nspinner nyan\n');
    expect(stdout).toContain('  tty         ␛[?25l≋ working␛[1G␛[0J≈ working␛[1G␛[0J~ working␛[1G␛[0J≋ working␛[1G␛[0J✔ done⏎ ␛[?25h');
    expect(stdout).toContain('  pipe        … working⏎ ✔ done⏎ ');
    expect(stdout).toContain('  ci          … working⏎ ✔ done⏎ ');
    expect(stdout).toContain('  json        {"event":"spinner","state":{"text":"working"}}⏎ {"event":"spinner","state":{"text":"done","status":"ok"}}⏎ ');
    expect(stdout).toContain('  accessible  … working⏎ ✔ done⏎ ');
  });

  it('renders a component through its static projection', () => {
    const { code, stdout } = check('box.mjs');
    expect(code).toBe(0);
    expect(stdout).toContain('component box\n  tty         ␛[?25l[running]␛[1G␛[0J[done]⏎ ␛[?25h\n  pipe        [running]⏎ [done]⏎ ');
  });

  it('refuses a spinner without a static projection: exit 1, the code and the fix', () => {
    const { code, stdout } = check('check', 'bad.mjs');
    expect(code).toBe(1);
    expect(stdout).toBe('E_NO_STATIC_PROJECTION: bad has no static projection\n  fix: give it a `static`: the text a pipe, an agent or a screen reader gets instead of the animation\n');
  });

  it('with no file, prints usage and exits 2', () => {
    const { code, stdout } = check();
    expect(code).toBe(2);
    expect(stdout).toBe('usage: flagstaff check <plugin-file>\n');
  });
});
