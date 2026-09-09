/**
 * A read-only tar reader, so fingerprinting a competitor never runs a competitor's code.
 *
 * `upstream-watch` constraint 1 is that the watch downloads a published tarball and *reads*
 * it: no `npm install`, no lifecycle script. The job that calls this runs on a schedule
 * holding a token with `issues: write`, so "we do not execute upstream code" has to be a
 * property of the code and not a promise in a comment — which means unpacking the archive
 * ourselves rather than shelling out to something that might.
 *
 * npm tarballs are ustar: 512-byte header blocks, each followed by the file body padded to
 * the next 512-byte boundary. Only regular files are kept. Directories, symlinks, hardlinks
 * and device nodes are skipped rather than represented, because nothing downstream wants
 * them and a symlink is the shape path-escape attacks take.
 */

const BLOCK = 512;
const OCTAL = 8;
const NAME = { at: 0, len: 100 } as const;
const SIZE = { at: 124, len: 12 } as const;
const TYPE = 156;
const PREFIX = { at: 345, len: 155 } as const;

/** A NUL-terminated header field, trimmed. */
function field(header: Uint8Array, at: number, len: number): string {
  const raw = Buffer.from(header.subarray(at, at + len)).toString('utf8');
  const end = raw.indexOf('\0');
  return (end === -1 ? raw : raw.slice(0, end)).trim();
}

/** Octal header numbers; an empty or malformed field reads as 0 rather than NaN. */
function octal(header: Uint8Array, at: number, len: number): number {
  const text = field(header, at, len);
  const value = Number.parseInt(text, OCTAL);
  return Number.isFinite(value) ? value : 0;
}

/**
 * Reject anything that would escape the extraction root. Nothing here writes to disk, but
 * these paths become map keys that a caller may well join to a directory, and a `../` that
 * only becomes dangerous two files away is the kind of thing that gets found later.
 */
function safe(path: string): boolean {
  if (path === '' || path.startsWith('/') || /^[A-Za-z]:/.test(path)) return false;
  return !path.split('/').includes('..');
}

export interface TarEntry {
  /** The path as written in the archive, including npm's `package/` prefix. */
  path: string;
  body: Buffer;
}

/**
 * Every regular file in an uncompressed tar archive, in archive order.
 *
 * GNU long names (type `L`) are honoured because npm tarballs of deeply nested packages do
 * carry them; a `L` entry names the file that follows it.
 */
export function untar(archive: Buffer): TarEntry[] {
  const entries: TarEntry[] = [];
  let offset = 0;
  let longName: string | null = null;

  while (offset + BLOCK <= archive.length) {
    const header = archive.subarray(offset, offset + BLOCK);
    // Two consecutive zero blocks end the archive; one is enough to stop reading.
    if (header.every((byte) => byte === 0)) break;

    const prefix = field(header, PREFIX.at, PREFIX.len);
    const name = field(header, NAME.at, NAME.len);
    const size = octal(header, SIZE.at, SIZE.len);
    const type = String.fromCodePoint(header[TYPE] ?? 0);
    offset += BLOCK;
    const body = archive.subarray(offset, offset + size);
    offset += Math.ceil(size / BLOCK) * BLOCK;

    if (type === 'L') {
      longName = Buffer.from(body).toString('utf8').replace(/\0.*$/su, '');
      continue;
    }
    const path = longName ?? (prefix === '' ? name : `${prefix}/${name}`);
    longName = null;
    // '0' and NUL both mean "regular file"; every other type is deliberately dropped.
    if (type !== '0' && type !== '\0') continue;
    if (!safe(path)) continue;
    entries.push({ path, body: Buffer.from(body) });
  }
  return entries;
}

/**
 * The archive with npm's leading `package/` directory removed, keyed by the path a consumer
 * would see after install. Every npm tarball wraps its contents in one such directory; the
 * name is `package/` in practice but is not guaranteed, so the first segment is stripped
 * whatever it is called.
 */
export function unpack(archive: Buffer): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  // Nothing here is written to disk. `untar` has already dropped every path that is
  // absolute, drive-qualified or contains a `..` segment (see `safe`), and the result is a
  // Map keyed by path rather than an extraction.
  // eslint-disable-next-line node-security/no-zip-slip -- validated in `safe`; no filesystem write
  for (const entry of untar(archive)) {
    const slash = entry.path.indexOf('/');
    if (slash === -1) continue;
    files.set(entry.path.slice(slash + 1), entry.body);
  }
  return files;
}
