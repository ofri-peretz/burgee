/**
 * The specification pass, against fixture responses — `spec-release-watch` R1 to R5 and R7.
 *
 * Nothing here reaches GitHub: `fetch` is a function that answers from a table of what the
 * releases and tags endpoints return, so a test says "the repo has published 3.1.1 and 3.2.0" and
 * reads back what the pass made of it. Each requirement has a case that fails without the code
 * that meets it.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { scratchDirs } from './__fixtures__/scratch-dir.js';
import {
  adapterFile,
  check,
  compareVersions,
  fetchPublished,
  type Get,
  parseSpecs,
  parseVersion,
  readSpecFiles,
  record,
  type Spec,
  titleOf,
} from './specs.js';

const scratch = scratchDirs();

/** What an endpoint answers: a status and a body. */
interface Reply {
  status?: number;
  remaining?: string;
  body?: unknown;
  throws?: string;
}

/** A `fetch` that answers by URL and keeps what it was asked and with which headers. */
function github(replies: Record<string, Reply>): { get: Get; asked: { url: string; headers: Record<string, string> }[] } {
  const asked: { url: string; headers: Record<string, string> }[] = [];
  const get: Get = (url, init) => {
    asked.push({ url, headers: init.headers });
    const reply = replies[url.replace('https://api.github.com/repos/', '')];
    if (reply?.throws !== undefined) return Promise.reject(new Error(reply.throws));
    const status = reply?.status ?? 200;
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      headers: new Headers(reply?.remaining === undefined ? {} : { 'x-ratelimit-remaining': reply.remaining }),
      json: () => Promise.resolve(reply?.body ?? []),
    });
  };
  return { get, asked };
}

const releases = (...tags: (string | [string, { prerelease?: boolean; draft?: boolean }])[]): unknown[] =>
  tags.map((t) => {
    const [tag_name, flags] = typeof t === 'string' ? [t, {}] : t;
    return { tag_name, html_url: `https://github.com/x/releases/tag/${tag_name}`, prerelease: false, draft: false, ...flags };
  });

const tagged = (...names: string[]): unknown[] => names.map((name) => ({ name }));

/** A `packages/` directory holding one package's `specs.json`. */
function packages(specs: unknown, owner = 'apicontract'): string {
  const dir = scratch('specs-');
  mkdirSync(join(dir, owner), { recursive: true });
  writeFileSync(join(dir, owner, 'specs.json'), JSON.stringify(specs));
  return dir;
}

const unchecked = (ran: Ran): string => ran.unchecked.map((u) => u.error).join('\n');

const entry = (over: Partial<Spec> = {}): Spec => ({ name: 'OpenAPI', repo: 'OAI/OpenAPI-Specification', source: 'releases', reads: ['3.0', '3.1'], ...over });
const refuses: Get = () => Promise.reject('connection reset');
const URL_RELEASES = 'OAI/OpenAPI-Specification/releases?per_page=20';

type Ran = Awaited<ReturnType<typeof check>> & { out: string };

const run = async (specs: Spec[], replies: Record<string, Reply>, token?: string): Promise<Ran> => {
  let out = '';
  const result = await check(packages(specs), (s) => (out += s), { token: token ?? '', get: github(replies).get });
  return Object.assign(result, { out });
};

