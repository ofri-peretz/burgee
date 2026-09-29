/**
 * `upstream-watch` R3 — the tarball fingerprint, proved offline.
 *
 * The fixture is *built* rather than committed: a tar writer beside the reader, so the
 * archive these cases parse is constructed byte by byte in the test and no binary blob has
 * to be trusted or refreshed. Nothing here touches the network — `RegistryClient` is the
 * seam, and the live implementation is the only thing that ever calls `fetch`.
 *
 * The cases that matter most are the refusals. This repo has shipped a benchmark that
 * resolved a hoisted package instead of the declared one and reported a plausible number,
 * and an oracle that counted a skipped case as a pass. A fingerprint is the same shape of
 * risk, so "the bytes are not what the registry published" and "the tarball is not the
 * package we asked for" are both errors here, asserted as errors.
 */
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { BLOCK, type FakePackage, fakeRegistry, sha1, tarEntry, tarball } from './__fixtures__/fake-registry.js';
import {
  liveRegistry,
  type Packument,
  type RegistryClient,
  type RegistryManifest,
  fetchPackage,
  fromRegistry,
  packumentUrl,
  reexportedNames,
  resolveVersion,
  shippedBytes,
  surfaceFilesOf,
  treeWeight,
} from './registry.js';
import { unpack, untar } from './tar.js';

const ORA_DTS = 'export declare function oraPromise(): void;\nexport declare const spinners: string[];\n';

const REGISTRY = fakeRegistry({
  ora: {
    '9.4.1': { files: { 'index.js': 'export default 1;\n', 'index.d.ts': ORA_DTS, 'readme.md': 'x' }, types: 'index.d.ts', dependencies: { chalk: '^5.0.0' } },
    '9.5.0': { files: { 'index.js': 'export default 2;\n', 'index.d.ts': `${ORA_DTS}export declare function oraStream(): void;\n`, 'readme.md': 'x' }, types: 'index.d.ts', dependencies: { chalk: '^5.0.0' } },
  },
  chalk: {
    '5.6.2': { files: { 'index.js': 'export const chalk = 1;\n' } },
    '6.0.0': { files: { 'index.js': 'export const chalk = 2;\nexport const extra = 3;\n' } },
  },
});

describe('the tar reader', () => {
  it('reads regular files and drops the wrapper directory', () => {
    const files = unpack(tarball({ 'index.js': 'a', 'lib/deep.js': 'bb' }));
    expect([...files.keys()].sort()).toEqual(['index.js', 'lib/deep.js']);
    expect(files.get('lib/deep.js')?.toString('utf8')).toBe('bb');
  });

  it('refuses a path that would escape the extraction root', () => {
    // Nothing here writes to disk, but these paths become keys a caller may join to a
    // directory, and a `../` that only becomes dangerous two files away is found late.
    const escaping = Buffer.concat([tarEntry('package/../../etc/passwd', 'x'), tarEntry('package/ok.js', 'y'), Buffer.alloc(BLOCK * 2)]);
    expect(untar(escaping).map((e) => e.path)).toEqual(['package/ok.js']);
  });

  it('stops at the end-of-archive blocks rather than reading trailing bytes', () => {
    const withTrailer = Buffer.concat([tarEntry('package/a.js', 'a'), Buffer.alloc(BLOCK * 2), tarEntry('package/never.js', 'z')]);
    expect(untar(withTrailer).map((e) => e.path)).toEqual(['package/a.js']);
  });
});

describe('resolving a version', () => {
  const packument: Packument = {
    name: 'x',
    'dist-tags': { latest: '2.1.0', next: '3.0.0-beta.1' },
    versions: { '1.0.0': {} as never, '2.0.0': {} as never, '2.1.0': {} as never },
  };

  it('follows a dist-tag', () => expect(resolveVersion(packument, 'latest')).toBe('2.1.0'));
  it('takes an exact version as itself', () => expect(resolveVersion(packument, '2.0.0')).toBe('2.0.0'));
  it('picks the highest release satisfying a range', () => expect(resolveVersion(packument, '^2.0.0')).toBe('2.1.0'));
  it('throws rather than guessing when nothing satisfies', () => {
    expect(() => resolveVersion(packument, '^9.0.0')).toThrow(/no published version/u);
  });

  it('encodes a scope, because a scoped name is one registry path segment', () => {
    expect(packumentUrl('@clack/prompts')).toBe('https://registry.npmjs.org/@clack%2fprompts');
    expect(packumentUrl('ora')).toBe('https://registry.npmjs.org/ora');
  });

  it('refuses a name that is not an npm package name, rather than building a URL blind', () => {
    for (const bad of ['a/b/c', '../etc/passwd', 'has space', '']) {
      expect(() => packumentUrl(bad), bad).toThrow(/not an npm package name/u);
    }
  });
});

