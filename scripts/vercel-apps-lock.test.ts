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
 */
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { load as loadYaml } from 'js-yaml';
import { describe, expect, it } from 'vitest';

import { OUT as COMPAT_OUT } from './compat-page.js';
import { OUT as GALLERY_OUT } from './gallery-page.js';

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
interface Table {
  orgId: string;
  apps: Record<string, Row>;
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
const pagesOf = (row: Row): Set<string> => {
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
  const dir = mkdtempSync(join(tmpdir(), 'vercel-apps-lock-'));
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
    const dir = mkdtempSync(join(tmpdir(), 'packages-'));
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
    const stray = [...ROWS.map(([, row]) => row.package), ...Object.keys(TABLE.excluded)].filter((name) => !published.has(name));
    expect(stray, 'a row or exclusion for a package that is not published from packages/').toEqual([]);
  });
});

// ─── Criterion 2 ──────────────────────────────────────────────────────────────────────

describe('criterion 2: every row is an app, and every app is a row', () => {
  it.each(ROWS)('%s: its directory exists and its workspace is the row’s', (key, row) => {
    expect(existsSync(join(REPO_ROOT, row.dir, 'package.json')), `${row.dir} does not exist (row '${key}')`).toBe(true);
    expect(manifestAt(row.dir).name, `${row.dir}/package.json is not named '${row.workspace}'`).toBe(row.workspace);
    expect(row.package, 'an app key is the package it documents — it is also the subdomain').toBe(key);
  });

  it('has no Next app under apps/ that the table does not name', () => {
    const dirs = new Set(ROWS.map(([, row]) => row.dir));
    const apps = readdirSync(join(REPO_ROOT, 'apps'))
      .map((name) => `apps/${name}`)
      .filter((dir) => existsSync(join(REPO_ROOT, dir, 'next.config.mjs')));
    expect(apps.filter((dir) => !dirs.has(dir)), 'a docs app with no row is an app no workflow can deploy').toEqual([]);
  });

  it.each(ROWS)('%s: has an index page and depends on the chassis and on its own package (R10a)', (_key, row) => {
    expect(pagesOf(row).has('/docs'), `${row.dir}/content/docs has no index`).toBe(true);
    const m = manifestAt(row.dir);
    expect(m.dependencies?.['docs-chassis'], `${row.dir} does not depend on docs-chassis`).toBeDefined();
    // Turbo's affected set only reaches an app through its dependencies; without this a
    // change to the package would never redeploy the site that documents it.
    expect({ ...m.dependencies, ...m.devDependencies }[row.package], `${row.dir} does not depend on ${row.package}`).toBeDefined();
  });

  it.each(ROWS.filter(([, row]) => !row.familyPages))('%s: carries the page for the incumbent a reader arrives from', (_key, row) => {
    expect([...pagesOf(row)].some((url) => url.startsWith('/docs/coming-from/')), `${row.dir} has no /docs/coming-from/<incumbent> page`).toBe(true);
  });

  it.each(ROWS)('%s: every workspace is kept out of changesets', (_key, row) => {
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
    for (const [key, row] of ROWS) expect(row.productionUrl, key).toBe(`https://${key}.interlace.tools`);
    expect(new Set(ROWS.map(([, row]) => row.productionUrl)).size).toBe(ROWS.length);
  });

  it('points at its own Vercel project', () => {
    // The copy-paste this table makes likely: a row duplicated, only the key changed, and two
    // hosts deploying into one project.
    for (const [key, row] of ROWS) expect(row.projectId, key).toMatch(/^prj_[A-Za-z0-9]+$/u);
    expect(new Set(ROWS.map(([, row]) => row.projectId)).size, 'two rows share a Vercel project').toBe(ROWS.length);
    expect(TABLE.orgId).toMatch(/^team_[A-Za-z0-9]+$/u);
  });

  it('builds from the repo root, every row (PR #85)', () => {
    for (const [key, row] of ROWS) expect(row.rootDirectory, key).toBe('');
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

describe('criterion 4: each app resolves its own row’s host', () => {
  /** The module an app states its site in: `src/site.ts`, or the front door's `src/lib/site.ts`. */
  const siteModule = (row: Row): string => [join(row.dir, 'src', 'site.ts'), join(row.dir, 'src', 'lib', 'site.ts')].find((f) => existsSync(join(REPO_ROOT, f))) ?? `${row.dir}/src/site.ts`;

  it.each(ROWS)('%s', async (key, row) => {
    // eslint-disable-next-line node-security/no-dynamic-dependency-loading -- one module per row of a table; the path is the app's own site module, resolved from the repo, never from input
    const { site } = (await import(pathToFileURL(join(REPO_ROOT, siteModule(row))).href)) as { site?: { key: string; url: string } };
    expect(site, `${siteModule(row)} exports no \`site\``).toBeDefined();
    expect(site?.url, `${siteModule(row)} resolves ${site?.url ?? 'nothing'} — not its own row's host`).toBe(row.productionUrl);
    expect(site?.key).toBe(key);
  });

  it('writes no host literal into any app’s source', () => {
    // The host is the row's. A literal in `src/` is the second copy that drifts.
    const hosts = ROWS.map(([, row]) => new URL(row.productionUrl).host);
    const offenders = ROWS.flatMap(([, row]) => walk(join(REPO_ROOT, row.dir, 'src')))
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

  it.each(ROWS)('%s: its host, project, directory and workspace appear in .github/ only in the table', (_key, row) => {
    const facts = [new URL(row.productionUrl).host, row.projectId, `--filter=${row.workspace}`];
    const dir = new RegExp(String.raw`${escape(row.dir)}(?![\w-])`, 'u');
    const hits = files.flatMap((f) => [...facts.filter((fact) => text(f).includes(fact)), ...(dir.test(text(f)) ? [row.dir] : [])].map((fact) => `${relative(REPO_ROOT, f)}: ${fact}`));
    expect(hits).toEqual([]);
  });

  it.each(ROWS)('%s: the deploy path never names the app at all', (key) => {
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

// ─── No link across the move breaks ───────────────────────────────────────────────────

const BY_HOST = new Map(ROWS.map(([, row]) => [new URL(row.productionUrl).host, row]));

/** Every link target in a content file, fenced code blocks aside. */
function links(file: string): string[] {
  const body = readFileSync(file, 'utf8').replaceAll(/```[\s\S]*?```/gu, '');
  return [...body.matchAll(/\]\(([^)\s]+)\)|href="([^"]+)"/gu)].map((m) => m[1] ?? m[2] ?? '');
}

/**
 * Whether `href`, written in `row`'s content, lands on a page: a root-relative `/docs` link
 * against the app it is in, an absolute link to any row's host against that row's app. Links
 * anywhere else — GitHub, npm, a site's home page — are not this lock's to judge.
 */
function lands(row: Row, href: string): boolean {
  const target = href.replace(/[#?].*$/u, '').replace(/\/$/u, '');
  if (target.startsWith('/docs')) return pagesOf(row).has(target.replace(/\.md$/u, ''));
  if (!target.startsWith('https://')) return true;
  const url = new URL(target);
  const owner = BY_HOST.get(url.host);
  const path = url.pathname.replace(/\/$/u, '');
  return owner === undefined || path === '' || pagesOf(owner).has(path.replace(/\.md$/u, ''));
}

describe('every link in every app’s content lands on a page', () => {
  it.each(ROWS)('%s', (_key, row) => {
    const broken = walk(join(REPO_ROOT, row.dir, 'content'))
      .filter((f) => /\.mdx?$/u.test(f))
      .flatMap((file) => links(file).filter((href) => !lands(row, href)).map((href) => `${relative(REPO_ROOT, file)} → ${href}`));
    expect(broken, 'a link to a page its host does not serve — relative links resolve against the app they are in').toEqual([]);
  });
});
