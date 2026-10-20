/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — every package README's quick start runs as written.
 *
 * npm is where most readers arrive from, and npm shows the README; the `## Quick start` is the
 * first code a stranger pastes. Until this lock only burgee's was ever run
 * (`packages/burgee/src/shape.test.ts`), and it runs it *from the README* because the copy it
 * used to hold is how burgee@0.10.0 shipped a quick start that threw. The other nine were run by
 * nothing — and when this lock first ran against main (2026-10-10), two of them threw
 * `ReferenceError` as pasted (flagstaff's `rt`, linegauge's `styled`), and a third imported a
 * package its install line does not install.
 *
 * For each published package it reads the quick start **from the README**, never a copy, and:
 *
 * 1. **installs it the way a user does** — the tarball `npm pack` builds, offline, through the
 *    same packer the independence lock uses (`family-install.ts`). One pack and one install for
 *    every package: an install of all of them is not the stranger's install, so the stranger's
 *    install line is held another way — every module resolution the quick start performs is
 *    recorded, and the quick start may reach only the packages its install line names.
 *    controlroom's imported `flagstaff/tasks` under `npm install controlroom`, which npm hoists
 *    into reach and pnpm, the second line of the same Install section, does not;
 * 2. **runs each program with `node`**, through a pipe, in an environment holding nothing but
 *    what finding executables needs — a `ts` block as `.mts`, through Node 24's type stripping,
 *    which is what a reader who saves it as TypeScript gets;
 * 3. **compares what it prints** to the output block under it, where the README shows one, and
 *    otherwise holds it to exiting 0 without a Node warning.
 *
 * What a quick start contains is classified, not guessed (`classify`): a `js`/`mjs`/`ts` block
 * is source — one that opens with an `import` starts a new program, one that does not continues
 * the program above it; a `bash` block is an install line; an untagged or `text` block is the
 * output of the program above it. Any other fence fails the lock until someone says what it is,
 * so a block cannot be skipped by being written in a language this file does not know.
 *
 * Off CI, tarballs that already passed here are not installed again: the per-package cases
 * report skipped, naming the stamp (`installStamp` in `family-install.ts`).
 */
import { execFile } from 'node:child_process';
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { declaredBy, discard, type Edge, type InstallStamp, installStamp, installTarballs, packFamily, publishedManifests, readManifest, undeclaredReaches } from './family-install.js';
import { scratchDirs } from './scratch-dir.js';

/** Every scratch directory this file makes, removed after its last test (`scripts/scratch-dir.ts`). */
const scratchDir = scratchDirs();

const run = promisify(execFile);
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

/**
 * burgee's quick start is run by `packages/burgee/src/shape.test.ts`, session by session against
 * its `console` transcript, both on npm's page and on the repository's. It is not run twice.
 */
const RUN_ELSEWHERE: Readonly<Record<string, string>> = { burgee: 'packages/burgee/src/shape.test.ts' };
const PUBLISHED = ['bellpull', 'burgee', 'caique', 'closeout', 'controlroom', 'flagstaff', 'linegauge', 'paratext', 'roundel', 'seniority'];
const RUN_HERE = PUBLISHED.filter((p) => RUN_ELSEWHERE[p] === undefined);

/**
 * Names a quick start leaves to the reader's own program — releasing *your* lock, drawing *your*
 * spinner — which no install provides. Each is appended to the program that calls it as an empty
 * function, after the README's last line so every line number in a failure is the README's.
 * The lock fails if a name here is no longer called, so this list cannot outlive the README.
 */
const READERS_OWN: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  closeout: {
    releaseTheLock: 'function releaseTheLock() {}',
    drawTheSpinner: 'async function drawTheSpinner() {}',
    runTheFullScreenApp: 'async function runTheFullScreenApp() {}',
  },
};

/**
 * One pack and one install, ~3 s idle. The margin is the independence and install-graph locks'
 * 240 s: at 120 s the setup timed out on CI's Windows runners twice on 2026-10-11 (Compatibility
 * runs 38108661838 and 38111836387) with every assertion it guards still passing.
 */
