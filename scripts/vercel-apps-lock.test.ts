/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * The app table lock — `.github/vercel-apps.json` names every docs app once, and nothing
 * else names one (`.sdlc/intents/docs-per-package/`, success criteria 1–6).
 *
 * Every published package has its own docs site (D-131), deployed by one workflow from one
 * table. The whole design rests on a property that costs nothing to break by accident: *no
 * fact about an app is written twice.* A workflow that greps for an app name, a second
 * mapping "kept in lockstep", a host typed into a source constant, a compatibility page
 * copied into a second app — each looks like a convenience, and each makes the tenth
 * package a clone instead of a row. So each is a test here.
 *
 * The claims about *behaviour* — the workflow refusing an unknown app, the affected set
 * mapping onto exactly the right rows — execute the real `run:` block under `bash`, as
 * `deploy-lock.test.ts` does, because a comment satisfies a grep.
 *
 * Proven red, one mutation at a time (2026-09-23):
 *
 * | criterion | mutation | fails |
 * | :-- | :-- | :-- |
 * | 1 | a tenth `private: false` package under `packages/` with no row and no exclusion | every published package has a site, or a written reason |
 * | 2 | `apps/docs-roundel` renamed to `apps/docs-roundle`, row unchanged | every row's directory is an app whose workspace is the row's |
 * | 3 | `cp apps/docs/content/docs/gallery.mdx apps/docs-roundel/content/docs/` | no family-wide page exists outside the front door |
 * | 3 | gallery-page.ts's OUT pointed at `apps/docs-roundel` | both generators write into the front door |
 * | 4 | roundel's `src/site.ts` resolves burgee's row | each app resolves its own row's host |
 * | 5 | a `deploy-roundel:` job re-added to auto-deploy.yml | no workflow names an app |
 * | 5 | `case "$ws" in docs) …` restored in the affected step | no workflow names an app |
 * | — | `jq -e` → `jq` in the resolve step | refuses an app the table does not have |
 * | — | `index([$w])` → a `test($w)` substring match | maps the affected workspaces onto exactly their rows |
 *
 * Criterion 6 is not a test but a diff: the commit that added `apps/docs-roundel` and its row
 * touched nothing under `.github/workflows/`. What makes that stay true is criterion 5's
 * lock, since a workflow that names no app has nothing to edit when one arrives.
 *
 * **Pending apps.** An app can be built before the owner creates its Vercel project
 * (`apps/docs-controlroom`, gap C8). It is filed under `pending` with every fact of a row but
 * `projectId`, so it is held to everything a row is held to that does not need a project —
 * its directory, workspace, host, index, chassis and package dependencies, its own host
 * resolved, no literal of that host in source, no mention of it in a workflow, links that land
 * — while the two things that would need one are checked the other way: neither workflow
 * resolves it, so nothing deploys it, and its package keeps its `excluded` reason, so every
 * link to it still lands on the front door's section until the row goes live.
 *
 * Proven red, one mutation at a time (2026-10-08):
 *
 * | mutation | fails |
 * | :-- | :-- |
 * | a `projectId` added to the pending controlroom entry | carries no Vercel project |
 * | controlroom's `excluded` reason deleted | keeps its package's excluded reason |
 * | controlroom copied into `apps` with a placeholder `prj_` id, `pending` left as is | is not also a deployable row |
 * | `pending` emptied, `apps/docs-controlroom` left on disk | has no Next app under apps/ that the table does not name |
 *
 * **A package app is the chassis plus its own facts** (spec R4/R5, locked 2026-10-26). Nine apps
 * with the same Next-required files are nine copies unless something says they are one: the
 * shims must be the same bytes in every package app, `package.json` and `src/site.ts` may differ
 * only by the app key (and by sibling family packages a page's examples import), and every `src/`
 * shim must call the chassis. Proven red (2026-10-26):
 *
 * | mutation | fails |
 * | :-- | :-- |
 * | a line of logic added to `apps/docs-caique/src/app/layout.tsx` | every shim is the same bytes › caique |
 * | `apps/docs-paratext/src/app/robots.ts` deleted | has exactly the files every other package app has › paratext |
 * | a hard-coded `description` added to `apps/docs-closeout/package.json` | differ from the others only by the key › closeout |
 *
 * **Links a live crawl found.** A crawl of all ten sites (314 pages, 10,774 links,
 * 2026-10-11) found every page and every anchor resolving; the dead links were GitHub issue
 * links the release's changelog generator had written into this repo from a bare `#N` in a
 * changeset. Both classes are held here, offline. Proven red (2026-10-11):
 *
 * | mutation | fails |
 * | :-- | :-- |
 * | `packages/burgee/src/exit-code.test.ts` renamed, the page linking it unchanged | every link in every app's content lands on a page › burgee |
 * | the two original changesets restored (`yargs #1519, #2118`, `accent: '#336699'`) | no pending changeset writes an issue link its author did not |
 */
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { delimiter, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import changelogGithub from '@changesets/changelog-github';
import { load as loadYaml } from 'js-yaml';
import { describe, expect, it } from 'vitest';

import { OUT as COMPAT_OUT } from './compat-page.js';
import { OUT as GALLERY_OUT } from './gallery-page.js';
import { scratchDirs } from './scratch-dir.js';

/** Every scratch directory this file makes, removed after its last test (`scripts/scratch-dir.ts`). */
const scratchDir = scratchDirs();

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TABLE_PATH = join(REPO_ROOT, '.github', 'vercel-apps.json');

interface Row {
  package: string;
  workspace: string;
  dir: string;
  projectId: string;
  productionUrl: string;
  rootDirectory: string;
  buildCommand: string;
  outputDirectory: string;
  familyPages: boolean;
}
/** A built app with no Vercel project yet: a row's facts except `projectId`. */
type PendingRow = Omit<Row, 'projectId'>;
interface Table {
  orgId: string;
  apps: Record<string, Row>;
  pending?: Record<string, PendingRow>;
  excluded: Record<string, string>;
}
interface Manifest {
  name: string;
  private?: boolean;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

const TABLE = JSON.parse(readFileSync(TABLE_PATH, 'utf8')) as Table;
const ROWS = Object.entries(TABLE.apps);
const PENDING = Object.entries(TABLE.pending ?? {});
/** Every app with a directory: deployable rows and pending ones. */
const SITES: [string, PendingRow][] = [...ROWS, ...PENDING];
const FAMILY_PAGES = ['compatibility.mdx', 'comparison.mdx', 'gallery.mdx'] as const;

const read = (path: string): string => readFileSync(join(REPO_ROOT, path), 'utf8');
const manifestAt = (dir: string): Manifest => JSON.parse(read(join(dir, 'package.json'))) as Manifest;

/** Every `private: false` package under `dir`, by manifest name. */
export function publishedPackages(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(dir, e.name, 'package.json')))
    .map((e) => JSON.parse(readFileSync(join(dir, e.name, 'package.json'), 'utf8')) as Manifest)
    .filter((m) => m.private !== true)
    .map((m) => m.name);
}

/** Published packages the table neither gives a row nor excludes with a reason. */
export function unaccounted(published: readonly string[], table: Table): string[] {
  const rowed = new Set(Object.values(table.apps).map((row) => row.package));
  return published.filter((name) => !rowed.has(name) && (table.excluded[name] ?? '').trim() === '');
}

/** Every file under `dir`, skipping build output and dependencies. */
function walk(dir: string, found: string[] = []): string[] {
  if (!existsSync(dir)) return found;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.next', '.source', '.turbo'].includes(entry.name)) continue;
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) walk(abs, found);
    else found.push(abs);
  }
  return found;
}

