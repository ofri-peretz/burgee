/**
 * U5 — weight is paid per import, never per config, and the ceiling on each subpath is
 * named after the incumbent it replaces. Mirrors `roundel/src/weight.test.ts` and
 * `flagstaff/src/weight.test.ts`.
 *
 * caique was the last published package without one of these, which meant the one package
 * in the family that talks to a person — and to an agent — was the one making an unmeasured
 * claim. This is that gap closed.
 *
 * **The ceiling is clack.** `@clack/prompts` 1.8.0 is 101,684 B across six packages —
 * itself, `@clack/core`, `fast-string-width`, `fast-string-truncated-width`,
 * `fast-wrap-ansi` and `sisteransi` — measured on 2026-09-09 the way every other bill in
 * this repo is: shipped code and data (`.js`/`.mjs`/`.cjs` plus imported `.json`,
 * `package.json` never counted), each package counted whole across its own resolved tree.
 * The root entry, which carries everything caique itself does, is 13,942 B and reaches two
 * packages, both from this repo — a seventh of the incumbent that carries the least.
 *
 * **Every number below dropped on 2026-09-20 and none of the code got smaller.** caique's
 * build gained `scripts/strip-comments.mjs`, which closeout has run since it was published:
 * the `.d.ts` files keep every doc comment, so an editor loses nothing, and the `.js` a user
 * actually loads stops carrying this repository's prose. It was the two compatibility
 * façades that forced the question — they took the published tarball past the artifact
 * ratchet — and paying for the comments twice was the wrong thing to have been doing anyway.
 *
 * The last test is the important one: **an entry point cannot be added without declaring
 * its budget here**, so the lock grows with the package instead of rotting behind it. It
 * reads `dist/`, so it measures what is published rather than what is written.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const pkgRoot = fileURLToPath(new URL('..', import.meta.url));
const dist = resolve(pkgRoot, 'dist');

interface Manifest {
  exports: Record<string, { import: string } | string>;
  dependencies?: Record<string, string>;
}

// Read rather than import: the published entry list is data here, and a JSON import would
// reach out of src/ for it.
const manifest = JSON.parse(readFileSync(resolve(pkgRoot, 'package.json'), 'utf8')) as Manifest;

/**
 * Every package published from this repo, read from the directory rather than listed here,
 * so a new sibling cannot make this lock stale by existing.
 */
const FAMILY = readdirSync(resolve(pkgRoot, '..')).filter((dir) => existsSync(resolve(pkgRoot, '..', dir, 'package.json')));

/**
 * The cursor restore, and the two subpaths of `closeout` it is paid in.
 *
 * It is no longer the *only* package caique reaches: the two compatibility façades added on
 * 2026-09-20 also reach `linegauge/wrap`, because a list that wraps and a prompt that
 * re-draws both need the incumbent's own line-breaking and this repository publishes a
 * graded port of it. Both edges are downward, both are declared in `package.json`, and the
 * last test in this file is what checks that neither can be taken without saying so.
 *
 * `closeout` is family and sits in the foundation tier, so the arrow is downward and
 * `package-shape-lock.test.ts` sanctions it. It is here because the raw renderer hides the
 * cursor, and the restore that owes — on every path the process can die by, not just the
 * keypress that sees Ctrl-C as a byte — is closeout's declared job against `restore-cursor`
 * and `signal-exit`. caique carried the third copy of those two escape sequences and no
 * exit handler at all; see the note in `raw.ts`.
 */
const CLOSEOUT = ['closeout/cursor', 'closeout/exit-hook'];

interface EntryRule {
  /**
   * Bare specifiers this entry may import. Empty on every leaf: the only edge caique has is
   * the cursor restore, and it is paid by the two entries that can hide a cursor.
   */
  allow: string[];
  /** Bytes reachable from it. A ratchet: lowering is free, raising is a decision with a comment. */
  budget: number;
  /** Modules this entry must never reach, whatever else changes. */
  denied: string[];
}

