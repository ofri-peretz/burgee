/**
 * Lock — what `burgee/commander` puts on a user's start-up path, module by module.
 *
 * `commander-front-end-diet` (R3). `/docs/weight` prices the front-end as one number, and a
 * number says nothing about *which* module came back: `bellpull/cross-spawn` sat in the initial
 * load for a month at 4,981 B because the spawn was believed to need it synchronously, and the
 * eleven raises of `BUNDLED_CEILING['burgee/commander']` each priced a change without naming the
 * module it moved. So this bundles `export * from 'burgee/commander'` by the page's own method
 * (`--bundle --minify --format=esm --platform=node --splitting`) and walks the entry's
 * `import-statement` edges — the initial load, exactly what `initialBytes` counts — and holds two
 * things:
 *
 *   1. **Nothing that only some runs reach is in it.** `bellpull` loads for the one spawn
 *      commander cannot make (a Windows executable that is not node); completions, `--mcp` and
 *      the `parse` hook loop load on the run that asks for them.
 *   2. **Every module in it is one the spec names.** A new static import fails here until it has
 *      a row below and a line in `.sdlc/intents/commander-front-end-diet/spec.md`'s residual —
 *      so the next byte over commander arrives with its reason, not as a ceiling raise.
 *
 * It reads `dist/`, which the root suite runs after the build, as `tree-shake-fixture.test.ts`
 * does.
 */
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build, type Metafile } from 'esbuild';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const BURGEE_DIST = join(REPO_ROOT, 'packages/burgee/dist');

/**
 * The modules the initial load may carry, as paths under `packages/burgee/dist`, each with the
 * synchronous contract that keeps it there (`spec.md`, *The residual*).
 */
const ALLOWED: Readonly<Record<string, string>> = {
  'commander.js': 'the entry',
  'commander/command.js': "commander's Command, ported",
  'commander/help.js': "commander's Help, ported",
  'commander/option.js': "commander's Option, ported",
  'commander/argument.js': "commander's Argument, ported",
  'commander/error.js': "commander's errors, ported",
  'suggest.js': "commander's suggestSimilar, shared with the core",
  'schema.js': '--schema answers inside a synchronous parse()',
  'manifest.js': '--schema answers inside a synchronous parse()',
  'names.js': '--schema answers inside a synchronous parse()',
  'plugin.js': 'use() refuses a plugin where it is registered',
  'definition.js': 'use() refuses a plugin where it is registered',
  'facade-failure.js': 'the --json envelope and E1 code settle before parse() returns',
  'errors.js': 'the --json envelope and E1 code settle before parse() returns',
  'exit-code.js': 'the --json envelope and E1 code settle before parse() returns',
  'runtime.js': 'the host seam every stream, exit and env read goes through',
};

/** Modules that must stay behind a `dynamic-import` edge, matched against the input path. */
const LAZY: readonly RegExp[] = [
  /packages\/bellpull\//,
  /burgee\/dist\/completions\.js$/,
  /burgee\/dist\/mcp\.js$/,
  /burgee\/dist\/parse-hooks\.js$/,
  /burgee\/dist\/commander\/surfaces\.js$/,
];

/**
 * `commander/command.js`'s bytes in the initial load, a ratchet (R2): 34,296 at `10edb48`, 34,434
 * after R1 split the spawn, and this after R2 moved the `completion` and `--mcp` routers out.
 */
const COMMAND_SHARE = 33_850;

/** One input's bytes across the chunks the initial load counts. */
function shareOf(meta: Metafile, key: string): number {
  return initialOutputs(meta).reduce((sum, path) => sum + Object.entries(meta.outputs[path]?.inputs ?? {}).filter(([input]) => keyOf(input) === key).reduce((n, [, v]) => n + v.bytesInOutput, 0), 0);
}

/** The entry chunk and every chunk it statically imports. */
function initialOutputs(meta: Metafile): string[] {
  const entry = Object.keys(meta.outputs).find((out) => meta.outputs[out]?.entryPoint !== undefined);
  if (entry === undefined) throw new Error('the metafile names no entry chunk');
  const seen = new Set<string>();
  const walk = (path: string): void => {
    const output = meta.outputs[path];
    if (output === undefined || seen.has(path)) return;
    seen.add(path);
    for (const edge of output.imports) if (edge.kind === 'import-statement') walk(edge.path);
  };
  walk(entry);
  return [...seen];
}

