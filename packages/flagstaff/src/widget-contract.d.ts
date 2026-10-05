/**
 * The widget contract (controlroom R16): the flagstaff surface controlroom builds on, pinned.
 *
 * This file is the one place it is written down. `widget-contract.test.ts` holds flagstaff's
 * published declarations (`dist/*.d.ts`) to it, word for word, and the TypeScript types to it
 * both ways — so changing `Component`, `Writer`, `Clock` or the frame seam without changing
 * this file turns flagstaff red. controlroom keeps a byte-identical copy and its own lock holds
 * that copy to this file and to the flagstaff it installed, so changing this file alone turns
 * controlroom red. Neither side changes the contract silently.
 *
 * Where each name is published:
 *   `Component`                           flagstaff/plugin
 *   `Writer`, `Clock`, `FrameWriter`,
 *   `frameWriter`                         flagstaff/loop
 *
 * Comments here are not part of the contract; the lock compares declarations only.
 */

/** A stream the loop and the frame seam write to. */
export interface Writer {
  write(chunk: string): unknown;
  readonly columns?: number | undefined;
}

/** Time as the loop sees it. */
export interface Clock {
  now(): number;
  schedule(fn: () => void, ms: number): () => void;
}

/** A widget: a static projection, and optionally the animated form. */
export interface Component<S = unknown> {
  name: string;
  static(state: S): string;
  frame?(t: number, state: S): string;
  interval?: number;
  sample?: {
    running: S;
    done: S;
  };
}

/** The frame-writing seam: a whole frame in, the changed rows out, synchronized. */
export interface FrameWriter {
  paint(lines: readonly string[]): void;
  release(): void;
}

export declare function frameWriter(out: Writer): FrameWriter;