const RULES: Record<string, EntryRule> = {
  // Everything, for a program that wants one import: the spec, the decision, both widget
  // modes, the binding and the terminal. Measured 13,942 B on 2026-09-20 — a seventh of
  // clack's 101,684 B across six packages, and the only packages caique reaches are ones
  // this repo publishes. Neither façade is reachable from here: a program that imports
  // `caique` gets caique, and pays nothing for the two compatibility subpaths.
  //
  // `linegauge` joined on 2026-09-28 with the raw renderer's row count (`lineCount`): a frame
  // wider than the terminal occupies more rows than it has lines. Measured 14,472 after main's #680 (+265).
  // `paratext/csi` joined the same day (+70): the raw renderer's repaint is spelled with
  // ansi-escapes' cursor moves from paratext rather than by hand. Measured 14,542.
  // `roundel/terminal` joined the same day (+98): whether anybody is there to type is
  // roundel's `interactive()`, which knows an agent from a person. Measured 14,640.
  //
  // 19,549 B (+4,909) on 2026-10-05, with `keys.js` (controlroom R2): the raw renderer's
  // `keyOf` is decoded by `caique/keys` rather than by comparing bytes, and the root re-exports
  // the decoder and keymaps. Still under a fifth of clack's 101,684 B; the budget moved from
  // 15,000 because the surface did.
  '.': { allow: [...CLOSEOUT, 'linegauge', 'paratext/csi', 'roundel/terminal'], budget: 20_000, denied: ['clack.js', 'inquirer.js'] },
  // The shape and its validator. The floor every other subpath stands on, and a leaf: a
  // program that only declares prompts pays 739 B and never loads a widget.
  './spec': { allow: [], budget: 1_000, denied: ['ask.js', 'decide.js', 'raw.js', 'binding.js', 'terminal.js', 'index.js'] },
  // The rule that decides whether a person can be asked at all — the file that keeps a CLI
  // from hanging under an agent. It reaches only the spec, never a widget: deciding not to
  // ask must not cost the machinery of asking. Measured 2,133 B.
  // 2,231 B (+98) on 2026-09-28, reaching `roundel/terminal` (878 B, reaching nothing): the
  // question "is anybody there" is roundel's, and asking it by hand prompted an agent.
  './decide': { allow: ['roundel/terminal'], budget: 2_500, denied: ['ask.js', 'raw.js', 'binding.js', 'terminal.js', 'index.js'] },
  // The drop-in subpath for `@clack/prompts`: its twelve prompts, its writers, its symbols and
  // its settings, on caique's own keypress loop (D-152). It was one function — `limitOptions`,
  // 4,564 B — until 2026-09-27, when the twelve prompts `guide.test.ts` renders were built;
  // the budget moved from 5,500 because the surface did, and that is the decision this
  // comment records rather than a ratchet let slip.
  //
  // Measured **62,238 B** on 2026-09-27 against `@clack/prompts` 1.8.1's own 101,684 B across
  // six packages — 0.61 of the U5 ceiling this file's header names — reaching the same three
  // family subpaths `./inquirer` does: `closeout/cursor` and `closeout/exit-hook`, because a
  // prompt hides the cursor and owes its return on every exit path, and `linegauge/wrap`.
  // It is still a leaf away from the rest of caique: a program migrating off clack loads none
  // of caique's own API, and a program written against caique never loads a byte of this.
  // 62,336 B on 2026-09-28; 62,229 B (−107) once raw mode went through `closeout/cursor`'s
  // `rawMode()` instead of a hand-rolled toggle — an import the allow list already named.
  // 62,097 B (−132) on 2026-10-05: the line editing moved into `line-edit.js`, which
  // `caique/editor` shares, so the two edit text with one copy of the code. The façade still
  // reaches neither `keys.js` nor `editor.js`: clack's keypress loop reads node's events itself.
  './clack': {
    allow: ['closeout/cursor', 'closeout/exit-hook', 'linegauge/wrap'],
    budget: 64_000,
    denied: ['ask.js', 'decide.js', 'raw.js', 'binding.js', 'terminal.js', 'index.js', 'spec.js', 'plugin.js', 'inquirer.js', 'keys.js', 'editor.js'],
  },
  // The line editor as a component a host drives (controlroom R20): history, bracketed paste and
  // a completion menu over `line-edit.js`, the editing `./clack` uses, with its commands a
  // `caique/keys` keymap. It does no I/O, so it reaches no prompt, no terminal and no façade;
  // `linegauge` measures the cursor's column, and closeout comes with `keys.js`. Not reachable
  // from the root: a program that only asks questions does not carry a screen's input line.
  // Measured 12,389 B on 2026-10-05.
  './editor': {
    allow: [...CLOSEOUT, 'linegauge'],
    budget: 13_000,
    denied: ['ask.js', 'decide.js', 'raw.js', 'binding.js', 'terminal.js', 'index.js', 'spec.js', 'plugin.js', 'clack.js', 'clack-core.js', 'inquirer.js'],
  },
  // The drop-in subpath for `@inquirer/core` — graded 41 / 41 by the incumbent's own suite
  // through `compat-oracle`, which is the only reason any of it can be trusted.
  //
  // **It is a leaf away from the rest of caique, deliberately.** A program migrating off
  // inquirer imports this and nothing else; a program written against caique's own API
  // never loads a byte of it. So the denied list names every other module in the package,
  // including `spec.js` — the two worlds share a package and share no code. The one module
  // they *do* share is `runtime.js`, and that is the point of it: it is the single file in
  // caique allowed to name `process`, and the façade reads the environment and the two
  // streams through it like everything else here (`runtime.test.ts` is the lock).
  //
  // Measured 20,623 B on 2026-09-20, reaching `closeout/cursor`, `closeout/exit-hook` and
  // `linegauge/wrap`, all published from this repository — against `@inquirer/core` 12.0.3's
  // own 33,583 B and a resolved tree of 83,916 B across ten packages (`@inquirer/core`,
  // `@inquirer/ansi`, `@inquirer/figures`, `@inquirer/type`, `cli-width`, `fast-wrap-ansi`,
  // `fast-string-width`, `fast-string-truncated-width`, `mute-stream`, `signal-exit`),
  // measured the same day and the same way. The claim this subpath makes is compatibility
  // rather than weight; U5's ceiling for caique is clack, and it is the root entry above
  // that carries it.
  './inquirer': {
    // `paratext/csi` on 2026-09-28 (-61): the cursor moves and erases `@inquirer/ansi` supplies
    // are ansi-escapes' from paratext, with `@inquirer/ansi`'s zero-row guard kept. Measured 20,829 after merging main (20,890 there).
    // `roundel/terminal` the same day: the tick's unicode test is is-unicode-supported whole,
    // from roundel, rather than a four-condition subset of it here. Measured 20,782 (-47).
    allow: ['closeout/cursor', 'closeout/exit-hook', 'linegauge/wrap', 'paratext/csi', 'roundel/terminal'],
    budget: 23_000,
    denied: ['ask.js', 'decide.js', 'raw.js', 'binding.js', 'terminal.js', 'index.js', 'spec.js', 'plugin.js', 'clack.js'],
  },
  // The six widgets in line mode (R5), which is the floor and the accessible rendering.
  // Measured 4,234 B — the whole prompt surface, with no terminal and no raw mode.
  './ask': { allow: [], budget: 5_000, denied: ['decide.js', 'raw.js', 'binding.js', 'terminal.js', 'index.js'] },
  // The plugin host for `widgets`. Unlike roundel's, which is a leaf, this one carries
  // `ask.js` **by design**: `projectionOf()` is one surface over all kinds, drawing the six
  // built-ins itself and a registered widget's `static` for anything else. Splitting that in
  // two would make every caller re-implement the six-kind test, and the built-in list is
  // exactly what `E_UNKNOWN_KIND` has to be right about. Measured 9,788 B on 2026-09-20 —
  // most of it the family schema `schema.json`, which every plugin host in the repo carries.
  './plugin': { allow: [], budget: 11_000, denied: ['decide.js', 'raw.js', 'binding.js', 'terminal.js', 'index.js'] },
  // The raw-mode renderer sits *on top of* line mode and answers the same questions, so it
  // carries `ask.js` by design — that shared answer is the arrangement, not an accident.
  // It never reaches the terminal: a caller supplies its own streams. Measured 3,656 B.
  // 3,659 B (+3) on 2026-09-28: raw mode is `closeout/cursor`'s `rawMode`, paired with its undo.
  // 3,846 B (+187): the repaint counts rows with linegauge's `lineCount`
  // against the writer's `columns`, instead of counting `\n`s and ignoring wrap.
  // 3,916 B (+70) on 2026-09-28, the repaint in `paratext/csi`'s spelling.
  // 8,896 B (+4,980) on 2026-10-05: `keyOf` is rebuilt on `caique/keys`' decoder (controlroom
  // R2), so a list prompt and a screen read the same keys the same way. The budget moved from
  // 4,500 with it — one decoder in the package, paid by the renderer that reads keys.
  './raw': { allow: [...CLOSEOUT, 'linegauge', 'paratext/csi'], budget: 9_000, denied: ['decide.js', 'binding.js', 'terminal.js', 'index.js'] },
  // Key presses through `node:readline`'s decoder, keymaps as data, and a reader that takes raw
  // mode once through `closeout/cursor` (controlroom R2). A leaf: a screen that reads keys pays
  // for no prompt, and the two closeout subpaths are the raw-mode restore it owes on every exit
  // path. Measured 4,991 B on 2026-10-05.
  './keys': {
    allow: CLOSEOUT,
    budget: 5_000,
    denied: ['ask.js', 'decide.js', 'raw.js', 'binding.js', 'terminal.js', 'index.js', 'spec.js', 'plugin.js', 'clack.js', 'inquirer.js'],
  },
  // Resolving a whole command's prompts in one pass: the decision plus the widgets it may
  // reach for. Never the terminal, and never the raw renderer — a framework hands caique an
  // `Io`, and which one is the caller's business. Measured 8,123 B; 8,395 B on 2026-09-28,
  // with `decide`'s `roundel/terminal`.
  './binding': { allow: ['roundel/terminal'], budget: 9_500, denied: ['raw.js', 'terminal.js', 'index.js'] },
  // The only file that touches a stream, and the only one that knows what echo is. It
  // carries `ask.js` for the `Io` shape it implements. Measured 1,947 B; +78 on
  // 2026-09-28 for the writer's `columns`, read through to the output stream.
  './terminal': { allow: [], budget: 2_500, denied: ['decide.js', 'raw.js', 'binding.js', 'index.js'] },
};

