/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — what `burgee migrate` reports for blessed, neo-blessed and terminal-kit, and the
 * coming-from guides it points at, agree (controlroom spec R18).
 *
 * The codemod's guided rules live in `packages/burgee/src/migrate-guided.ts`; the guides live
 * in the docs app. Each side can drift without the other noticing: a renamed heading turns
 * every link a report prints into a link to the top of a page, a factory added to the rules
 * points users at a section that never mentions it, and the example report on a guide stops
 * being what the command prints. And the guides describe an API that is mostly not built, so
 * the most dangerous drift is a snippet that reads as working code when controlroom does not
 * export what it imports. Each of those is a case below, derived from the rule tables and the
 * page files rather than restated, in the manner of `migrate-drop-ins-lock.test.ts`.
 *
 * Proven red, one mutation each: renaming `### Key handling` on one guide fails "every section
 * a report links to is a heading"; removing `listtable()` from the blessed guide fails "names
 * every call it reports"; changing a line number in a guide's example report fails "prints
 * what the command prints"; deleting a `// Planned, not built` line fails "marks every
 * snippet that imports what controlroom does not export"; dropping a row from the Migrate
 * page's guided table fails "lists exactly the patterns it reports".
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// eslint-disable-next-line import-next/no-relative-packages -- by path: the docs chassis is a private workspace under apps/, and scripts read the app table through its one typed reader rather than re-parsing it
import { familyApp } from '../apps/docs-chassis/src/config';
// eslint-disable-next-line import-next/no-relative-packages -- by path, never by name: a bare `burgee/*` resolves from another checkout's dist/ in an uninstalled worktree, and these modules are not exports
import { BLESSED_FACTORIES, GUIDE_BASE, GUIDED_HOSTS, guidedSites, METHODS, SECTIONS, TERMKIT_MEMBERS, type GuidedHost } from '../packages/burgee/src/migrate-guided.js';
// eslint-disable-next-line import-next/no-relative-packages -- by path, for the same reason as the line above
import { tokensOf } from '../packages/burgee/src/migrate.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

/** The guide for `host`, in whichever app holds it: the front door now, controlroom's own app once it has one. */
function guidePath(host: GuidedHost): string | undefined {
  return readdirSync(join(ROOT, 'apps'))
    .map((app) => join(ROOT, 'apps', app, 'content', 'docs', 'coming-from', `${host}.mdx`))
    .find((path) => existsSync(path));
}

const guides = GUIDED_HOSTS.map((host) => ({ host, path: guidePath(host), text: readFileSync(guidePath(host) ?? join(ROOT, 'package.json'), 'utf8') }));

