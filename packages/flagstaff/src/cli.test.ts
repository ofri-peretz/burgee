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
  writeFileSync(join(dir, 'nyan.mjs'), "export default { name: 'nyan', spinners: { nyan: { frames: ['≋', '≈', '~'], interval: 80, static: '~nyan~' } } };\n");
  writeFileSync(join(dir, 'bad.mjs'), "export default { name: 'bad', spinners: { bad: { frames: ['a'], interval: 80 } } };\n");
  writeFileSync(join(dir, 'box.mjs'), 'export default { name: \'boxy\', components: { box: { static: (s) => `[${s.phase}]` } } };\n');
  // #59 — both keys misspelled: the schema allows them (family keys), so nothing refuses this.
  writeFileSync(join(dir, 'typo.mjs'), "export default { name: 'typo', spinner: { pulse: { frames: ['a'], interval: 80, static: '.' } }, componets: { g: { static: (s) => s.phase } } };\n");
  // #59 — a component whose state is not `{ phase }`, with and without a sample of its own.
  writeFileSync(join(dir, 'gauge.mjs'), 'export default { name: \'weird\', components: { gauge: { static: (s) => `[${s.pct}%]` } } };\n');
  writeFileSync(join(dir, 'sampled.mjs'), 'export default { name: \'sampled\', components: { gauge: { sample: { running: { pct: 0 }, done: { pct: 100 } }, static: (s) => `[${s.pct}%]` } } };\n');
  // #59 — a component that throws on the state it is handed.
  writeFileSync(join(dir, 'throws.mjs'), 'export default { name: \'throws\', components: { g: { static: (s) => s.label.toUpperCase() } } };\n');
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('flagstaff check', () => {
  it('prints the plugin in all five modes side by side and exits 0', () => {
    const { code, stdout } = check('check', 'nyan.mjs');
    expect(code).toBe(0);
    // The census is the header and the verdict is the last line: `ok` is never printed
    // before the rendering that would justify it (#59).
    expect(stdout).toContain('nyan — 1 spinner, 0 borders, 0 components, 0 glyphs, 0 tokens\nspinner nyan\n');
    expect(stdout).toMatch(/\nnyan: ok\n$/);
    // U3: the style's own static projection is what `check` shows the author, not a glyph.
    expect(stdout).toContain('~nyan~');
    expect(stdout).toContain('  tty         ␛[?25l≋ working␛[1G␛[0J≈ working␛[1G␛[0J~ working␛[1G␛[0J≋ working␛[1G␛[0J✔ done⏎ ␛[?25h');
    expect(stdout).toContain('  pipe        ~nyan~ working⏎ ✔ done⏎ ');
    expect(stdout).toContain('  ci          ~nyan~ working⏎ ✔ done⏎ ');
    expect(stdout).toContain('  json        {"event":"spinner","state":{"text":"working"}}⏎ {"event":"spinner","state":{"text":"done","status":"ok"}}⏎ ');
    expect(stdout).toContain('  accessible  ~nyan~ working⏎ ✔ done⏎ ');
  });

  it('renders a component through its static projection', () => {
    const { code, stdout } = check('box.mjs');
    expect(code).toBe(0);
    expect(stdout).toContain('component box\n  sample      assumed {"running":{"phase":"running"},"done":{"phase":"done"}}');
    expect(stdout).toContain('  tty         ␛[?25l[running]␛[1G␛[0J[done]⏎ ␛[?25h\n  pipe        [running]⏎ [done]⏎ ');
  });

  it('refuses a spinner without a static projection: exit 1, the code and the fix', () => {
    const { code, stdout } = check('check', 'bad.mjs');
    expect(code).toBe(1);
    expect(stdout).toBe('E_NO_STATIC_PROJECTION: bad has no static projection\n  fix: give it a `static`: the text a pipe, an agent or a screen reader gets instead of the animation\n');
  });

  // #59 — the schema is `additionalProperties: true` on purpose (family keys), so nothing
  // refuses a misspelling. `check` is the surface that has to notice: an agent that ships
  // what this grades `ok` ships a plugin that contributes nothing.
  it('refuses a plugin whose keys are misspelled, instead of greenlighting it', () => {
    const { code, stdout } = check('check', 'typo.mjs');
    expect(code).toBe(1);
    expect(stdout).not.toContain('typo: ok');
    expect(stdout).toContain('typo — 0 spinners, 0 borders, 0 components, 0 glyphs, 0 tokens\n');
    expect(stdout).toContain('  unknown     componets, spinner — flagstaff reads none of these');
    expect(stdout).toContain('E_NO_CONTRIBUTION: typo registers, but contributes nothing flagstaff can render\n');
    expect(stdout).toMatch(/\n {2}fix: .*spinners, borders, components, glyphs and tokens/);
  });

  // #59 — the sample state was hard-coded and unstated, so a component of any other shape
  // rendered `[undefined%]` under a heading that claimed it was fine.
  it('names the state a component was rendered with, and takes the component’s own when it declares one', () => {
    const assumed = check('check', 'gauge.mjs');
    expect(assumed.code).toBe(0);
    expect(assumed.stdout).toContain('component gauge\n  sample      assumed {"running":{"phase":"running"},"done":{"phase":"done"}} — give the component a `sample` to choose its own\n');

    const own = check('check', 'sampled.mjs');
    expect(own.code).toBe(0);
    expect(own.stdout).toContain('component gauge\n  sample      from the component: {"running":{"pct":0},"done":{"pct":100}}\n');
    expect(own.stdout).toContain('  pipe        [0%]⏎ [100%]⏎ ');
  });

  // #59 — it used to print `<name>: ok`, then die with a bare message, no code and no fix.
  // `json` never calls `static` (projection.ts emits the state itself), so it is the one
  // mode that survives: naming the four that broke is the point of the line.
  it('a component that throws is a refusal with a code, a fix, and the modes it broke in', () => {
    const { code, stdout } = check('check', 'throws.mjs');
    expect(code).toBe(1);
    expect(stdout).not.toContain('throws: ok');
    expect(stdout).toContain("  tty         threw: Cannot read properties of undefined (reading 'toUpperCase')\n");
    expect(stdout).toContain('  json        {"event":"g","state":{"phase":"running"}}');
    expect(stdout).toContain('E_COMPONENT_THREW: g threw in tty, pipe, ci, accessible\n');
    expect(stdout).toMatch(/\n {2}fix: .*`sample: \{ running, done \}`/);
  });

  it('with no file, prints usage and exits 2', () => {
    const { code, stdout } = check();
    expect(code).toBe(2);
    expect(stdout).toBe('usage: flagstaff check <plugin-file>\n');
  });
});