const SETUP_TIMEOUT_MS = 240_000;
/** A quick start that has not exited by now is waiting for something a pipe will never send. */
const RUN_TIMEOUT_MS = 20_000;

export interface Program {
  lang: 'js' | 'ts';
  source: string;
  /** The output block under it, when the README shows one. */
  output?: string;
}

export interface QuickStart {
  programs: Program[];
  /** The packages the reader is told to install: the quick start's own line, else the Install section's. */
  installs: string[];
}

const section = (readme: string, heading: string): string => {
  const at = readme.indexOf(`\n## ${heading}\n`);
  if (at === -1) return '';
  const end = readme.indexOf('\n## ', at + 1);
  return readme.slice(at, end === -1 ? undefined : end);
};

/** The package names on the first `npm install` line in `text`, without flags. */
const installLine = (text: string): string[] =>
  (/^npm (?:install|i) ([^\n]+)$/mu.exec(text)?.[1] ?? '')
    .split(/\s+/u)
    .filter((w) => w !== '' && !w.startsWith('-'));

const SOURCE = new Set(['js', 'mjs', 'ts']);
const SHELL = new Set(['bash', 'sh']);
const OUTPUT = new Set(['', 'text']);

/** A source block: a new program when it opens with an `import`, else the rest of the one above. */
function addSource(programs: Program[], lang: string, body: string): void {
  const last = programs.at(-1);
  const opensProgram = /^\s*(?:\/\/[^\n]*\n\s*)*import\b/u.test(body);
  if (opensProgram || last === undefined || last.output !== undefined) {
    programs.push({ lang: lang === 'ts' ? 'ts' : 'js', source: body });
    return;
  }
  last.source += body;
  if (lang === 'ts') last.lang = 'ts';
}

/** An output block: what the program above it prints. */
function addOutput(programs: Program[], body: string): void {
  const last = programs.at(-1);
  if (last === undefined || last.output !== undefined) throw new Error(`an output block with no program above it:\n${body}`);
  last.output = body;
}

/** A shell block, which must be an install line: anything else would be a step this lock never runs. */
function shellInstall(lang: string, body: string): string[] {
  const names = installLine(body);
  if (names.length === 0) throw new Error(`a \`${lang}\` block that is not an \`npm install\` line:\n${body}`);
  return names;
}

/** Read a README's quick start into the programs it shows and what it says to install. */
export function classify(readme: string): QuickStart {
  const text = section(readme, 'Quick start');
  if (text === '') throw new Error('no `## Quick start` section');
  const programs: Program[] = [];
  let ownInstall: string[] = [];
  for (const [, lang = '', body = ''] of text.matchAll(/^```([\w-]*)\n([\s\S]*?)^```$/gmu)) {
    if (SOURCE.has(lang)) addSource(programs, lang, body);
    else if (OUTPUT.has(lang)) addOutput(programs, body);
    else if (SHELL.has(lang)) ownInstall = shellInstall(lang, body);
    else throw new Error(`a \`${lang}\` block — say what it is in classify(): source, an install line, or output`);
  }
  return { programs, installs: ownInstall.length > 0 ? ownInstall : installLine(section(readme, 'Install')) };
}

/** The program as the lock writes it: the README's source, then any of the reader's own names it calls. */
export function withReadersOwn(source: string, own: Readonly<Record<string, string>>): string {
  const called = Object.entries(own).filter(([name]) => new RegExp(String.raw`\b${name}\(`, 'u').test(source));
  return called.length === 0 ? source : `${source}\n// The reader's own code, which the README leaves to them:\n${called.map(([, decl]) => decl).join('\n')}\n`;
}

const readme = (quickStart: string): string => `# pkg\n\n## Install\n\n\`\`\`bash\nnpm install pkg\n\`\`\`\n\n## Quick start\n\n${quickStart}\n## API\n`;
const fence = (lang: string, body: string): string => `\`\`\`${lang}\n${body}\`\`\`\n`;