describe('R1 — the watch list is read from the packages that own one', () => {
  it('reads every package that has a specs.json, in directory order, and skips the rest', () => {
    const dir = packages([entry()], 'zeta');
    mkdirSync(join(dir, 'alpha'));
    writeFileSync(join(dir, 'alpha', 'specs.json'), JSON.stringify([entry({ name: 'Other' })]));
    mkdirSync(join(dir, 'none'));
    expect(readSpecFiles(dir).map((f) => [f.owner, f.specs[0]?.name])).toEqual([
      ['alpha', 'Other'],
      ['zeta', 'OpenAPI'],
    ]);
  });

  it.each([
    ['a file that is not an array', {}, 'not an array'],
    ['an entry that is not an object', [3], 'not an object'],
    ['no name', [{ repo: 'a/b', source: 'tags', reads: [] }], 'no `name`'],
    ['a repo that is not owner/name', [entry({ repo: 'nope' })], 'not owner/name'],
    ['a source that is not releases or tags', [entry({ source: 'rss' as 'tags' })], "not 'releases' or 'tags'"],
    ['a kind that is not known', [entry({ kind: 'blog' as 'spec' })], "not 'spec' or 'test-suite'"],
    ['reads that is not a list of strings', [{ ...entry(), reads: [1] }], 'not a list of strings'],
    ['adapters that is not a list of strings', [{ ...entry(), adapters: 'openapi' }], '`adapters` is not a list'],
    ['a tagPattern that is not a string', [{ ...entry(), tagPattern: 3 }], '`tagPattern` is not a string'],
    ['a tagPattern that is not a regular expression', [entry({ tagPattern: '(' })], 'not a regular expression'],
    ['a seen that is not { version, at }', [{ ...entry(), seen: { version: '1' } }], '`seen` is not'],
  ])('refuses %s, naming the file and the entry, and says how to fix it', (_why, raw, reason) => {
    let message = '';
    try {
      parseSpecs(raw, 'packages/apicontract/specs.json');
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('packages/apicontract/specs.json');
    expect(message).toContain(reason);
    expect(message).toContain('fix:');
  });

  it('accepts the whole shape: kind, tagPattern, adapters and seen', () => {
    const full = { ...entry(), kind: 'test-suite', tagPattern: '^v(.+)$', adapters: ['openapi'], seen: { version: '3.1.0', at: '2026-11-22' } };
    expect(parseSpecs([full], 'x')).toEqual([full]);
  });
});

const v = (text: string): NonNullable<ReturnType<typeof parseVersion>> => parseVersion(text) as NonNullable<ReturnType<typeof parseVersion>>;

describe('versions compare by the specification’s own scheme', () => {
  it('reads semver with a missing minor or patch, a leading v and a candidate suffix', () => {
    expect(parseVersion('3.1')).toEqual({ scheme: 'semver', parts: [3, 1, 0], pre: null });
    expect(parseVersion('37.0-rc3')).toEqual({ scheme: 'semver', parts: [37, 0, 0], pre: 'rc3' });
    expect(parseVersion('01')).toEqual({ scheme: 'semver', parts: [1, 0, 0], pre: null });
  });

  it('reads MCP’s dated versions and GraphQL’s month-year ones, and nothing else', () => {
    expect(parseVersion('2025-11-25')).toEqual({ scheme: 'date', parts: [2025, 11, 25], pre: null });
    expect(parseVersion('2026-07-28-RC')).toEqual({ scheme: 'date', parts: [2026, 7, 28], pre: 'RC' });
    expect(parseVersion('September2025')).toEqual({ scheme: 'month', parts: [2025, 8], pre: null });
    expect(parseVersion('latest')).toBeNull();
    expect(parseVersion('Smarch2025')).toBeNull();
  });

  it('orders 3.10 after 3.9, which a string compare gets wrong', () => {
    expect(compareVersions(v('3.10.0'), v('3.9.0'))).toBeGreaterThan(0);
  });

  it('orders dates as dates and months by the calendar', () => {
    expect(compareVersions(v('2025-11-25'), v('2025-06-18'))).toBeGreaterThan(0);
    expect(compareVersions(v('September2025'), v('October2021'))).toBeGreaterThan(0);
    expect(compareVersions(v('June2018'), v('July2015'))).toBeGreaterThan(0);
  });

  it('puts a release after its candidates and candidates in numeric order', () => {
    expect(compareVersions(v('3.1.0'), v('3.1.0-rc1'))).toBeGreaterThan(0);
    expect(compareVersions(v('3.1.0-rc10'), v('3.1.0-rc2'))).toBeGreaterThan(0);
    expect(compareVersions(v('3.1.0-rc1'), v('3.0.9'))).toBeGreaterThan(0);
    expect(compareVersions(v('2025-11-25'), v('2025-11-25-RC'))).toBeGreaterThan(0);
    expect(compareVersions(v('1.0.0-rc.1'), v('1.0.0-rc.1'))).toBe(0);
  });

  it('puts a candidate’s bare name before its numbered ones, and counts rc01 and rc1 as one', () => {
    expect(compareVersions(v('1.0.0-rc'), v('1.0.0-rc1'))).toBeLessThan(0);
    expect(compareVersions(v('1.0.0-rc1'), v('1.0.0-rc'))).toBeGreaterThan(0);
    expect(compareVersions(v('1.0.0-rc01'), v('1.0.0-rc1'))).toBe(0);
    expect(compareVersions(v('1.0.0-alpha'), v('1.0.0-beta'))).toBeLessThan(0);
  });
});

describe('R2 — one update per version newer than `seen`', () => {
  const seen = { version: '3.1.1', at: '2026-11-01' };

  it('reports one newer release as one update, with the version recorded and the one released', async () => {
    const ran = await run([entry({ seen })], { [URL_RELEASES]: { body: releases('3.2.0', '3.1.1', '3.0.4') } });
    expect(ran.updates.map((u) => [u.name, u.from, u.to, u.prerelease])).toEqual([['OpenAPI', '3.1.1', '3.2.0', false]]);
    expect(ran.updates[0]?.url).toBe('https://github.com/x/releases/tag/3.2.0');
    expect(ran.out).toContain('3.1.1 → 3.2.0');
  });

  it('reports nothing when `seen` is already the newest, and says so', async () => {
    const ran = await run([entry({ seen })], { [URL_RELEASES]: { body: releases('3.1.1', '3.0.4') } });
    expect(ran.updates).toEqual([]);
    expect(ran.out).toContain('up to date');
  });

  it('reports every version newer than `seen`, oldest first, whatever order GitHub lists them in', async () => {
    const ran = await run([entry({ seen })], { [URL_RELEASES]: { body: releases('3.2.1', '3.1.2', '3.2.0', '3.1.1') } });
    expect(ran.updates.map((u) => u.to)).toEqual(['3.1.2', '3.2.0', '3.2.1']);
  });

  it('compares MCP’s dates as dates', async () => {
    const mcp = entry({ name: 'MCP', repo: 'modelcontextprotocol/modelcontextprotocol', seen: { version: '2025-06-18', at: 'x' } });
    const ran = await run([mcp], { 'modelcontextprotocol/modelcontextprotocol/releases?per_page=20': { body: releases('2025-11-25', '2025-06-18', '2025-03-26') } });
    expect(ran.updates.map((u) => u.to)).toEqual(['2025-11-25']);
  });

  it('compares GraphQL’s month-year tags by the calendar', async () => {
    const graphql = entry({ name: 'GraphQL', repo: 'graphql/graphql-spec', seen: { version: 'October2021', at: 'x' } });
    const ran = await run([graphql], { 'graphql/graphql-spec/releases?per_page=20': { body: releases('September2025', 'October2021', 'June2018') } });
    expect(ran.updates.map((u) => u.to)).toEqual(['September2025']);
  });

  it('asks for the tags, not the releases, when the entry says so, and takes the version from the pattern', async () => {
    const jsonSchema = entry({ name: 'JSON Schema', repo: 'json-schema-org/json-schema-spec', source: 'tags', tagPattern: '^draft-bhutton-json-schema-(\\d+)$', seen: { version: '00', at: 'x' } });
    const fake = github({ 'json-schema-org/json-schema-spec/tags?per_page=50': { body: tagged('draft-bhutton-json-schema-01', 'draft-handrews-json-schema-02', 'draft-bhutton-json-schema-00') } });
    const result = await check(packages([jsonSchema]), () => undefined, { token: '', get: fake.get });
    expect(fake.asked.map((a) => a.url)).toEqual(['https://api.github.com/repos/json-schema-org/json-schema-spec/tags?per_page=50']);
    expect(result.updates.map((u) => [u.to, u.url])).toEqual([['01', 'https://github.com/json-schema-org/json-schema-spec/releases/tag/draft-bhutton-json-schema-01']]);
  });

  it('strips a prefix with the pattern’s group, and leaves out tags the pattern does not match', async () => {
    const ce = entry({ name: 'CloudEvents', repo: 'cloudevents/spec', tagPattern: '^ce@(v.+)$', seen: { version: '1.0.1', at: 'x' } });
    const ran = await run([ce], { 'cloudevents/spec/releases?per_page=20': { body: releases('ce@v1.0.2', 'cesql@v1.0.9', 'ce@v1.0.1') } });
    expect(ran.updates.map((u) => u.to)).toEqual(['1.0.2']);
  });

  it('uses the whole match when the pattern has no group', async () => {
    const ran = await run([entry({ tagPattern: '^\\d+\\.\\d+\\.\\d+$', seen })], { [URL_RELEASES]: { body: releases('3.2.0', 'v9.9.9-x') } });
    expect(ran.updates.map((u) => u.to)).toEqual(['3.2.0']);
  });

  it('skips a tag with no name', async () => {
    const spec = entry({ source: 'tags', seen });
    const fake = github({ 'OAI/OpenAPI-Specification/tags?per_page=50': { body: [{}, { name: '3.2.0' }] } });
    const result = await check(packages([spec]), () => undefined, { token: '', get: fake.get });
    expect(result.updates.map((u) => u.to)).toEqual(['3.2.0']);
  });

  it('asks for a release’s page when GitHub sends none, and skips draft releases', async () => {
    const body = [{ tag_name: '3.2.0' }, { tag_name: '3.3.0', draft: true }, 'junk', { prerelease: true }];
    const ran = await run([entry({ seen })], { [URL_RELEASES]: { body } });
    expect(ran.updates.map((u) => [u.to, u.url])).toEqual([['3.2.0', 'https://github.com/OAI/OpenAPI-Specification/releases/tag/3.2.0']]);
  });

  it('asks each repo once however many entries name it', async () => {
    const fake = github({ [URL_RELEASES]: { body: releases('3.2.0') } });
    await check(packages([entry({ seen }), entry({ name: 'Swagger', seen })]), () => undefined, { token: '', get: fake.get });
    expect(fake.asked).toHaveLength(1);
  });

  it('keeps comparing within the scheme `seen` is in, and ignores tags of another', async () => {
    const ran = await run([entry({ seen: { version: '2025-06-18', at: 'x' } })], { [URL_RELEASES]: { body: releases('3.2.0', '2025-11-25') } });
    expect(ran.updates.map((u) => u.to)).toEqual(['2025-11-25']);
  });
});

describe('R3 — pre-releases are updates of their own', () => {
  const seen = { version: '3.0.4', at: 'x' };

  it('marks a release GitHub flags as a pre-release', async () => {
    const ran = await run([entry({ seen })], { [URL_RELEASES]: { body: releases(['3.1.0', { prerelease: true }], '3.0.4') } });
    expect(ran.updates.map((u) => [u.to, u.prerelease])).toEqual([['3.1.0', true]]);
  });

  it.each(['3.1.0-rc1', '3.1.0-draft', '3.1.0-beta.2', '3.1.0-RC'])('marks the tag %s as a pre-release although GitHub does not', async (tag) => {
    const ran = await run([entry({ seen })], { [URL_RELEASES]: { body: releases(tag) } });
    expect(ran.updates.map((u) => u.prerelease)).toEqual([true]);
  });

  it('marks any other suffix a version carries, such as asyncapi’s next-major drafts', async () => {
    const ran = await run([entry({ seen })], { [URL_RELEASES]: { body: releases('3.1.0-next-major-spec.18') } });
    expect(ran.updates.map((u) => u.prerelease)).toEqual([true]);
  });

  it('does not mark a plain release', async () => {
    const ran = await run([entry({ seen })], { [URL_RELEASES]: { body: releases('3.1.0') } });
    expect(ran.updates.map((u) => u.prerelease)).toEqual([false]);
  });

  it('matches the version a pattern extracts, so a tag named `draft-…` is not a draft because of its name', async () => {
    const spec = entry({ source: 'tags', tagPattern: '^draft-bhutton-json-schema-(\\d+)$', seen: { version: '00', at: 'x' } });
    const fake = github({ [URL_RELEASES.replace('releases?per_page=20', 'tags?per_page=50')]: { body: tagged('draft-bhutton-json-schema-01') } });
    const result = await check(packages([spec]), () => undefined, { token: '', get: fake.get });
    expect(result.updates.map((u) => u.prerelease)).toEqual([false]);
  });

  it('reports the release after the candidate it recorded, because a release outranks its candidates', async () => {
    const ran = await run([entry({ seen: { version: '3.1.0-rc1', at: 'x' } })], { [URL_RELEASES]: { body: releases('3.1.0', '3.1.0-rc1') } });
    expect(ran.updates.map((u) => [u.to, u.prerelease])).toEqual([['3.1.0', false]]);
  });

  it('says it in the report, and in the title nothing differs, so the dedupe key is the version', async () => {
    const ran = await run([entry({ seen })], { [URL_RELEASES]: { body: releases('3.1.0-rc1') } });
    expect(ran.updates[0]?.report).toContain('(pre-release)');
    expect(ran.updates[0]?.report).toContain('not a release');
  });
});

describe('R4 — the title, and the body the workflow files', () => {
  const seen = { version: '3.0.4', at: 'x' };

  it('is `spec: <name> <version> released (we read <reads>)`', () => {
    expect(titleOf(entry(), '3.2.0')).toBe('spec: OpenAPI 3.2.0 released (we read 3.0, 3.1)');
  });

  it('is `suite:` for a test suite', () => {
    expect(titleOf(entry({ name: 'JSON Schema Test Suite', kind: 'test-suite', reads: ['validation/tests'] }), '23.2.0')).toBe('suite: JSON Schema Test Suite 23.2.0 released (we read validation/tests)');
  });

  it('says so when nothing reads the format yet', () => {
    expect(titleOf(entry({ reads: [] }), '1.1.0')).toBe('spec: OpenAPI 1.1.0 released (we read nothing yet)');
  });

  it('links the release and names the adapter file that reads the format', async () => {
    const ran = await run([entry({ seen, adapters: ['openapi', 'swagger2', 'extract-standard.ts'] })], { [URL_RELEASES]: { body: releases('3.1.0') } });
    const report = ran.updates[0]?.report ?? '';
    expect(report).toContain('https://github.com/x/releases/tag/3.1.0');
    expect(report).toContain('`packages/apicontract/src/openapi.ts`');
    expect(report).toContain('`packages/apicontract/src/input-swagger2.ts`');
    expect(report).toContain('`packages/apicontract/src/extract-standard.ts`');
    expect(ran.updates[0]?.title).toBe('spec: OpenAPI 3.1.0 released (we read 3.0, 3.1)');
  });

  it('says a format nothing reads yet has no adapter, and points at the decision that plans it', async () => {
    const ran = await run([entry({ seen, adapters: [], reads: [] })], { [URL_RELEASES]: { body: releases('3.1.0') } });
    expect(ran.updates[0]?.report).toContain('- We read: nothing yet');
    expect(ran.updates[0]?.report).toContain('No adapter reads this format yet');
    expect(ran.updates[0]?.report).toContain('D-20261122-open-formats');
  });

  it('tells a person to re-grade when the entry is a test suite, and names no adapter', async () => {
    const suite = entry({ name: 'JSON Schema Test Suite', kind: 'test-suite', adapters: ['jsonschema'], seen });
    const ran = await run([suite], { [URL_RELEASES]: { body: releases('3.1.0') } });
    expect(ran.updates[0]).toMatchObject({ kind: 'test-suite', title: 'suite: JSON Schema Test Suite 3.1.0 released (we read 3.0, 3.1)' });
    expect(ran.updates[0]?.report).toContain('moves a published score');
    expect(ran.updates[0]?.report).not.toContain('input-jsonschema');
  });

  it('names the file an adapter key stands for', () => {
    expect(adapterFile('openapi')).toBe('openapi.ts');
    expect(adapterFile('mcp')).toBe('input-mcp.ts');
    expect(adapterFile('extract-standard.ts')).toBe('extract-standard.ts');
  });

  it('files the same titles when the job runs again, which is what the workflow’s exact-title search dedupes on', async () => {
    const replies = { [URL_RELEASES]: { body: releases('3.2.0', '3.1.0') } };
    const first = await run([entry({ seen })], replies);
    const second = await run([entry({ seen })], replies);
    expect(first.updates.map((u) => u.title)).toEqual(second.updates.map((u) => u.title));
    expect(new Set(first.updates.map((u) => u.title)).size).toBe(first.updates.length);
  });
});

describe('R5 — recording, without noise', () => {
  const replies = { [URL_RELEASES]: { body: releases('3.2.0', '3.1.1') } };

  it('reports nothing for an entry with no `seen`, whatever it has published, and names it', async () => {
    const ran = await run([entry()], replies);
    expect(ran.updates).toEqual([]);
    expect(ran.unrecorded).toEqual([{ name: 'OpenAPI', newest: '3.2.0' }]);
    expect(ran.out).toContain('nothing recorded yet');
    expect(ran.unchecked).toEqual([]);
  });

  it('writes the newest version and the day into `seen`, and leaves every other field alone', async () => {
    const dir = packages([entry({ adapters: ['openapi'], tagPattern: '^(.+)$' })]);
    let out = '';
    const failures = await record(dir, (s) => (out += s), { token: '', get: github(replies).get, today: '2026-11-23' });
    expect(failures).toBe(0);
    const written = JSON.parse(readFileSync(join(dir, 'apicontract', 'specs.json'), 'utf8')) as Spec[];
    expect(written).toEqual([entry({ adapters: ['openapi'], tagPattern: '^(.+)$', seen: { version: '3.2.0', at: '2026-11-23' } })]);
    expect(out).toContain('3.2.0  recorded');
  });

  it('then reports nothing on the next run, which is the first scheduled run after merge', async () => {
    const dir = packages([entry()]);
    const fake = github(replies);
    await record(dir, () => undefined, { token: '', get: fake.get });
    const result = await check(dir, () => undefined, { token: '', get: fake.get });
    expect(result.updates).toEqual([]);
    expect(result.unrecorded).toEqual([]);
  });

  it('records the pre-release when it is the newest, and the release after it is still reported', async () => {
    const dir = packages([entry()]);
    await record(dir, () => undefined, { token: '', get: github({ [URL_RELEASES]: { body: releases('3.2.0-rc1', '3.1.1') } }).get });
    const after = await check(dir, () => undefined, { token: '', get: github({ [URL_RELEASES]: { body: releases('3.2.0', '3.2.0-rc1') } }).get });
    expect(after.updates.map((u) => u.to)).toEqual(['3.2.0']);
  });

  it('never lowers `seen`, and says it is already the newest', async () => {
    const dir = packages([entry({ seen: { version: '3.3.0', at: '2026-01-01' } })]);
    let out = '';
    await record(dir, (s) => (out += s), { token: '', get: github(replies).get, today: '2026-11-23' });
    expect((JSON.parse(readFileSync(join(dir, 'apicontract', 'specs.json'), 'utf8')) as Spec[])[0]?.seen).toEqual({ version: '3.3.0', at: '2026-01-01' });
    expect(out).toContain('already the newest');
  });

  it('advances `seen` when the recorded one is older', async () => {
    const dir = packages([entry({ seen: { version: '3.0.0', at: '2026-01-01' } })]);
    await record(dir, () => undefined, { token: '', get: github(replies).get, today: '2026-11-23' });
    expect((JSON.parse(readFileSync(join(dir, 'apicontract', 'specs.json'), 'utf8')) as Spec[])[0]?.seen).toEqual({ version: '3.2.0', at: '2026-11-23' });
  });

  it('keeps what a repo it could not read had, records the others, and counts the failure', async () => {
    const other = entry({ name: 'Other', repo: 'o/other' });
    const dir = packages([entry({ seen: { version: '3.0.0', at: 'x' } }), other]);
    let out = '';
    const failures = await record(dir, (s) => (out += s), { token: '', get: github({ [URL_RELEASES]: { status: 500 }, 'o/other/releases?per_page=20': { body: releases('1.0.0') } }).get, today: '2026-11-23' });
    expect(failures).toBe(1);
    const written = JSON.parse(readFileSync(join(dir, 'apicontract', 'specs.json'), 'utf8')) as Spec[];
    expect(written.map((s) => s.seen)).toEqual([{ version: '3.0.0', at: 'x' }, { version: '1.0.0', at: '2026-11-23' }]);
    expect(out).toContain('✖ unchecked');
  });

  it('refuses to record into a scheme it cannot compare, and says how to fix it', async () => {
    const dir = packages([entry({ seen: { version: '2025-06-18', at: 'x' } })]);
    let out = '';
    expect(await record(dir, (s) => (out += s), { token: '', get: github({ [URL_RELEASES]: { body: releases('3.2.0') } }).get })).toBe(1);
    expect(out).toContain('fix: delete `seen`');
  });

  it('defaults to today’s date and the global fetch', async () => {
    const dir = packages([entry()]);
    vi.stubGlobal('fetch', (url: string) => Promise.resolve(new Response(JSON.stringify(url.includes('releases') ? releases('3.2.0') : []), { status: 200 })));
    expect(await record(dir, () => undefined, { token: '' })).toBe(0);
    vi.unstubAllGlobals();
    const seen = (JSON.parse(readFileSync(join(dir, 'apicontract', 'specs.json'), 'utf8')) as Spec[])[0]?.seen;
    expect(seen?.version).toBe('3.2.0');
    expect(seen?.at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('R7 — a repo that cannot be read is unchecked, never up to date', () => {
  const seen = { version: '3.1.1', at: 'x' };

    it('treats a 403 as unchecked, says the limit and the token, and does not call it up to date', async () => {
    const ran = await run([entry({ seen })], { [URL_RELEASES]: { status: 403, remaining: '0' } });
    expect(ran.unchecked).toHaveLength(1);
    expect(unchecked(ran)).toContain('HTTP 403, rate limit exhausted');
    expect(unchecked(ran)).toContain('fix: set GITHUB_TOKEN');
    expect(ran.out).toContain('✖ unchecked');
    expect(ran.out).not.toContain('— up to date');
    expect(ran.updates).toEqual([]);
  });

  it('treats a 429 the same, and does not blame the token when there is one', async () => {
    const ran = await run([entry({ seen })], { [URL_RELEASES]: { status: 429 } }, 'ghs_token');
    expect(unchecked(ran)).toContain('HTTP 429');
    expect(unchecked(ran)).not.toContain('rate limit exhausted');
    expect(unchecked(ran)).toContain('fix: wait for the limit to reset');
  });

  it('treats a 404 as unchecked and says the repo moved', async () => {
    const ran = await run([entry({ seen })], { [URL_RELEASES]: { status: 404 } });
    expect(unchecked(ran)).toContain('was not found');
    expect(unchecked(ran)).toContain('fix: the repository was renamed');
  });

  it('treats any other status as unchecked', async () => {
    const ran = await run([entry({ seen })], { [URL_RELEASES]: { status: 502 } });
    expect(unchecked(ran)).toContain('HTTP 502');
    expect(unchecked(ran)).toContain('fix:');
  });

  it('treats a network failure as unchecked, by its message', async () => {
    const ran = await run([entry({ seen })], { [URL_RELEASES]: { throws: 'getaddrinfo ENOTFOUND' } });
    expect(unchecked(ran)).toContain('could not reach GitHub for OAI/OpenAPI-Specification: getaddrinfo ENOTFOUND');
    expect(unchecked(ran)).toContain('fix: re-run the job');
  });

  it('names a failure that is not an Error by its string', async () => {
    const result = await check(packages([entry({ seen })]), () => undefined, { token: '', get: refuses });
    expect(result.unchecked[0]?.error).toContain('could not reach GitHub for OAI/OpenAPI-Specification: connection reset');
  });

  it('treats an answer that is not a list as unchecked', async () => {
    const ran = await run([entry({ seen })], { [URL_RELEASES]: { body: { message: 'moved' } } });
    expect(unchecked(ran)).toContain('not a list');
  });

  it('treats a repo with nothing version-shaped as unchecked rather than as having no news', async () => {
    const ran = await run([entry({ seen })], { [URL_RELEASES]: { body: releases('latest', 'nightly') } });
    expect(unchecked(ran)).toContain('no version-shaped releases among the 2');
    expect(unchecked(ran)).toContain('fix: set `tagPattern`');
  });

  it('treats an empty repo as unchecked too', async () => {
    const ran = await run([entry({ seen })], { [URL_RELEASES]: { body: [] } });
    expect(ran.unchecked).toHaveLength(1);
  });

  it('treats a `seen` that is not a version as unchecked, with the fix', async () => {
    const ran = await run([entry({ seen: { version: 'whenever', at: 'x' } })], { [URL_RELEASES]: { body: releases('3.2.0') } });
    expect(unchecked(ran)).toContain('is not a version');
    expect(unchecked(ran)).toContain('fix: delete `seen`');
  });

  it('treats a repo whose versions are all in another scheme than `seen` as unchecked', async () => {
    const ran = await run([entry({ seen: { version: '2025-06-18', at: 'x' } })], { [URL_RELEASES]: { body: releases('3.2.0') } });
    expect(unchecked(ran)).toContain('in the scheme of seen');
  });

  it('still checks the repos after one that failed, and reports what it found there', async () => {
    const other = entry({ name: 'Arazzo', repo: 'OAI/Arazzo-Specification', seen: { version: '1.0.0', at: 'x' } });
    const ran = await run([entry({ seen }), other], { [URL_RELEASES]: { status: 403 }, 'OAI/Arazzo-Specification/releases?per_page=20': { body: releases('1.1.0') } });
    expect(ran.unchecked.map((u) => u.name)).toEqual(['OpenAPI']);
    expect(ran.updates.map((u) => [u.name, u.to])).toEqual([['Arazzo', '1.1.0']]);
  });

  it('sends GITHUB_TOKEN as a bearer token when there is one, and no Authorization header when there is not', async () => {
    const replies = { [URL_RELEASES]: { body: releases('3.2.0') } };
    const withToken = github(replies);
    await check(packages([entry({ seen })]), () => undefined, { token: 'ghs_secret', get: withToken.get });
    expect(withToken.asked[0]?.headers.Authorization).toBe('Bearer ghs_secret');
    const without = github(replies);
    await check(packages([entry({ seen })]), () => undefined, { token: '', get: without.get });
    expect(without.asked[0]?.headers).not.toHaveProperty('Authorization');
    const empty = github(replies);
    await check(packages([entry({ seen })]), () => undefined, { token: '', get: empty.get });
    expect(empty.asked[0]?.headers).not.toHaveProperty('Authorization');
    expect(without.asked[0]?.headers['User-Agent']).toBe('burgee-compat-oracle');
  });

  it('reads GITHUB_TOKEN from the environment and the global fetch when nothing is handed in', async () => {
    const heard: string[] = [];
    vi.stubGlobal('fetch', (_url: string, init: { headers: Record<string, string> }) => {
      heard.push(init.headers.Authorization ?? 'none');
      return Promise.resolve(new Response(JSON.stringify(releases('3.1.1')), { status: 200 }));
    });
    vi.stubEnv('GITHUB_TOKEN', 'from-env');
    const result = await check(packages([entry({ seen })]), () => undefined);
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    expect(result.updates).toEqual([]);
    expect(heard).toEqual(['Bearer from-env']);
  });

  it('fetchPublished itself throws, so no caller can mistake a failure for an empty list', async () => {
    await expect(fetchPublished(entry(), undefined, github({ [URL_RELEASES]: { status: 403 } }).get)).rejects.toThrow('fix:');
  });
});
