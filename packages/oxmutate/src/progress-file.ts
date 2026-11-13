/**
 * A unit's progress file: the mutant now running and when it started, or nothing. The runner (and,
 * for an isolated batch, the server) writes it before each mutant; the scheduler's watchdog reads it
 * every 50 ms and stops a run past its budget.
 *
 * Both sides keep the file open. Opening and closing it per write cost 6.6 ms a mutant run on a
 * laptop whose endpoint scanner inspects every close, against 0.003 ms on an open descriptor, and
 * a poll that opened it was 2.3 s of a 53 s run (burgee/paratext, 2026-11-11).
 */
import { closeSync, openSync, readSync, writeSync } from 'node:fs';

/** More than a mark holds: a mutant id, a space and a millisecond time. */
// Stryker disable next-line NumericLiteral: any size above the longest mark reads the same mark; one byte more or less changes no read
const MARK_BYTES = 256;

export interface MarkWriter {
  /** Replace the mark. `''` clears it. */
  write: (text: string) => void;
  close: () => void;
}

/**
 * Opens `file` for marks, emptying it. Each mark is padded to the longest one written, so one write
 * replaces the last and the file is never truncated again: truncating it per mutant was 1.8 s of
 * that 53 s run. The reader trims, so the padding reads as nothing.
 */
export function markWriter(file: string): MarkWriter {
  const fd = openSync(file, 'w');
  let length = 0;
  return {
    write(text) {
      const padded = text.padEnd(length);
      length = padded.length;
      writeSync(fd, padded, 0);
    },
    close: () => closeSync(fd),
  };
}

export interface MarkReader {
  /** The mark as it stands, trimmed: `''` when no mutant is running. */
  read: () => string;
  close: () => void;
}

/**
 * Creates `file` empty and reads it in place from then on. A writer that opens the same file
 * afterwards, truncating it, writes to the file this descriptor reads.
 */
export function markReader(file: string): MarkReader {
  const fd = openSync(file, 'w+');
  const buffer = Buffer.alloc(MARK_BYTES);
  return {
    read: () => buffer.toString('utf8', 0, readSync(fd, buffer, 0, MARK_BYTES, 0)).trim(),
    close: () => closeSync(fd),
  };
}