describe('fetching a release', () => {
  it('returns the resolved version, not the range it was asked for', async () => {
    const fetched = await fetchPackage('ora', 'latest', REGISTRY);
    expect(fetched.version).toBe('9.5.0');
    expect(fetched.shasum).toBe(sha1(REGISTRY.archives.get('https://fake/ora/9.5.0.tgz') as Buffer));
  });

  it('refuses a tarball whose bytes are not what the registry published', async () => {
    const tampered: RegistryClient = {
      packument: REGISTRY.packument,
      download: async () => gzipSync(tarball({ 'package.json': JSON.stringify({ name: 'ora', version: '9.5.0' }) })),
    };
    await expect(fetchPackage('ora', '9.5.0', tampered)).rejects.toThrow(/is not the published/u);
  });

  it('refuses a tarball that declares a different package', async () => {
    // The clack case: a watch that fetched the declared name would have downloaded an
    // unrelated placeholder and reported a perfectly plausible number for the wrong library.
    const swapped = fakeRegistry({ clack: { '0.1.0': { files: { 'index.js': 'x' } } } });
    const lying: RegistryClient = {
      packument: async () => ({
        name: 'clack',
        'dist-tags': { latest: '9.9.9' },
        versions: { '9.9.9': { name: 'clack', version: '9.9.9', dist: { tarball: 'https://fake/clack/0.1.0.tgz' } } },
      }),
      download: swapped.download,
    };
    await expect(fetchPackage('clack', '9.9.9', lying)).rejects.toThrow(/refusing to fingerprint a package we did not ask for/u);
  });
});

describe('weight', () => {
  it('counts shipped code and data, never package.json', () => {
    const files = new Map([
      ['index.js', Buffer.from('12345')],
      ['data.json', Buffer.from('12')],
      ['package.json', Buffer.from('9999999999')],
      ['readme.md', Buffer.from('ignored')],
      ['index.d.ts', Buffer.from('ignored')],
    ]);
    expect(shippedBytes(files)).toBe(7);
  });

  it('counts every package in the resolved tree, each whole', async () => {
    const weight = await treeWeight('ora', '9.4.1', REGISTRY);
    expect(weight.self).toBe(weight.packages['ora@9.4.1']);
    expect(weight.total).toBe(Object.values(weight.packages).reduce((a, b) => a + b, 0));
    expect(weight.total).toBeGreaterThan(weight.self);
  });

  it("resolves a dependency's range, not its latest — which is what makes the published bill reproduce", async () => {
    // ora depends on `chalk: ^5.0.0`, and chalk's latest is 6.0.0. flagstaff publishes
    // ora's bill itemised as `chalk 16,727`, which is chalk **5.6.2**. A tree walk that
    // took `dist-tags.latest` for every dependency would report a plausible total made of
    // versions nobody in that tree installs.
    const weight = await treeWeight('ora', '9.4.1', REGISTRY);
    expect(Object.keys(weight.packages).sort()).toEqual(['chalk@5.6.2', 'ora@9.4.1']);
  });
});

describe('the surface', () => {
  it('prefers the .d.ts, because a type-only addition is invisible to a runtime scan', async () => {
    const fetched = await fetchPackage('ora', '9.5.0', REGISTRY);
    expect(surfaceFilesOf(fetched.files, fetched.manifest)[0]).toBe('index.d.ts');
  });

  it('fingerprints every shipped file and the names on the surface', async () => {
    const { record } = await fromRegistry('ora', '9.4.1', REGISTRY);
    expect(record.version).toBe('9.4.1');
    expect(Object.keys(record.hashes)).toContain('index.js');
    expect(record.surface['index.d.ts']).toEqual(['oraPromise', 'spinners']);
    // A tarball carries no suite; diffRecords handles an empty map on both sides.
    expect(record.tests).toEqual({});
  });
});