/** The initial load's input modules. */
function initialInputs(meta: Metafile): string[] {
  return initialOutputs(meta).flatMap((path) => Object.keys(meta.outputs[path]?.inputs ?? {})).filter((input) => !input.startsWith('fixture:'));
}

/** An input path as a row key of {@link ALLOWED}, or the path itself when it is not burgee's. */
function keyOf(input: string): string {
  const at = input.indexOf('packages/burgee/dist/');
  return at === -1 ? input : input.slice(at + 'packages/burgee/dist/'.length);
}

async function metafile(specifier: string): Promise<Metafile> {
  const out = await build({
    entryPoints: ['fixture:entry'],
    bundle: true,
    minify: true,
    format: 'esm',
    platform: 'node',
    splitting: true,
    outdir: join(BURGEE_DIST, '.lock-out'),
    write: false,
    metafile: true,
    logLevel: 'silent',
    plugins: [
      {
        name: 'fixture',
        setup(b) {
          b.onResolve({ filter: /^fixture:entry$/ }, () => ({ path: 'entry', namespace: 'fixture' }));
          b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `export * from ${JSON.stringify(specifier)};\n`, resolveDir: REPO_ROOT }));
        },
      },
    ],
  });
  return out.metafile;
}

describe('burgee/commander: the start-up path, by module (commander-front-end-diet R3)', async () => {
  const meta = await metafile('burgee/commander');
  const inputs = initialInputs(meta);

  it('finds the façade in the initial load, so an empty walk cannot pass', () => {
    expect(inputs.map(keyOf)).toContain('commander/command.js');
  });

  it.each(LAZY.map((re) => [re.source, re] as const))('keeps %s behind a dynamic import', (_, re) => {
    expect(inputs.filter((input) => re.test(input))).toEqual([]);
  });

  it('loads the completion and --mcp routers from a chunk of their own (R2)', () => {
    const everywhere = Object.values(meta.outputs).flatMap((o) => Object.keys(o.inputs)).map(keyOf);
    expect(everywhere, 'no commander/surfaces.js in the bundle: the routers are still in command.js').toContain('commander/surfaces.js');
  });

  it(`keeps commander/command.js's share of the initial load at or under ${String(COMMAND_SHARE)} B`, () => {
    expect(shareOf(meta, 'commander/command.js')).toBeLessThanOrEqual(COMMAND_SHARE);
  });

  it('carries only modules the spec names, each for a stated reason', () => {
    const unnamed = inputs.map(keyOf).filter((key) => ALLOWED[key] === undefined);
    expect(unnamed, 'a module entered the initial load with no row here and no line in the spec\'s residual').toEqual([]);
  });
});

const meta = (outputs: Metafile['outputs']): Metafile => ({ inputs: {}, outputs });
const out = (inputs: string[], imports: { path: string; kind: 'import-statement' | 'dynamic-import' }[], entryPoint?: string): Metafile['outputs'][string] => ({
  bytes: 1,
  inputs: Object.fromEntries(inputs.map((i) => [i, { bytesInOutput: 1 }])),
  imports: imports.map((i) => ({ ...i, external: false })),
  exports: [],
  ...(entryPoint === undefined ? {} : { entryPoint }),
});

describe('the reader', () => {
  it('follows static edges and stops at dynamic ones', () => {
    const m = meta({
      'o/entry.js': out(['fixture:entry', 'packages/burgee/dist/commander.js'], [{ path: 'o/shared.js', kind: 'import-statement' }, { path: 'o/lazy.js', kind: 'dynamic-import' }], 'fixture:entry'),
      'o/shared.js': out(['packages/burgee/dist/schema.js'], [{ path: 'o/entry.js', kind: 'import-statement' }]),
      'o/lazy.js': out(['packages/bellpull/dist/which.js'], []),
    });
    expect(initialInputs(m).map(keyOf)).toEqual(['commander.js', 'schema.js']);
  });

  it('refuses a metafile with no entry rather than reading it as empty', () => {
    expect(() => initialInputs(meta({ 'o/chunk.js': out([], []) }))).toThrow(/no entry chunk/);
  });

  it('keys a module outside burgee by its own path, so it cannot match a row', () => {
    expect(keyOf('packages/bellpull/dist/which.js')).toBe('packages/bellpull/dist/which.js');
  });
});