/** The URL fumadocs' loader gives a content file: `/docs` + its path, with `index` folded away. */
function urlOf(content: string, abs: string): string {
  const slug = relative(content, abs).replace(/\.mdx?$/u, '').split(/[\\/]/u).filter((s) => s !== 'index');
  return ['/docs', ...slug].join('/').replace('//', '/');
}

/** Every page URL an app serves, from its content directory. */
const pagesOf = (row: PendingRow): Set<string> => {
  const content = join(REPO_ROOT, row.dir, 'content', 'docs');
  return new Set(walk(content).filter((f) => /\.mdx?$/u.test(f)).map((f) => urlOf(content, f)));
};

const text = (f: string): string => readFileSync(f, 'utf8');
const escape = (s: string): string => s.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);

// ─── Running a step for real, as deploy-lock.test.ts does ─────────────────────────────

interface Step {
  name?: string;
  id?: string;
  run?: string;
}
interface Workflow {
  jobs?: Record<string, { steps?: Step[] }>;
}
const workflow = (file: string): Workflow => loadYaml(read(join('.github', 'workflows', file))) as Workflow;

function runBlock(job: string, file: string, id: string): string {
  const found = (workflow(file).jobs?.[job]?.steps ?? []).find((s) => s.id === id);
  if (found?.run === undefined) throw new Error(`${file} has no step with id "${id}" in job "${job}" — if it was renamed, rename it here; if it was deleted, the guarantee it carried is gone`);
  return found.run;
}

/** Run a `run:` block under bash at the repo root, with stub binaries first on PATH. */
function runStep(body: string, env: Record<string, string>, stubs: Record<string, string> = {}): { status: number; output: string; githubOutput: string } {
  const dir = scratchDir('vercel-apps-lock-');
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  for (const [name, script] of Object.entries(stubs)) {
    writeFileSync(join(bin, name), `#!/usr/bin/env bash\n${script}\n`);
    chmodSync(join(bin, name), 0o755);
  }
  const scriptFile = join(dir, 'step.sh');
  writeFileSync(scriptFile, body);
  const outFile = join(dir, 'github_output');
  writeFileSync(outFile, '');
  const r = spawnSync('bash', [scriptFile], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { PATH: `${bin}${delimiter}${process.env.PATH ?? ''}`, GITHUB_OUTPUT: outFile, GITHUB_STEP_SUMMARY: join(dir, 'summary'), ...env },
  });
  return { status: r.status ?? -1, output: `${r.stdout ?? ''}${r.stderr ?? ''}`, githubOutput: readFileSync(outFile, 'utf8') };
}