describe('classify', () => {
  it('reads the install line from the Install section, and the quick start’s own when it has one', () => {
    expect(classify(readme(fence('js', "import 'pkg';\n"))).installs).toEqual(['pkg']);
    expect(classify(readme(fence('bash', 'npm install pkg other\n') + fence('js', "import 'other';\n"))).installs).toEqual(['pkg', 'other']);
  });

  it('starts a program at a block that imports, continues it at one that does not, and keeps ts as ts', () => {
    const { programs } = classify(readme(fence('js', "import 'a';\n") + fence('js', 'more();\n') + fence('ts', "// a comment\nimport 'b';\n")));
    expect(programs).toEqual([
      { lang: 'js', source: "import 'a';\nmore();\n" },
      { lang: 'ts', source: "// a comment\nimport 'b';\n" },
    ]);
  });

  it('takes an untagged block as the output of the program above it', () => {
    expect(classify(readme(fence('js', "import 'a';\n") + fence('', 'printed\n'))).programs).toEqual([{ lang: 'js', source: "import 'a';\n", output: 'printed\n' }]);
  });

  it('refuses a block it cannot classify, rather than skipping it', () => {
    expect(() => classify(readme(fence('python', 'print(1)\n')))).toThrow(/a `python` block/u);
    expect(() => classify(readme(fence('', 'orphan output\n')))).toThrow(/no program above it/u);
    expect(() => classify(readme(fence('bash', 'echo hi\n')))).toThrow(/not an `npm install` line/u);
  });

  it('appends only the reader’s own names a program calls, after its last line', () => {
    const own = { work: 'function work() {}', other: 'function other() {}' };
    expect(withReadersOwn('work();\n', own)).toBe("work();\n\n// The reader's own code, which the README leaves to them:\nfunction work() {}\n");
    expect(withReadersOwn('nothing();\n', own)).toBe('nothing();\n');
  });
});

interface Ran {
  code: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  edges: Edge[];
  undeclared: string[];
}

/**
 * The environment a quick start runs in: what finding `node` and `git` needs, and nothing a
 * developer's shell or CI adds — no `CI`, no `FORCE_COLOR`, no `TERM` — so the output is the same
 * on every machine. Nothing in the output is normalised: no quick start prints a path or a time,
 * and a rewrite added before one does would only hide what it prints.
 */
function strangerEnv(): NodeJS.ProcessEnv {
  const keep = ['PATH', 'Path', 'HOME', 'USERPROFILE', 'SystemRoot', 'PATHEXT', 'TMPDIR', 'TEMP', 'TMP'];
  return Object.fromEntries(keep.filter((k) => process.env[k] !== undefined).map((k) => [k, process.env[k]]));
}

/** Loaded with `--import` ahead of the quick start: records every resolution, writes them on exit. */
const RECORDER = `import { registerHooks } from 'node:module';
import { writeFileSync } from 'node:fs';
const edges = [];
registerHooks({
  resolve(specifier, context, nextResolve) {
    const result = nextResolve(specifier, context);
    edges.push({ from: context.parentURL ?? null, specifier, to: result.url });
    return result;
  },
});
process.on('exit', () => writeFileSync(process.env.QUICK_START_EDGES, JSON.stringify(edges)));
`;

