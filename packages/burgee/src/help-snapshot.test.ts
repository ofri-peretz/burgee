/**
 * PLAN 2.5.1 — a help screen is a drawing, and a drawing is a contract.
 *
 * This repository already decided that for `boxen`: every one of its ava cases is
 * `t.snapshot(box)`, and the compat-oracle's R2 gates a drawing case when the host's
 * contract *is* its output (`.sdlc/intents/output-stack-compat/design.md`). burgee's own
 * help had no snapshot at all — twenty by-construction fixes asserted once each, by a test
 * that names the property it is checking and therefore cannot see a change it was not
 * looking for. A snapshot sees all of them.
 *
 * Five command shapes × three widths. The widths are the plan's — 33, 80 and 120 — chosen
 * because that is where the layout changes rather than to sample it evenly: at 33 the term
 * column is clamped by `TERM_SHARE` and long terms drop their descriptions to the next
 * line, at 80 the ordinary case wraps, at 120 almost nothing wraps and the alignment is
 * what is on trial. The shapes are picked the same way: the difference between them is a
 * different decision in the renderer, not a different set of words.
 *
 * These snapshots are a record of what burgee draws, not a claim about what commander or
 * yargs draw — those are graded by `compat-oracle` against the incumbents' own suites.
 * When one of these changes, the question is "did I mean to redraw the screen", and the
 * answer is a reviewed diff, never `-u` on the way past.
 */
import { describe, expect, it } from 'vitest';

import { defineCommand, defineProgram, renderHelp } from './index.js';
import { type CommandNode, type Manifest } from './manifest.js';

const ok = (): string => 'ok';

/** The plan's three widths: clamped, ordinary, and roomy. */
const WIDTHS = [33, 80, 120] as const;

/**
 * Everything a help screen can carry, on one command: required and variadic arguments,
 * every option annotation in R4's order, a hidden option, a deprecated option, two
 * examples with and without a description, an environment section and an epilogue.
 */
const full = defineProgram({
  name: 'app',
  description: 'A fixture with every kind of help data, whose description is long enough to wrap at two of the three widths.',
  commands: [
    defineCommand({
      name: 'deploy',
      summary: 'Ship a build',
      description: 'Ship the current build to a target. This description is long enough that it must wrap at every width the renderer supports.',
      group: 'Release commands:',
      arguments: [
        { name: 'target', description: 'where to ship', required: true },
        { name: 'files', description: 'extra files', variadic: true, required: false, default: 'none' },
      ],
      options: {
        region: { type: 'string', description: 'the region', env: 'APP_REGION', choices: ['eu', 'us'], default: 'eu', placeholder: 'code' },
        force: { type: 'boolean', description: 'skip the confirmation', short: 'f' },
        legacy: { type: 'boolean', description: 'old flag', deprecated: '--force' },
        secret: { type: 'boolean', hidden: true },
      },
      examples: [
        { command: 'app deploy prod --region us', description: 'Ship to production in the US region, no confirmation.' },
        { command: 'app deploy staging' },
      ],
      epilogue: 'Deploys are logged at https://example.test/deploys.',
      effects: 'withheld',
      run: ok,
    }),
    defineCommand({ name: 'status', description: 'Show status', group: 'Release commands:', effects: 'withheld', run: ok }),
    defineCommand({ name: 'login', description: 'Sign in', effects: 'withheld', run: ok }),
    defineCommand({ name: 'old', description: 'Legacy', deprecated: true, effects: 'withheld', run: ok }),
    defineCommand({ name: 'hush', description: 'Never listed', hidden: true, effects: 'withheld', run: ok }),
  ],
});

/** A leaf with nothing but a name: the floor, where every section but Usage is omitted (R2). */
const bare = defineProgram({ name: 'app', commands: [defineCommand({ name: 'ping', effects: 'withheld', run: ok })] });

/**
 * Terms whose display width is not their code-unit count. This is the Job-1 fix pinned as
 * a drawing rather than as a property: the alignment test says the columns agree, the
 * snapshot says what they agree *on*.
 */
const wide = defineProgram({
  name: 'app',
  description: '宽 字符 的 命令 名 也要 对齐 到 同一 列',
  commands: [
    defineCommand({ name: 'deploy-service', description: 'ASCII: code units and columns agree', effects: 'withheld', run: ok }),
    defineCommand({ name: '部署', description: 'CJK: two code units, four columns', effects: 'withheld', run: ok }),
    defineCommand({ name: '🚀', description: 'emoji: two code units, two columns', effects: 'withheld', run: ok }),
  ],
});

function node(manifest: Manifest, path: string[]): CommandNode {
  const found = manifest.find(path);
  if (found === undefined) throw new Error(`fixture: no ${path.join(' ')}`);
  return found;
}

const shapes: { name: string; manifest: Manifest; node: CommandNode; verbose: boolean }[] = [
  { name: 'a group: grouped children, a deprecated one, a hidden one omitted', manifest: full, node: node(full, ['app']), verbose: false },
  { name: 'a leaf with every field', manifest: full, node: node(full, ['app', 'deploy']), verbose: false },
  { name: 'a leaf with every field, verbose', manifest: full, node: node(full, ['app', 'deploy']), verbose: true },
  { name: 'a leaf with nothing but a name', manifest: bare, node: node(bare, ['app', 'ping']), verbose: false },
  { name: 'terms wider than their code-unit count', manifest: wide, node: node(wide, ['app']), verbose: false },
];

describe('help is a drawing, and the drawing is pinned (PLAN 2.5.1)', () => {
  for (const shape of shapes) {
    for (const width of WIDTHS) {
      it(`${shape.name}, at ${width} columns`, () => {
        expect(renderHelp(shape.manifest, shape.node, { width, verbose: shape.verbose })).toMatchSnapshot();
      });
    }
  }
});