/** The POSIX blocks run on ubuntu-latest; on Windows the stubs are not reliably first on PATH. */
const executes = it.skipIf(process.platform === 'win32');

// ─── Criterion 1 ──────────────────────────────────────────────────────────────────────

describe('criterion 1: every published package has a site, or a written reason', () => {
  it('gives every private: false package under packages/ a row or an excluded entry', () => {
    const missing = unaccounted(publishedPackages(join(REPO_ROOT, 'packages')), TABLE);
    expect(missing, `published with no row in .github/vercel-apps.json and no "excluded" reason: ${missing.join(', ')}`).toEqual([]);
  });

  it('can fail: a fifth published package with neither', () => {
    const dir = scratchDir('packages-');
    for (const name of [...ROWS.map(([, row]) => row.package), 'topsail']) {
      mkdirSync(join(dir, name));
      writeFileSync(join(dir, name, 'package.json'), JSON.stringify({ name }));
    }
    expect(unaccounted(publishedPackages(dir), TABLE)).toEqual(['topsail']);
    expect(unaccounted(publishedPackages(dir), { ...TABLE, excluded: { topsail: '   ' } }), 'a blank reason is not a reason').toEqual(['topsail']);
    expect(unaccounted(publishedPackages(dir), { ...TABLE, excluded: { topsail: 'one page; a section on the front door' } })).toEqual([]);
  });

  it('names only real, published packages in rows and exclusions', () => {
    const published = new Set(publishedPackages(join(REPO_ROOT, 'packages')));
    const stray = [...SITES.map(([, row]) => row.package), ...Object.keys(TABLE.excluded)].filter((name) => !published.has(name));
    expect(stray, 'a row or exclusion for a package that is not published from packages/').toEqual([]);
  });
});

// ─── Criterion 2 ──────────────────────────────────────────────────────────────────────

describe('criterion 2: every row is an app, and every app is a row', () => {
  it.each(SITES)('%s: its directory exists and its workspace is the row’s', (key, row) => {
    expect(existsSync(join(REPO_ROOT, row.dir, 'package.json')), `${row.dir} does not exist (row '${key}')`).toBe(true);
    expect(manifestAt(row.dir).name, `${row.dir}/package.json is not named '${row.workspace}'`).toBe(row.workspace);
    expect(row.package, 'an app key is the package it documents — it is also the subdomain').toBe(key);
  });

  it('has no Next app under apps/ that the table does not name', () => {
    const dirs = new Set(SITES.map(([, row]) => row.dir));
    const apps = readdirSync(join(REPO_ROOT, 'apps'))
      .map((name) => `apps/${name}`)
      .filter((dir) => existsSync(join(REPO_ROOT, dir, 'next.config.mjs')));
    expect(apps.filter((dir) => !dirs.has(dir)), 'a docs app with no row is an app no workflow can deploy').toEqual([]);
  });

  it.each(SITES)('%s: has an index page and depends on the chassis and on its own package (R10a)', (_key, row) => {
    expect(pagesOf(row).has('/docs'), `${row.dir}/content/docs has no index`).toBe(true);
    const m = manifestAt(row.dir);
    expect(m.dependencies?.['docs-chassis'], `${row.dir} does not depend on docs-chassis`).toBeDefined();
    // Turbo's affected set only reaches an app through its dependencies; without this a
    // change to the package would never redeploy the site that documents it.
    expect({ ...m.dependencies, ...m.devDependencies }[row.package], `${row.dir} does not depend on ${row.package}`).toBeDefined();
  });

  it.each(SITES.filter(([, row]) => !row.familyPages))('%s: carries the page for the incumbent a reader arrives from', (_key, row) => {
    expect([...pagesOf(row)].some((url) => url.startsWith('/docs/coming-from/')), `${row.dir} has no /docs/coming-from/<incumbent> page`).toBe(true);
  });

  it.each(SITES)('%s: every workspace is kept out of changesets', (_key, row) => {
    // A private docs site that changesets tries to version fails `changeset version`. The
    // ignore list is a glob, so a new app needs no edit here — this checks the glob holds.
    const ignore = (JSON.parse(read('.changeset/config.json')) as { ignore: string[] }).ignore;
    const matches = ignore.some((pattern) => (pattern.endsWith('*') ? row.workspace.startsWith(pattern.slice(0, -1)) : row.workspace === pattern));
    expect(matches, `${row.workspace} is not matched by .changeset/config.json "ignore"`).toBe(true);
  });
});

