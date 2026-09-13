/**
 * A registry of make-believe packages, answering the same two calls the live one does.
 *
 * Built rather than committed: a tar writer beside the reader, so the archives these tests
 * parse are constructed byte by byte and no binary blob has to be trusted or refreshed.
 * Nothing here touches the network — `RegistryClient` is the seam, and the live
 * implementation is the only thing that ever calls `fetch`.
 *
 * It lives here, and not beside the one suite that first needed it, because the second
 * caller is how a copy starts: `watch.test.ts` fingerprints releases through exactly this
 * client, and a second tar writer that drifted from this one would fail in the direction
 * that matters least — agreeing with itself.
 */
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';

import { type Packument, type RegistryClient, type RegistryManifest } from '../registry.js';

export const BLOCK = 512;

/** A ustar header + body for one file, padded to the block size — the reader's inverse. */
export function tarEntry(path: string, body: string): Buffer {
  const header = Buffer.alloc(BLOCK);
  header.write(path, 0, 100, 'utf8');
  header.write('000644 \0', 100, 8, 'utf8');
  header.write(`${Buffer.byteLength(body).toString(8).padStart(11, '0')} `, 124, 12, 'utf8');
  header.write('0', 156, 1, 'utf8');
  header.write('ustar\0', 257, 6, 'utf8');
  // The checksum field is spaces while the checksum is computed over it, then written back.
  header.write('        ', 148, 8, 'utf8');
  const sum = header.reduce((a, b) => a + b, 0);
  header.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'utf8');
  const content = Buffer.alloc(Math.ceil(body.length / BLOCK) * BLOCK);
  content.write(body, 0, 'utf8');
  return Buffer.concat([header, content]);
}

export function tarball(files: Record<string, string>): Buffer {
  const entries = Object.entries(files).map(([path, body]) => tarEntry(`package/${path}`, body));
  return Buffer.concat([...entries, Buffer.alloc(BLOCK * 2)]);
}

export const sha1 = (buf: Buffer): string => createHash('sha1').update(buf).digest('hex');

export interface FakePackage {
  files: Record<string, string>;
  dependencies?: Record<string, string>;
  types?: string;
}

/** The fields a published manifest carries beyond name and version. */
const extras = (spec: FakePackage): Partial<RegistryManifest> => ({
  ...(spec.types === undefined ? {} : { types: spec.types }),
  ...(spec.dependencies === undefined ? {} : { dependencies: spec.dependencies }),
});

/** One release: its tarball (with the `package.json` a fetch will verify) and its manifest. */
export function release(name: string, version: string, spec: FakePackage): { url: string; archive: Buffer; manifest: RegistryManifest } {
  const manifestJson = JSON.stringify({ name, version, ...extras(spec) });
  const archive = gzipSync(tarball({ ...spec.files, 'package.json': manifestJson }));
  const url = `https://fake/${name}/${version}.tgz`;
  return { url, archive, manifest: { name, version, ...extras(spec), dist: { tarball: url, shasum: sha1(archive) } } };
}

/** A registry of make-believe packages, answering the same two calls the live one does. */
export function fakeRegistry(packages: Record<string, Record<string, FakePackage>>): RegistryClient & { archives: Map<string, Buffer> } {
  const archives = new Map<string, Buffer>();
  const packuments = new Map<string, Packument>();
  for (const [name, versions] of Object.entries(packages)) {
    const entries: Packument['versions'] = {};
    let latest = '0.0.0';
    for (const [version, spec] of Object.entries(versions)) {
      const built = release(name, version, spec);
      archives.set(built.url, built.archive);
      entries[version] = built.manifest;
      latest = version;
    }
    packuments.set(name, { name, 'dist-tags': { latest }, versions: entries });
  }
  return {
    archives,
    packument: async (name) => {
      const found = packuments.get(name);
      if (found === undefined) throw new Error(`no such package ${name}`);
      return found;
    },
    download: async (url) => {
      const found = archives.get(url);
      if (found === undefined) throw new Error(`no such tarball ${url}`);
      return found;
    },
  };
}
