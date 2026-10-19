/**
 * commander-completions D2–D5 — the four scripts and the Fig spec are pinned by snapshot
 * (deterministic for a manifest). TAB never runs the program (D3): the scripts contain no call
 * to it and the handler's sentinel never appears. Each installed shell exercising its script
 * lives in `completions-shells.test.ts`, which runs after the parallel pool, alone
 * (windows-lane-holds R3c).
 */
import { describe, expect, it } from 'vitest';

import { renderCompletion, renderFigSpec, SHELLS } from './completions.js';
import { defineCommand, defineProgram } from './index.js';
import { runBurgee } from './testing.js';

const SENTINEL = 'HANDLER-RAN';
const program = defineProgram({
  name: 'demo',
  description: 'Fixture',
  commands: [
    defineCommand({
      name: 'greet',
      description: 'Greet someone',
      options: {
        shout: { type: 'boolean', description: 'uppercase', short: 's' },
        greeting: { type: 'string', description: 'the greeting word', choices: ['Hello', 'Hi'] },
        secret: { type: 'string', hidden: true },
      },
      effects: 'withheld',
      run: () => SENTINEL,
    }),
    defineCommand({
      name: 'config',
      description: 'Read configuration',
      commands: [defineCommand({ name: 'get', description: 'Print one value', options: { raw: { type: 'boolean' } }, effects: 'withheld', run: () => SENTINEL })],
    }),
    defineCommand({ name: 'hush', hidden: true, effects: 'withheld', run: () => SENTINEL }),
  ],
});

describe('completions are generated from the manifest (D2) and pinned (D4)', () => {
  it.each(SHELLS)('%s script is deterministic and mentions every visible command and option', (shell) => {
    const script = renderCompletion(program, shell);
    expect(script).toBe(renderCompletion(program, shell));
    // fish spells a long option `-l shout`; every other shell writes the dashes.
    for (const word of ['greet', 'config', 'get', 'shout', 'greeting', 'raw', 'json', 'help']) expect(script).toContain(word);
    expect(script).not.toContain('hush');
    expect(script).not.toContain('secret');
    expect(script).toMatchSnapshot();
  });

  it('never invokes the program: no script calls it, and TAB leaves no handler output (D3)', () => {
    for (const shell of SHELLS) {
      const script = renderCompletion(program, shell);
      expect(script).not.toMatch(/\bnode\b|\$\(demo|`demo|\bdemo (greet|config|hush)\b/);
      expect(script).not.toContain(SENTINEL);
    }
  });

  it('exports a Fig spec from the same walk (D5)', () => {
    const spec = renderFigSpec(program);
    expect(spec).toMatchObject({ name: 'demo', description: 'Fixture' });
    expect(spec.subcommands?.map((s) => s.name)).toEqual(['greet', 'config']);
    expect(spec.subcommands?.[0]?.options?.find((o) => o.name.includes('--greeting'))).toMatchObject({ args: { name: 'value', suggestions: ['Hello', 'Hi'] } });
    expect(spec).toMatchSnapshot();
  });

  it('is served as `completion <shell>` and `completion fig` by every program', async () => {
    const r = await runBurgee(program, { argv: ['completion', 'bash'] });
    expect(r.code).toBe(0);
    expect(r.stdout).toBe(renderCompletion(program, 'bash'));
    const fig = await runBurgee(program, { argv: ['completion', 'fig'] });
    expect(JSON.parse(fig.stdout)).toEqual(renderFigSpec(program));
    const bad = await runBurgee(program, { argv: ['completion', 'tcsh'] });
    expect(bad.code).toBe(2);
    expect(bad.stderr).toMatch(/bash\|zsh\|fish\|pwsh\|fig/);
  });
});