const SPECIFIER = /(?:from|import)\s*'([^']+)'/g;

function walk(entry: string): { reached: string[]; external: string[]; bytes: number } {
  const files = new Set<string>();
  const external = new Set<string>();
  const queue = [entry];
  let bytes = 0;

  while (queue.length > 0) {
    const file = queue.pop();
    if (file === undefined || files.has(file)) continue;
    files.add(file);
    bytes += statSync(file).size;
    for (const [, spec = ''] of readFileSync(file, 'utf8').matchAll(SPECIFIER)) {
      if (spec.startsWith('.')) queue.push(resolve(dirname(file), spec));
      else if (spec !== '' && !spec.startsWith('node:')) external.add(spec);
    }
  }
  return { reached: [...files].map((f) => relative(dist, f)), external: [...external], bytes };
}

function entryFile(subpath: string): string {
  const conditions = manifest.exports[subpath];
  if (typeof conditions !== 'object') throw new Error(`no code exports entry for ${subpath}`);
  return resolve(pkgRoot, conditions.import);
}

describe.each(Object.keys(RULES))('entry %s', (subpath) => {
  const rule = RULES[subpath] as EntryRule;
  const graph = walk(entryFile(subpath));

  it('imports only what its rule allows', () => {
    expect(graph.external.sort()).toEqual([...rule.allow].sort());
  });

  it('reaches nothing on its denied list', () => {
    for (const denied of rule.denied) expect(graph.reached).not.toContain(denied);
  });

  it('stays inside its byte budget', () => {
    expect(graph.bytes).toBeLessThanOrEqual(rule.budget);
  });
});