// ─── Rows are well-formed ─────────────────────────────────────────────────────────────

describe('each row states its own facts, and no two rows share one', () => {
  it('lives on its own subdomain', () => {
    for (const [key, row] of SITES) expect(row.productionUrl, key).toBe(`https://${key}.interlace.tools`);
    expect(new Set(SITES.map(([, row]) => row.productionUrl)).size).toBe(SITES.length);
  });

  it('points at its own Vercel project', () => {
    // The copy-paste this table makes likely: a row duplicated, only the key changed, and two
    // hosts deploying into one project.
    for (const [key, row] of ROWS) expect(row.projectId, key).toMatch(/^prj_[A-Za-z0-9]+$/u);
    expect(new Set(ROWS.map(([, row]) => row.projectId)).size, 'two rows share a Vercel project').toBe(ROWS.length);
    expect(TABLE.orgId).toMatch(/^team_[A-Za-z0-9]+$/u);
  });

  it('builds from the repo root, every row (PR #85)', () => {
    for (const [key, row] of SITES) expect(row.rootDirectory, key).toBe('');
  });

  it('keeps per-app build settings out of the root vercel.json, which every project reads', () => {
    const vercel = JSON.parse(read('vercel.json')) as Record<string, unknown>;
    expect(Object.keys(vercel).filter((k) => ['buildCommand', 'outputDirectory', 'rootDirectory'].includes(k))).toEqual([]);
  });
});

// ─── Criterion 3 ──────────────────────────────────────────────────────────────────────

describe('criterion 3: one copy of every family-wide page', () => {
  const family = ROWS.filter(([, row]) => row.familyPages);

  it('has exactly one front door', () => {
    expect(family.map(([key]) => key), 'exactly one row may be familyPages: true').toHaveLength(1);
  });

  it('keeps compatibility, comparison and gallery in the front door', () => {
    const dir = join(REPO_ROOT, family[0]![1].dir, 'content', 'docs');
    for (const page of FAMILY_PAGES) expect(existsSync(join(dir, page)), `${page} is missing from the front door`).toBe(true);
  });

  it('has no family-wide page anywhere else under apps/', () => {
    const familyDir = join(REPO_ROOT, family[0]![1].dir);
    const copies = walk(join(REPO_ROOT, 'apps'))
      .filter((f) => !f.startsWith(`${familyDir}/`))
      .filter((f) => FAMILY_PAGES.some((page) => f.endsWith(`/${page}`)))
      .map((f) => relative(REPO_ROOT, f));
    expect(copies, 'a second copy of a family-wide page is not a stale page, it is a wrong one').toEqual([]);
  });

  it('writes both generated pages into the front door, never a second app', () => {
    const dir = join(REPO_ROOT, family[0]![1].dir, 'content', 'docs');
    expect(COMPAT_OUT).toBe(join(dir, 'compatibility.mdx'));
    expect(GALLERY_OUT).toBe(join(dir, 'gallery.mdx'));
  });
});

// ─── Criterion 4 ──────────────────────────────────────────────────────────────────────

/** The module an app states its site in: `src/site.ts`, or the front door's `src/lib/site.ts`. */
const siteModule = (row: PendingRow): string => [join(row.dir, 'src', 'site.ts'), join(row.dir, 'src', 'lib', 'site.ts')].find((f) => existsSync(join(REPO_ROOT, f))) ?? `${row.dir}/src/site.ts`;

describe('criterion 4: each app resolves its own row’s host', () => {
  it.each(SITES)('%s', async (key, row) => {
    // eslint-disable-next-line node-security/no-dynamic-dependency-loading -- one module per row of a table; the path is the app's own site module, resolved from the repo, never from input
    const { site } = (await import(pathToFileURL(join(REPO_ROOT, siteModule(row))).href)) as { site?: { key: string; url: string } };
    expect(site, `${siteModule(row)} exports no \`site\``).toBeDefined();
    expect(site?.url, `${siteModule(row)} resolves ${site?.url ?? 'nothing'} — not its own row's host`).toBe(row.productionUrl);
    expect(site?.key).toBe(key);
  });

  it('writes no host literal into any app’s source', () => {
    // The host is the row's. A literal in `src/` is the second copy that drifts.
    const hosts = SITES.map(([, row]) => new URL(row.productionUrl).host);
    const offenders = SITES.flatMap(([, row]) => walk(join(REPO_ROOT, row.dir, 'src')))
      .concat(walk(join(REPO_ROOT, 'apps', 'docs-chassis', 'src')))
      .filter((f) => /\.(?:ts|tsx|mjs)$/u.test(f))
      .filter((f) => hosts.some((host) => readFileSync(f, 'utf8').includes(host)))
      .map((f) => relative(REPO_ROOT, f));
    expect(offenders).toEqual([]);
  });
});

// ─── Criterion 5 ──────────────────────────────────────────────────────────────────────