describe('export forms a published .d.ts uses that a cloned source does not', () => {
  // Four of the nineteen packages watched came back with zero surface names until this
  // existed, and a competitor whose surface reads as empty is a watch that can report a
  // file hash moving and never an API change.
  it('reads a re-export clause, as @clack/prompts publishes', () => {
    expect(reexportedNames("export { CANCEL_SYMBOL, isCancel, settings } from '@clack/core';")).toEqual([
      'CANCEL_SYMBOL',
      'isCancel',
      'settings',
    ]);
  });

  it('takes the alias a consumer actually imports', () => {
    expect(reexportedNames("export { internal as publicName } from './x.js';")).toEqual(['publicName']);
  });

  it("reads cli-table3's `declare namespace` + `export =`", () => {
    expect(reexportedNames('declare namespace CliTable3 {\n}\ndeclare const CliTable3: CliTable3;\nexport = CliTable3;')).toEqual([
      'CliTable3',
      'default',
    ]);
  });

  it("reads yargs' bare `export default`", () => {
    expect(reexportedNames('export default Yargs;')).toEqual(['default']);
  });

  it("reads slice-ansi's `export default function`", () => {
    expect(reexportedNames('export default function sliceAnsi(string: string): string;')).toEqual(['default']);
  });

  it('finds nothing in a file that exports nothing', () => {
    expect(reexportedNames('const internal = 1;\n')).toEqual([]);
  });
});

/** One raw tar header block, patched field by field — the shapes `tarEntry` never writes. */
function rawEntry(fields: { name?: string; prefix?: string; type?: string; size?: string }, body = ''): Buffer {
  const entry = tarEntry(fields.name ?? 'package/x.js', body);
  if (fields.type !== undefined) entry.write(fields.type, 156, 1, 'utf8');
  if (fields.prefix !== undefined) entry.write(fields.prefix, 345, 155, 'utf8');
  if (fields.size !== undefined) entry.fill(0, 124, 136).write(fields.size, 124, 12, 'utf8');
  return entry;
}
const archive = (...entries: Buffer[]): Buffer => Buffer.concat([...entries, Buffer.alloc(BLOCK * 2)]);

describe('the tar reader, on the shapes npm tarballs can carry', () => {
  it('names the next file from a GNU long-name entry, once', () => {
    const long = `package/${'deep/'.repeat(30)}file.js`;
    const entries = untar(archive(rawEntry({ name: '././@LongLink', type: 'L' }, `${long}\0`), tarEntry('package/truncated', 'a'), tarEntry('package/next.js', 'b')));
    expect(entries.map((e) => e.path)).toEqual([long, 'package/next.js']);
    expect(entries[0]?.body.toString('utf8')).toBe('a');
  });

  it('joins a ustar prefix onto the name', () => {
    expect(untar(archive(rawEntry({ name: 'file.js', prefix: 'package/lib' }, 'x'))).map((e) => e.path)).toEqual(['package/lib/file.js']);
  });

  it('keeps regular files only — a NUL type is one, a directory and a symlink are not', () => {
    const entries = untar(archive(rawEntry({ name: 'package/old.js', type: '\0' }, 'o'), rawEntry({ name: 'package/dir/', type: '5' }), rawEntry({ name: 'package/link', type: '2' }), tarEntry('package/new.js', 'n')));
    expect(entries.map((e) => e.path)).toEqual(['package/old.js', 'package/new.js']);
  });

  it('refuses an absolute, a drive-qualified and an empty path', () => {
    const entries = untar(archive(tarEntry('/etc/passwd', 'x'), tarEntry('C:/Windows/x', 'x'), rawEntry({ name: '\0' }, 'x'), tarEntry('package/ok.js', 'y')));
    expect(entries.map((e) => e.path)).toEqual(['package/ok.js']);
  });

  it('reads an empty size field as zero bytes rather than NaN', () => {
    const entries = untar(archive(rawEntry({ name: 'package/empty.js', size: '' }), tarEntry('package/after.js', 'z')));
    expect(entries.map((e) => [e.path, e.body.length])).toEqual([
      ['package/empty.js', 0],
      ['package/after.js', 1],
    ]);
  });

  it('drops a file at the archive root, which has no wrapper directory to strip', () => {
    expect([...unpack(archive(tarEntry('stray.js', 's'), tarEntry('package/kept.js', 'k'))).keys()]).toEqual(['kept.js']);
  });
});