/** A heading's anchor as the docs site slugs it (github-slugger): lower case, punctuation dropped, spaces to hyphens. */
const slug = (heading: string): string =>
  heading
    .toLowerCase()
    .replaceAll(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replaceAll(/\s/gu, '-');

const headings = (text: string): string[] => [...text.matchAll(/^#{2,6} (.+)$/gmu)].map(([, h]) => slug(h!));

/** Every fenced block: language and body. */
const fences = (text: string): { lang: string; body: string }[] => [...text.matchAll(/^```(\w*)[^\n]*\n([\s\S]*?)^```$/gmu)].map(([, lang, body]) => ({ lang: lang!, body: body! }));

/** Every identifier the page shows as code, inline or fenced. */
function codeNames(text: string): Set<string> {
  const code = [...text.matchAll(/`([^`\n]+)`/gu)].map(([, c]) => c!).concat(fences(text).map((f) => f.body));
  return new Set(code.flatMap((c) => c.match(/[A-Za-z_$][\w$]*/gu) ?? []));
}

/** The receivers each incumbent's rules follow — `METHODS` is keyed by them. */
const KINDS: Record<GuidedHost, readonly (keyof typeof METHODS)[]> = {
  blessed: ['screen', 'element', 'program'],
  'neo-blessed': ['screen', 'element', 'program'],
  'terminal-kit': ['terminal', 'buffer'],
};

/** Every call name the rules decide by, for one incumbent. */
function reported(host: GuidedHost): string[] {
  const made = host === 'terminal-kit' ? Object.keys(TERMKIT_MEMBERS) : Object.keys(BLESSED_FACTORIES);
  return [...new Set([...made, ...KINDS[host].flatMap((kind) => Object.keys(METHODS[kind]))])];
}

describe('every guide a report links to exists, where the link says', () => {
  it.each(GUIDED_HOSTS)('has a page for %s', (host) => {
    expect(guidePath(host), `no coming-from/${host}.mdx under any apps/*/content/docs`).toBeDefined();
  });

  it("links the front door's coming-from path, which follows a guide that moves", () => {
    // `familyRedirects()` 301s the front door's `/docs/coming-from/<slug>` to whichever app now
    // holds the file, so this base stays right when controlroom gets a docs host of its own.
    expect(GUIDE_BASE).toBe(`${familyApp().productionUrl}/docs/coming-from`);
  });

  it.each(guides)('every section a report links to is a heading on $host', ({ text }) => {
    const anchors = headings(text);
    expect(Object.values(SECTIONS).filter((section) => !anchors.includes(section))).toEqual([]);
  });
});

describe('each guide names every call it reports', () => {
  it('derives a list, so the comparison cannot pass vacuously', () => {
    expect(reported('blessed').length).toBeGreaterThan(15);
    expect(reported('terminal-kit').length).toBeGreaterThan(10);
  });

  it.each(guides)('$host names every call its rules report', ({ host, text }) => {
    const shown = codeNames(text);
    expect(reported(host).filter((name) => !shown.has(name))).toEqual([]);
  });
});

describe("each guide's example report is what the command prints", () => {
  it.each(guides.filter(({ host }) => host !== 'neo-blessed'))('$host prints what the command prints', ({ text }) => {
    // The example is the first program on the page, followed by the report it produces.
    const blocks = fences(text);
    const at = blocks.findIndex((b, i) => b.lang === 'js' && blocks[i + 1]?.lang === 'json');
    expect(at, 'no js block followed by its json report').toBeGreaterThanOrEqual(0);
    const printed = guidedSites(tokensOf(blocks[at]!.body)).map((site) => ({ file: 'src/ui.js', ...site }));
    expect(JSON.parse(blocks[at + 1]!.body)).toEqual(printed);
  });
});

/** What `controlroom`'s entry exports on this commit — names, values and types alike. */
function controlroomExports(): Set<string> {
  const source = readFileSync(join(ROOT, 'packages/controlroom/src/index.ts'), 'utf8');
  const declared = [...source.matchAll(/^export (?:const|let|function|class|type|interface) ([A-Za-z_$][\w$]*)/gmu)].map(([, n]) => n!);
  const listed = [...source.matchAll(/^export (?:type )?\{([^}]*)\}/gmu)].flatMap(([, list]) =>
    list!
      .split(',')
      .map((part) => part.trim().replace(/^type /u, '').split(/\s+as\s+/u).at(-1)!)
      .filter((n) => n !== ''),
  );
  return new Set([...declared, ...listed]);
}

describe('no snippet reads as working code that controlroom cannot run', () => {
  const exported = controlroomExports();
  const snippets = guides.flatMap(({ host, text }) =>
    fences(text)
      .map((f) => ({ host, body: f.body, names: [...f.body.matchAll(/import \{([^}]*)\} from 'controlroom(?:\/[\w-]+)?'/gu)].flatMap(([, list]) => list!.split(',').map((n) => n.trim().replace(/^type /u, '')).filter((n) => n !== '')) }))
      .filter((s) => s.names.length > 0),
  );

  it('finds controlroom snippets to check, so the check cannot pass vacuously', () => {
    expect(snippets.length).toBeGreaterThanOrEqual(4);
    expect(exported.has('status')).toBe(true);
  });

  it.each(snippets.map((s) => [s.host, s.names.join(', '), s] as const))('%s: a snippet importing %s is marked when controlroom does not export it', (_host, _names, { body, names }) => {
    const missing = names.filter((n) => !exported.has(n));
    if (missing.length === 0) return;
    expect(body.split('\n')[0], `imports ${missing.join(', ')}, which controlroom does not export, with no "// Planned, not built" first line`).toMatch(/^\/\/ Planned, not built\b/u);
  });
});

describe("the Migrate page lists exactly the patterns it reports", () => {
  const page = readFileSync(join(ROOT, 'apps/docs/content/docs/migrate.mdx'), 'utf8');
  const rows = [...page.matchAll(/^\| `([a-z-]+)` \| .+ \| .+ \| .+ \|$/gmu)].map(([, pattern]) => pattern!);

  it('reads a table, so the comparison cannot pass vacuously', () => {
    expect(rows.length).toBeGreaterThan(5);
  });

  it('holds the table equal to SECTIONS, row for row', () => {
    expect(rows).toEqual(Object.keys(SECTIONS));
  });
});