describe('criterion 5: no workflow names an app', () => {
  const GITHUB = join(REPO_ROOT, '.github');
  const files = walk(GITHUB).filter((f) => f !== TABLE_PATH && /\.(?:ya?ml|md|json)$/u.test(f));

  it('finds the workflows it is guarding', () => {
    expect(files.some((f) => f.endsWith('deploy-docs.yml'))).toBe(true);
    expect(files.some((f) => f.endsWith('auto-deploy.yml'))).toBe(true);
  });

  it.each(SITES)('%s: its host, project, directory and workspace appear in .github/ only in the table', (_key, row) => {
    const facts = [new URL(row.productionUrl).host, ...('projectId' in row ? [(row as Row).projectId] : []), `--filter=${row.workspace}`];
    const dir = new RegExp(String.raw`${escape(row.dir)}(?![\w-])`, 'u');
    const hits = files.flatMap((f) => [...facts.filter((fact) => text(f).includes(fact)), ...(dir.test(text(f)) ? [row.dir] : [])].map((fact) => `${relative(REPO_ROOT, f)}: ${fact}`));
    expect(hits).toEqual([]);
  });

  it.each(SITES)('%s: the deploy path never names the app at all', (key) => {
    // The files that deploy (they mention Vercel or dispatch deploy-docs.yml) and the setup
    // action they share. A package name elsewhere — "grade burgee" in compat.yml — is about
    // the package; here, any mention is a per-app branch or a hand-kept mapping.
    const deployPath = files.filter((f) => /vercel|deploy-docs\.yml/iu.test(text(f)) || f.endsWith(join('actions', 'setup', 'action.yml')));
    expect(deployPath.length).toBeGreaterThanOrEqual(2);
    const word = new RegExp(String.raw`(?<![\w.-])${escape(key)}(?![\w-])`, 'u');
    expect(deployPath.filter((f) => word.test(text(f))).map((f) => relative(REPO_ROOT, f))).toEqual([]);
  });

  executes('refuses an app the table does not have, and resolves every one it does', () => {
    const body = runBlock('preflight', 'deploy-docs.yml', 'app');
    const unknown = runStep(body, { APP: 'topsail' });
    expect(unknown.status, `an unknown app exited ${unknown.status}; it must fail\n${unknown.output}`).not.toBe(0);
    expect(unknown.output).toContain('Known:');
    expect(unknown.githubOutput).not.toContain('project_id=');
    for (const [key, row] of ROWS) {
      const r = runStep(body, { APP: key });
      expect(r.status, `${key}: ${r.output}`).toBe(0);
      expect(r.githubOutput).toContain(`project_id=${row.projectId}\n`);
      expect(r.githubOutput).toContain(`production_url=${row.productionUrl}\n`);
      expect(r.githubOutput).toContain(`output_directory=${row.outputDirectory}\n`);
      expect(r.githubOutput).toContain(`org_id=${TABLE.orgId}\n`);
    }
  });

  executes('maps the affected workspaces onto exactly their rows', () => {
    const body = runBlock('affected', 'auto-deploy.yml', 'compute');
    const affected = (workspaces: string[]): string[] => {
      const json = JSON.stringify({ tasks: workspaces.map((p) => ({ package: p, task: 'build' })) });
      const r = runStep(body, { BEFORE_SHA: 'a'.repeat(40) }, { npx: `printf '%s' '${json}'`, git: 'exit 0' });
      expect(r.status, r.output).toBe(0);
      return JSON.parse(/^apps=(.*)$/mu.exec(r.githubOutput)?.[1] ?? 'null') as string[];
    };
    const family = ROWS.find(([, row]) => row.familyPages)!;
    const sibling = ROWS.find(([, row]) => !row.familyPages)!;
    // The front door's workspace is a prefix of every other app's; a substring match would
    // deploy all of them for a change to one.
    expect(affected([family[1].workspace])).toEqual([family[0]]);
    expect(affected([sibling[1].workspace, sibling[1].package, 'compat-oracle'])).toEqual([sibling[0]]);
    expect(affected(['compat-oracle'])).toEqual([]);
    expect(affected(ROWS.map(([, row]) => row.workspace)).toSorted()).toEqual(ROWS.map(([key]) => key).toSorted());
  });
});

// ─── A pending app is built, and never deployed ───────────────────────────────────────

