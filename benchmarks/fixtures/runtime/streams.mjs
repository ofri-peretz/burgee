/** Fake terminals for the output and prompt workloads: TTY-shaped, 80×24, writing nowhere. */
import { PassThrough, Writable } from 'node:stream';

/** What log-update and ora write to: a TTY that counts bytes and discards them. */
export class FakeTTY {
  constructor() {
    this.isTTY = true;
    this.columns = 80;
    this.rows = 24;
    this.bytes = 0;
  }
  write(s) {
    this.bytes += s.length;
    return true;
  }
  on() {
    return this;
  }
  once() {
    return this;
  }
  off() {
    return this;
  }
  removeListener() {
    return this;
  }
  emit() {
    return false;
  }
  cursorTo() {
    return true;
  }
  moveCursor() {
    return true;
  }
  clearLine() {
    return true;
  }
  getColorDepth() {
    return 24;
  }
  hasColors() {
    return true;
  }
}

/** A raw-mode TTY input a prompt reads keystrokes from. */
export function ttyInput() {
  const input = new PassThrough();
  input.isTTY = true;
  input.isRaw = true;
  input.setRawMode = () => input;
  return input;
}

/** A TTY output a prompt renders into, discarding every frame. */
export function ttyOutput() {
  const output = new Writable({
    write(_chunk, _encoding, done) {
      done();
    },
  });
  output.isTTY = true;
  output.columns = 80;
  output.rows = 24;
  return output;
}
