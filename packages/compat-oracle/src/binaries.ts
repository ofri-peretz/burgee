/**
 * Compiled executables, recognised by what they are rather than by what they are called.
 *
 * **No vendored suite carries one.** execa 10.1.0 ships two beside its tests —
 * `test/fixtures/fast-exit-darwin` (Mach-O) and `test/fixtures/fast-exit-linux` (ELF) — and
 * vendoring "the test directory, byte for byte" committed both. OpenSSF Scorecard's
 * Binary-Artifacts check then scored the repository 8 / 10 and named them. A binary in a
 * source tree is a file nobody here can review: the sources it was built from are not in the
 * clone, so "upstream's, byte for byte" is a claim about it that no reader can check.
 *
 * Detected by **content** — the magic bytes at the head of the file — never by name or
 * extension. Both of execa's have no extension at all, which is exactly the shape a
 * name-based rule misses; `TEXT` in `vendor.ts` even matched them as text, because an
 * extension-less name is how a shebang script is usually written.
 *
 * Three formats, the three a test suite on node could run: ELF (Linux), Mach-O (macOS, thin
 * or universal) and PE (Windows). A file is removed from the vendored copy and listed in
 * `.source.json` under `omitted` and in `PROVENANCE`, so the omission is visible; a case that
 * needed the file is then excluded by name in `hosts.ts`, for ours and the control alike.
 */
import { createHash } from 'node:crypto';
import { closeSync, openSync, readdirSync, readFileSync, readSync, rmSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

export type ExecutableFormat = 'ELF' | 'Mach-O' | 'PE';

/** One file the vendor step did not copy, and the evidence for why. */
export interface OmittedFile {
  /** Posix path relative to the vendored root, as `.source.json` keys are written. */
  path: string;
  format: ExecutableFormat;
  /** sha256 of the upstream bytes, so a reader can confirm the file at the tag is this one. */
  sha256: string;
}

/** How many bytes of a file the magic checks read. PE's header offset sits at 0x3C. */
const HEAD = 64;
/** Where a PE file's DOS stub stores the offset of its `PE\0\0` signature. */
const PE_OFFSET_AT = 0x3c;
/**
 * A universal Mach-O and a Java class file share `CAFEBABE`. The word after it is the count
 * of architectures in a fat binary and the class file's version in a class file, which starts
 * at 45 — so a count below that is a fat binary, the test `file(1)` itself uses.
 */
const JAVA_CLASS_MIN_VERSION = 45;
/** One 32-bit word: the width of every magic number here, and of PE's header offset. */
const WORD = 4;
/** A Mach-O magic and the word after it, which a universal binary needs to be told apart. */
const TWO_WORDS = 8;

const ELF = [0x7f, 0x45, 0x4c, 0x46];
/** `MZ`, the DOS header every PE opens with. */
const MZ = [0x4d, 0x5a];
/** `PE\0\0`, where that header points. */
const PE_SIGNATURE = [0x50, 0x45, 0, 0];
/** Thin Mach-O, 32- and 64-bit, both byte orders. */
const MACHO_THIN = [0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe];
/** Universal ("fat") Mach-O, 32- and 64-bit offsets; always big-endian on disk. */
const MACHO_FAT = [0xcafebabe, 0xcafebabf];

const startsWith = (head: Uint8Array, magic: number[]): boolean => magic.every((b, i) => head[i] === b);

/**
 * The executable format a file's leading bytes declare, or `undefined` for anything else.
 *
 * `peSignature` is the four bytes at the offset the DOS header names; `MZ` alone is two
 * printable characters a text file could open with, so a PE is only a PE when its header
 * points at a real `PE\0\0`.
 */
export function executableFormat(head: Uint8Array, peSignature?: Uint8Array): ExecutableFormat | undefined {
  if (startsWith(head, ELF)) return 'ELF';
  if (head.length >= TWO_WORDS) {
    const view = new DataView(head.buffer, head.byteOffset, head.byteLength);
    const word = view.getUint32(0, false);
    if (MACHO_THIN.includes(word)) return 'Mach-O';
    if (MACHO_FAT.includes(word) && view.getUint32(WORD, false) < JAVA_CLASS_MIN_VERSION) return 'Mach-O';
  }
  if (startsWith(head, MZ) && peSignature !== undefined && startsWith(peSignature, PE_SIGNATURE)) return 'PE';
  return undefined;
}

/** Read `length` bytes at `position`; shorter at the end of the file. */
function bytesAt(fd: number, position: number, length: number): Uint8Array {
  const buffer = Buffer.alloc(length);
  const read = readSync(fd, buffer, 0, length, position);
  return buffer.subarray(0, read);
}

/** The executable format of the file at `path`, read off its content. */
export function executableAt(path: string): ExecutableFormat | undefined {
  const fd = openSync(path, 'r');
  try {
    const head = bytesAt(fd, 0, HEAD);
    const isMz = head.length >= PE_OFFSET_AT + WORD && startsWith(head, MZ);
    const peSignature = isMz ? bytesAt(fd, Buffer.from(head).readUInt32LE(PE_OFFSET_AT), WORD) : undefined;
    return executableFormat(head, peSignature);
  } finally {
    closeSync(fd);
  }
}

/**
 * Remove every compiled executable under `root` and say which. Walked recursively, symlinks
 * left alone (a link is not a binary, and following one could reach outside the copy), and
 * returned sorted so the record is the same bytes on every machine.
 */
export function stripExecutables(root: string): OmittedFile[] {
  // Sorted before anything is read, by the default comparator — code-unit order, never the
  // machine's locale — so the record is in path order however the filesystem lists it.
  const files = readdirSync(root, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(root, join(entry.parentPath, entry.name)).split(sep).join('/'))
    .sort();
  const omitted: OmittedFile[] = [];
  for (const path of files) {
    const at = join(root, path);
    const format = executableAt(at);
    if (format === undefined) continue;
    omitted.push({ path, format, sha256: createHash('sha256').update(readFileSync(at)).digest('hex') });
    rmSync(at);
  }
  return omitted;
}