describe('a pending app is built, and never deployed', () => {
  it.each(PENDING)('%s: carries no Vercel project — one that has a project is a row', (_key, row) => {
    expect('projectId' in row, 'a pending entry with a projectId belongs in "apps"').toBe(false);
  });

  it.each(PENDING)('%s: is not also a deployable row', (key) => {
    expect(Object.keys(TABLE.apps)).not.toContain(key);
    expect(ROWS.map(([, row]) => row.workspace)).not.toContain(TABLE.pending?.[key]?.workspace);
  });

  it.each(PENDING)('%s: keeps its package’s excluded reason, so links to it still land on the front door', (_key, row) => {
    expect((TABLE.excluded[row.package] ?? '').trim(), `${row.package} is pending with no "excluded" reason`).not.toBe('');
  });

  executes.each(PENDING)('%s: deploy-docs.yml refuses it, as it refuses an app the table does not have', (key) => {
    const r = runStep(runBlock('preflight', 'deploy-docs.yml', 'app'), { APP: key });
    expect(r.status, `a pending app resolved for deploy: ${r.output}`).not.toBe(0);
    expect(r.githubOutput).not.toContain('project_id=');
  });

  executes.each(PENDING)('%s: auto-deploy.yml maps its workspace onto no row', (_key, row) => {
    const json = JSON.stringify({ tasks: [{ package: row.workspace, task: 'build' }, { package: row.package, task: 'build' }] });
    const r = runStep(runBlock('affected', 'auto-deploy.yml', 'compute'), { BEFORE_SHA: 'a'.repeat(40) }, { npx: `printf '%s' '${json}'`, git: 'exit 0' });
    expect(r.status, r.output).toBe(0);
    const apps = JSON.parse(/^apps=(.*)$/mu.exec(r.githubOutput)?.[1] ?? 'null') as string[];
    expect(apps.filter((app) => PENDING.some(([key]) => key === app))).toEqual([]);
  });

  it('no deployed app links to a pending host, which serves nothing yet', () => {
    const hosts = PENDING.map(([, row]) => new URL(row.productionUrl).host);
    const offenders = ROWS.flatMap(([, row]) => walk(join(REPO_ROOT, row.dir, 'content')))
      .filter((f) => /\.mdx?$/u.test(f))
      .flatMap((file) => links(file).filter((href) => hosts.some((host) => href.includes(`//${host}`))).map((href) => `${relative(REPO_ROOT, file)} → ${href}`));
    expect(offenders).toEqual([]);
  });
});

// ─── The chassis is private ───────────────────────────────────────────────────────────

describe('the chassis stays a private workspace (intent constraint 5)', () => {
  it('is private, and not among the published packages', () => {
    const chassis = manifestAt('apps/docs-chassis');
    // Flip this and a docs framework becomes a published product, against PRINCIPLES.md rule 8.
    expect(chassis.private).toBe(true);
    expect(existsSync(join(REPO_ROOT, 'packages', 'docs-chassis'))).toBe(false);
  });

  it('is a dependency of nothing under packages/', () => {
    const dependents = readdirSync(join(REPO_ROOT, 'packages'))
      .filter((dir) => existsSync(join(REPO_ROOT, 'packages', dir, 'package.json')))
      .filter((dir) => {
        const m = manifestAt(join('packages', dir));
        return 'docs-chassis' in { ...m.dependencies, ...m.devDependencies, ...m.peerDependencies };
      });
    expect(dependents).toEqual([]);
  });
});

// ─── R4/R5: a package app is the chassis plus its own facts ──────────────────────────

/**
 * The files a package app may make its own. Everything else outside `content/` is a shim at
 * a path Next requires, and the chassis owns what it does — so it is the same bytes in every
 * package app (spec R5). `examples.test.ts` runs each page's own fenced examples against its
 * own package's bin and environment; the icon is the package's mark.
 */
const OWN = new Set(['package.json', 'src/site.ts', 'src/app/icon.svg', 'tests/examples.test.ts']);
/** Of {@link OWN}, the two that state nothing but the app's key: its name, its row, its package. */
const KEYED = ['package.json', 'src/site.ts'] as const;
/** Every package app: each row and pending app that is not the front door. */
const PACKAGE_APPS = SITES.filter(([, row]) => !row.familyPages);

/**
 * An app's files outside `content/`, posix and relative to the app: what git tracks plus what
 * it would track, so build output (`.next`, `next-env.d.ts`, `.examples-*`) never counts.
 */