describe('the lock grows with the package', () => {
  it('every published entry point declares a weight rule', () => {
    // Adding `caique/inquirer` without a budget here fails, which is the point: a new
    // surface cannot ship until someone has said what it may weigh.
    const code = Object.entries(manifest.exports)
      .filter(([, target]) => typeof target === 'object')
      .map(([subpath]) => subpath);
    expect(code.sort()).toEqual(Object.keys(RULES).sort());
  });

  /**
   * The claim the whole family makes, stated the way it is actually true.
   *
   * It used to read "depends on nothing", and every entry had to reach no package at all.
   * That is the rule which kept the third copy of `HIDE_CURSOR`/`SHOW_CURSOR` in `raw.ts`,
   * along with no exit handler to undo them — a rule that forbids the arrow does not
   * remove the need, it converts it into a copy, which is the outcome the repository's own
   * packaging lock says principle 2 exists to prevent.
   *
   * So: nothing from outside this repository, and every same-repo edge declared as a real
   * dependency in `package.json` rather than borrowed from a hoisted `node_modules`.
   */
  it('reaches nothing it does not install, and nothing outside this repo', () => {
    const declared = new Set(Object.keys(manifest.dependencies ?? {}));
    for (const subpath of Object.keys(RULES)) {
      for (const specifier of walk(entryFile(subpath)).external) {
        const owner = specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : (specifier.split('/')[0] as string);
        expect(declared.has(owner), `${subpath} reaches ${specifier}, which ${owner} is not declared for`).toBe(true);
        expect(FAMILY, `${subpath} reaches ${owner}, which is not published from this repo`).toContain(owner);
      }
    }
  });
});