describe('every package README’s quick start runs as written', () => {
  const manifests = publishedManifests(root);
  const starts = new Map(RUN_HERE.map((pkg) => [pkg, classify(readFileSync(join(root, 'packages', pkg, 'README.md'), 'utf8'))]));
  const results = new Map<string, Ran[]>();
  let base: string;
  let stamp: InstallStamp | undefined;

  beforeAll(async () => {
    base = scratchDir('burgee-quick-start-');
    const tarballs = await packFamily(root, manifests.keys(), join(base, 'tarballs'));
    stamp = installStamp(fileURLToPath(import.meta.url), tarballs.values());
    if (stamp.skip !== undefined) return;
    const adopter = join(base, 'adopter');
    mkdirSync(adopter);
    writeFileSync(join(adopter, 'package.json'), JSON.stringify({ name: 'quick-start-reader', private: true }));
    await installTarballs(adopter, [...tarballs.values()]);
    writeFileSync(join(adopter, 'record.mjs'), RECORDER);
    const modules = realpathSync(join(adopter, 'node_modules'));
    const declared = (name: string): string[] => declaredBy(readManifest(join(modules, name)));

    const runOne = async (pkg: string, program: Program, i: number): Promise<Ran> => {
      const dir = join(adopter, pkg);
      mkdirSync(dir, { recursive: true });
      const file = `quick-start-${String(i)}.${program.lang === 'ts' ? 'mts' : 'mjs'}`;
      writeFileSync(join(dir, file), withReadersOwn(program.source, READERS_OWN[pkg] ?? {}));
      const out = join(dir, `edges-${String(i)}.json`);
      const env = { ...strangerEnv(), QUICK_START_EDGES: out };
      let ran: Omit<Ran, 'edges' | 'undeclared'>;
      try {
        const r = await run(process.execPath, ['--import', pathToFileURL(join(adopter, 'record.mjs')).href, file], { cwd: dir, env, encoding: 'utf8', timeout: RUN_TIMEOUT_MS });
        ran = { code: 0, signal: null, stdout: r.stdout, stderr: r.stderr };
      } catch (e) {
        const err = e as { code?: number | string; signal?: string | null; stdout?: string; stderr?: string };
        ran = { code: typeof err.code === 'number' ? err.code : null, signal: err.signal ?? null, stdout: err.stdout ?? '', stderr: err.stderr ?? String(e) };
      }
      const entry = pathToFileURL(join(realpathSync(dir), file)).href;
      const edges = (JSON.parse(readFileSync(out, 'utf8')) as Edge[]).filter((edge) => edge.to !== entry);
      const undeclared = undeclaredReaches(edges, { modules, entry, pkg: starts.get(pkg)?.installs ?? [], declared });
      return { ...ran, edges, undeclared };
    };

    await Promise.all(
      [...starts].map(async ([pkg, { programs }]) => {
        results.set(pkg, await Promise.all(programs.map((program, i) => runOne(pkg, program, i))));
      }),
    );
  }, SETUP_TIMEOUT_MS);

  afterAll(({}, suite) => {
    discard(base);
    stamp?.record(suite);
  });

  it('grades every published package, and burgee where it is already run', () => {
    expect([...manifests.keys()].toSorted()).toEqual(PUBLISHED);
    for (const [pkg, where] of Object.entries(RUN_ELSEWHERE)) expect(readFileSync(join(root, where), 'utf8'), `${pkg}'s quick start is no longer run by ${where}`).toContain(`quickstart(join(pkgRoot, 'README.md'))`);
  });

  describe.each(RUN_HERE)('%s', (pkg) => {
    beforeEach((ctx) => {
      if (stamp?.skip !== undefined) ctx.skip(stamp.skip);
    });
    const start = (): QuickStart => starts.get(pkg) ?? { programs: [], installs: [] };
    const ran = (): Ran[] => results.get(pkg) ?? [];

    it('has a program to run and a package to install', () => {
      expect(start().programs.length).toBeGreaterThan(0);
      expect(start().installs).toContain(pkg);
      for (const name of Object.keys(READERS_OWN[pkg] ?? {})) {
        expect(
          start().programs.some((p) => withReadersOwn(p.source, { [name]: '' }) !== p.source),
          `READERS_OWN.${pkg}.${name} is called by no program — remove it`,
        ).toBe(true);
      }
    });

    it('runs every program to exit 0, printing what the README shows', () => {
      const runs = ran();
      expect(runs).toHaveLength(start().programs.length);
      start().programs.forEach((program, i) => {
        const r = runs[i];
        const label = `${pkg} program ${String(i + 1)}:\n${program.source}`;
        expect({ code: r?.code, signal: r?.signal, stderr: r?.code === 0 ? '' : r?.stderr }, label).toEqual({ code: 0, signal: null, stderr: '' });
        expect(r?.stderr, `${label}\nNode warned`).not.toMatch(/^\(node:\d+\) /mu);
        if (program.output !== undefined) expect(`${r?.stdout ?? ''}${r?.stderr ?? ''}`.trimEnd(), label).toBe(program.output.trimEnd());
      });
    });

    it('reaches only the packages its install line installs', () => {
      for (const r of ran()) {
        expect(r.edges.length, 'no resolutions were recorded — the hook is broken').toBeGreaterThan(0);
        expect(r.undeclared).toEqual([]);
      }
    });
  });
});