function appFiles(dir: string): string[] {
  const r = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '--', dir], { cwd: REPO_ROOT, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ls-files ${dir} failed: ${r.stderr}`);
  return r.stdout
    .split('\n')
    .filter((f) => f !== '' && existsSync(join(REPO_ROOT, f)))
    .map((f) => f.slice(dir.length + 1))
    .filter((f) => !f.startsWith('content/'))
    .toSorted();
}

/** The published family packages, by name: the only dependencies an app may add beyond its own. */
const FAMILY = new Set(publishedPackages(join(REPO_ROOT, 'packages')));

/**
 * A keyed file's text with the app key folded to a placeholder, so two apps compare on their
 * shape. In `package.json` a dependency on a *sibling* family package is set aside first: a page
 * may run an example that imports one (controlroom's import flagstaff), and that is content, not
 * chassis. Any other extra dependency still differs.
 */
function unkeyed(dir: string, file: string, key: string): string {
  if (file !== 'package.json') return read(join(dir, file)).replaceAll(key, '<key>');
  const manifest = JSON.parse(read(join(dir, file))) as Record<string, unknown>;
  for (const field of ['dependencies', 'devDependencies'] as const) {
    const deps = manifest[field] as Record<string, string> | undefined;
    if (deps) manifest[field] = Object.fromEntries(Object.entries(deps).filter(([name]) => name === key || !FAMILY.has(name)));
  }
  return JSON.stringify(manifest, null, 2).replaceAll(key, '<key>');
}

describe('R4/R5: a package app is the chassis plus its own facts', () => {
  const [refKey, ref] = PACKAGE_APPS[0]!;
  const refFiles = appFiles(ref.dir);

  it('finds the package apps and the shims it is comparing', () => {
    expect(PACKAGE_APPS.length).toBeGreaterThanOrEqual(2);
    // The Next-required paths R5 names; if the reference lost one, every app "matches" its gap.
    for (const shim of ['next.config.mjs', 'source.config.ts', 'src/app/layout.tsx', 'src/app/llms.txt/route.ts', 'src/source.ts']) {
      expect(refFiles, `${ref.dir} has no ${shim}`).toContain(shim);
    }
  });

  it.each(PACKAGE_APPS.slice(1))('%s: has exactly the files every other package app has, outside content/', (_key, row) => {
    const files = appFiles(row.dir);
    const missing = refFiles.filter((f) => !files.includes(f));
    const extra = files.filter((f) => !refFiles.includes(f));
    expect({ missing, extra }, `${row.dir} against ${ref.dir}: a shim one app lacks, or a file only one app has, is an app that stopped being a row`).toEqual({ missing: [], extra: [] });
  });

  it.each(PACKAGE_APPS.slice(1))('%s: every shim is the same bytes as in every other package app', (_key, row) => {
    // A shim that grows logic in one app is the copy R5 exists to prevent: the next fix lands
    // in the chassis and misses it. Logic an app needs goes into the chassis, behind its row.
    const shims = refFiles.filter((f) => !OWN.has(f) && existsSync(join(REPO_ROOT, row.dir, f)));
    const differ = shims.filter((f) => read(join(row.dir, f)) !== read(join(ref.dir, f)));
    expect(differ, `${row.dir} differs from ${ref.dir} in these shims`).toEqual([]);
  });

  it.each(PACKAGE_APPS.slice(1))('%s: its package.json and site.ts differ from the others only by the key', (key, row) => {
    for (const file of KEYED) {
      expect(unkeyed(row.dir, file, key), `${row.dir}/${file} says more than its key — compare ${ref.dir}/${file}`).toBe(unkeyed(ref.dir, file, refKey));
    }
  });

  it('keeps every source shim a call into the chassis', () => {
    // Identical across apps could still be identical copies of real logic. Each `src/` shim
    // imports the chassis, or this app's own row (`#/site`) and source (`#/source`).
    const thick = refFiles
      .filter((f) => f.startsWith('src/') && /\.(?:ts|tsx|mjs)$/u.test(f) && !OWN.has(f))
      .filter((f) => !/from '(?:docs-chassis\/[\w-]+|#\/(?:site|source))'/u.test(read(join(ref.dir, f))));
    expect(thick, `these shims in ${ref.dir} import nothing from docs-chassis`).toEqual([]);
  });
});

// ─── No link across the move breaks ───────────────────────────────────────────────────

const BY_HOST = new Map(ROWS.map(([, row]) => [new URL(row.productionUrl).host, row]));

/** Every link target in a content file, fenced code blocks aside. */
function links(file: string): string[] {
  const body = readFileSync(file, 'utf8').replaceAll(/```[\s\S]*?```/gu, '');
  return [...body.matchAll(/\]\(([^)\s]+)\)|href="([^"]+)"/gu)].map((m) => m[1] ?? m[2] ?? '');
}

/**
 * A path the app serves from a route handler rather than a content page — `/llms.txt` is
 * `src/app/llms.txt/route.ts`, which every package README's *For agents* section links.
 */
const routed = (row: PendingRow, path: string): boolean => path !== '' && existsSync(join(REPO_ROOT, row.dir, 'src', 'app', ...path.split('/').filter(Boolean), 'route.ts'));

/**
 * A link to a file or directory of this repo on `main`. Generated pages (the API reference,
 * the benchmark and compatibility pages, every README copy) write these by the hundred, and
 * a file that moves leaves each one a GitHub 404 that no build notices.
 */
const REPO_PATH = /^https:\/\/github\.com\/ofri-peretz\/burgee\/(?:blob|tree)\/main\/(.+)$/u;

/**
 * Whether `href`, written in `row`'s content, lands on a page: a root-relative `/docs` link
 * against the app it is in, an absolute link to any row's host against that row's app — its
 * content pages, or a route handler — and a blob or tree link into this repo against the
 * checkout. Links anywhere else — npm, another repo, a site's home page — are not this
 * lock's to judge.
 */