/** npm on Windows is `npm.cmd`, which Node will only spawn through a shell. Fixed argv, nothing to escape. */
const WINDOWS = process.platform === 'win32';
const packed = (): number =>
  (JSON.parse(execFileSync(WINDOWS ? 'npm.cmd' : 'npm', ['pack', '--dry-run', '--json'], { cwd: pkgRoot, encoding: 'utf8', shell: WINDOWS, stdio: ['ignore', 'pipe', 'pipe'] })) as { unpackedSize: number }[])[0]?.unpackedSize ?? 0;

const bandLayer = (): { ours: number; ceiling: number; ratio: number } =>
  (JSON.parse(readFileSync(resolve(pkgRoot, '../../.sdlc/bands/foundation-ceilings.json'), 'utf8')) as { layers: Record<string, { ours: number; ceiling: number; ratio: number }> }).layers['caique'] as {
    ours: number;
    ceiling: number;
    ratio: number;
  };

describe('the ceilings file', () => {
  it(
    'tracks the band: what this package weighs is what the ceilings file says it weighs',
    () => {
      // Added 2026-10-05: five of the six band layers had no test holding `ours`, and four of
      // them were stale on main. The band follows the package; either moving alone goes red here.
      const ours = packed();
      const { ours: recordedOurs, ceiling, ratio: recordedRatio } = bandLayer();
      expect({ ours, ratio: Number((ours / ceiling).toFixed(4)) }, 'the package and its recorded weight disagree — run `npm run weight:converge`').toEqual({
        ours: recordedOurs,
        ratio: recordedRatio,
      });
    },
    120_000,
  );
});