describe('the live registry client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('asks for a packument as JSON, one path segment per scoped name, with a timeout', async () => {
    const fetched = vi.fn(async () => new Response(JSON.stringify({ name: '@clack/prompts' }), { status: 200 }));
    vi.stubGlobal('fetch', fetched);
    expect(await liveRegistry.packument('@clack/prompts')).toEqual({ name: '@clack/prompts' });
    const [url, init] = fetched.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://registry.npmjs.org/@clack%2fprompts');
    expect(init.headers).toEqual({ accept: 'application/json' });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('downloads a tarball as bytes', async () => {
    const fetched = vi.fn(async (_url: string) => new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    vi.stubGlobal('fetch', fetched);
    expect(await liveRegistry.download('https://fake/x.tgz')).toEqual(Buffer.from([1, 2, 3]));
    expect(fetched.mock.calls[0]?.[0]).toBe('https://fake/x.tgz');
  });

  it('throws on an HTTP failure rather than parsing an error page', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })));
    await expect(liveRegistry.packument('ora')).rejects.toThrow('registry: ora → HTTP 404');
    await expect(liveRegistry.download('https://fake/x.tgz')).rejects.toThrow('registry: https://fake/x.tgz → HTTP 404');
  });
});

describe('a release the registry describes wrongly', () => {
  it('refuses a dist-tag that names a version the packument does not list', async () => {
    const dangling: RegistryClient = { ...REGISTRY, packument: async () => ({ name: 'ora', 'dist-tags': { latest: '9.9.9' }, versions: {} }) };
    await expect(fetchPackage('ora', 'latest', dangling)).rejects.toThrow('ora@9.9.9 is in dist-tags but not in versions');
  });

  it('refuses a tarball with no package.json to check the name against', async () => {
    const bare = gzipSync(tarball({ 'index.js': 'x' }));
    const client: RegistryClient = {
      packument: async () => ({ name: 'ora', 'dist-tags': { latest: '1.0.0' }, versions: { '1.0.0': { name: 'ora', version: '1.0.0', dist: { tarball: 'u', shasum: sha1(bare) } } } }),
      download: async () => bare,
    };
    await expect(fetchPackage('ora', 'latest', client)).rejects.toThrow('ora@1.0.0: tarball has no package.json');
  });

  it('records a repository written as a bare string, as older manifests write it', async () => {
    const client: RegistryClient = {
      ...REGISTRY,
      packument: async (name) => {
        const packument = await REGISTRY.packument(name);
        const versions = Object.fromEntries(Object.entries(packument.versions).map(([v, m]) => [v, { ...m, repository: 'github:chalk/chalk' }]));
        return { ...packument, versions };
      },
    };
    expect((await fromRegistry('chalk', '5.6.2', client)).record.repo).toBe('github:chalk/chalk');
    expect((await fromRegistry('chalk', '5.6.2', REGISTRY)).record.repo).toBe('npm:chalk');
  });
});

describe('the tree walk, on a tree that shares and misses', () => {
  const SHARED = fakeRegistry({
    app: { '1.0.0': { files: { 'index.js': 'aaaa' }, dependencies: { left: '1.0.0', right: '1.0.0', gone: '^1.0.0' } } },
    left: { '1.0.0': { files: { 'index.js': 'll' }, dependencies: { shared: '1.0.0' } } },
    right: { '1.0.0': { files: { 'index.js': 'rr' }, dependencies: { shared: '^1.0.0', left: '1.0.0' } } },
    shared: { '1.0.0': { files: { 'index.js': 's' } } },
  });

  it('counts a package reached twice once, whether by the same range or another that resolves the same', async () => {
    const counted: string[] = [];
    const client: RegistryClient = {
      packument: SHARED.packument,
      download: async (url) => {
        counted.push(url);
        return SHARED.download(url);
      },
    };
    const weight = await treeWeight('app', '1.0.0', client);
    expect(weight.packages).toEqual({ 'app@1.0.0': 4, 'left@1.0.0': 2, 'shared@1.0.0': 1, 'right@1.0.0': 2, 'gone@?': 0 });
    expect(weight).toMatchObject({ self: 4, total: 9 });
    // `shared` is requested at two ranges and downloaded once: the client is memoised.
    expect(counted.filter((u) => u.includes('/shared/'))).toHaveLength(1);
  });

  it('ends on a dependency cycle, counting each package once', async () => {
    const cycle = fakeRegistry({
      a: { '1.0.0': { files: { 'index.js': 'aa' }, dependencies: { b: '^1.0.0' } } },
      b: { '1.0.0': { files: { 'index.js': 'b' }, dependencies: { a: '^1.0.0' } } },
    });
    expect(await treeWeight('a', '1.0.0', cycle)).toEqual({ self: 2, total: 3, packages: { 'a@1.0.0': 2, 'b@1.0.0': 1 } });
  });
});