function lands(row: PendingRow, href: string): boolean {
  const target = href.replace(/[#?].*$/u, '').replace(/\/$/u, '');
  if (target.startsWith('/docs')) return pagesOf(row).has(target.replace(/\.md$/u, ''));
  const inRepo = REPO_PATH.exec(target);
  if (inRepo) return existsSync(join(REPO_ROOT, decodeURIComponent(inRepo[1] ?? '')));
  if (!target.startsWith('https://')) return true;
  const url = new URL(target);
  const owner = BY_HOST.get(url.host);
  const path = url.pathname.replace(/\/$/u, '');
  return owner === undefined || path === '' || pagesOf(owner).has(path.replace(/\.md$/u, '')) || routed(owner, path);
}

describe('every link in every app’s content lands on a page', () => {
  it('counts a route handler as a page, and only one that exists', () => {
    const [, row] = ROWS.find(([, r]) => !r.familyPages)!;
    const host = row.productionUrl;
    expect(lands(row, `${host}/llms.txt`)).toBe(true);
    expect(lands(row, `${host}/llms-nowhere.txt`)).toBe(false);
  });

  it('counts a blob or tree link into this repo as landing only on a path that exists', () => {
    const [, row] = ROWS[0]!;
    const repo = 'https://github.com/ofri-peretz/burgee';
    expect(lands(row, `${repo}/blob/main/scripts/vercel-apps-lock.test.ts#L1`)).toBe(true);
    expect(lands(row, `${repo}/tree/main/apps/docs-chassis/`)).toBe(true);
    expect(lands(row, `${repo}/blob/main/scripts/vercel-apps-lock.test.mts`)).toBe(false);
    expect(lands(row, `${repo}/tree/main/apps/docs-nowhere`)).toBe(false);
  });

  it.each(SITES)('%s', (_key, row) => {
    const broken = walk(join(REPO_ROOT, row.dir, 'content'))
      .filter((f) => /\.mdx?$/u.test(f))
      .flatMap((file) => links(file).filter((href) => !lands(row, href)).map((href) => `${relative(REPO_ROOT, file)} → ${href}`));
    expect(broken, 'a link to a page its host does not serve — relative links resolve against the app they are in').toEqual([]);
  });
});

// ─── A changeset's bare `#N` is a link to this repo ───────────────────────────────────

/**
 * Every issue link the release's own changelog generator writes into this repo, for one
 * changeset summary. `@changesets/changelog-github` turns every bare `#N` outside a markdown
 * link into `[#N](…/ofri-peretz/burgee/issues/N)` — inside a code span too. So "yargs #1519"
 * shipped as a 404 (this repo has no issue 1519), "CodeQL #27" as a link to an unrelated
 * issue, and `'#336699'`, a colour, as markdown printed inside a code span in nine CHANGELOGs
 * and their changelog pages. The generator is run rather than its pattern copied, so the
 * lock moves when it does; with no `pr:` or `commit:` line it calls no API.
 */
async function linkedIssues(summary: string): Promise<string[]> {
  const line = await changelogGithub.getReleaseLine({ id: 'lock', summary, releases: [] }, 'patch', { repo: 'ofri-peretz/burgee' });
  return [...line.matchAll(/\[#(\d+)\]\(https:\/\/github\.com\/ofri-peretz\/burgee\/issues\/\d+\)/gu)].map((m) => `#${m[1] ?? ''}`);
}

describe('no pending changeset writes an issue link its author did not', () => {
  it('reads the generator: a bare #N links this repo, an explicit link stays as written', async () => {
    expect(await linkedIssues('flushes stdout before exit (yargs #1519, #2118)')).toEqual(['#1519', '#2118']);
    expect(await linkedIssues("with `{ accent: '#336699' }`")).toEqual(['#336699']);
    expect(await linkedIssues('yargs [#1519](https://github.com/yargs/yargs/issues/1519)')).toEqual([]);
    expect(await linkedIssues('[#848](https://github.com/ofri-peretz/burgee/pull/848)')).toEqual([]);
  });

  it('every .changeset/*.md', async () => {
    const dir = join(REPO_ROOT, '.changeset');
    const names = readdirSync(dir).filter((f) => f.endsWith('.md') && f !== 'README.md');
    const perFile = await Promise.all(
      names.map(async (name) => {
        const summary = readFileSync(join(dir, name), 'utf8').replace(/^---\n[\s\S]*?\n---\n/u, '').trim();
        return (await linkedIssues(summary)).map((ref) => `.changeset/${name} → ${ref}`);
      }),
    );
    const offenders = perFile.flat();
    expect(
      offenders,
      'a bare #N becomes a link to this repo’s issue N. Write the link yourself — [yargs#1519](https://github.com/yargs/yargs/issues/1519), [#848](https://github.com/ofri-peretz/burgee/pull/848) — and keep a colour like #336699 out of a changeset, or give it a letter (#3366aa)',
    ).toEqual([]);
  });
});
