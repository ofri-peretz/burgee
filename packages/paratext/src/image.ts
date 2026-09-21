/**
 * OSC 1337 — iTerm2's inline image — in a module of its own, for the reason `link.ts` exists
 * (R13): `paratext/term-img` needs the record without `capability.ts` and the 6,756 B of
 * `schema.json` behind it. **Moved, not copied** — `builtins.ts` re-exports it under the name
 * it has always had, so the object the registry ships and the object the façade renders are
 * one object. `capability.ts` is a type-only import here and is erased.
 */
import { type Capability, type Fields } from './capability.js';

const BEL = '';
const OSC = ']';

/**
 * OSC 1337 — iTerm2's inline image. Kitty and Sixel are their own capabilities. The four
 * optional groups are `ansi-escapes`' four options in its order, so R8's `image()` is
 * byte-identical to the incumbent's rather than merely call-compatible; `size` is optional
 * in the protocol and required by xterm.js, so upstream always writes it and so do we.
 */
export const IMAGE: Capability = {
  name: 'image',
  osc: 1337,
  when: { tty: true, termProgram: ['iTerm.app'] },
  encode: `${OSC}1337;File=inline=1[;width={width}][;height={height}][;preserveAspectRatio={preserveAspectRatio}][;size={size}]:{base64}${BEL}`,
  fallback: '{caption}',
};

/** `ansi-escapes`' `image()` options, plus the field a projection needs. */
export interface ImageOptions {
  /** Cells, pixels (`20px`) or percent (`50%`) — passed through as the incumbent passes it. */
  width?: number | string;
  height?: number | string;
  /** `false` writes `preserveAspectRatio=0`, exactly as upstream does. */
  preserveAspectRatio?: boolean;
  /**
   * What a terminal that cannot draw the image prints instead. paratext's addition, and not
   * optional in spirit: an image with no caption projects to nothing, which is silence where
   * the incumbent would have written bytes nobody can read.
   */
  caption?: string;
}

/** Only when truthy, which is upstream's own test (`if (options.width)`). */
const optional = (value: number | string | undefined): string | undefined => (value === undefined || value === 0 || value === '' ? undefined : String(value));

/**
 * The fields {@link IMAGE} reads. Shared by both callers on purpose: `ansi-escapes.ts`
 * renders them through `emit()`, `term-img.ts` against the record directly, and two copies of
 * the base64-and-size arithmetic would diverge on the first option either side added.
 */
export function imageFields(data: Uint8Array | string, options: ImageOptions = {}): Fields {
  const bytes = typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.from(data);
  return {
    base64: bytes.toString('base64'),
    caption: options.caption,
    width: optional(options.width),
    height: optional(options.height),
    // Upstream writes this only for an explicit `false`; `true` is the default and says
    // nothing. Same rule here, so the two produce the same bytes for the same call.
    preserveAspectRatio: options.preserveAspectRatio === false ? '0' : undefined,
    // The spec calls it optional and xterm.js does not, so it is always written.
    size: String(bytes.byteLength),
  };
}
