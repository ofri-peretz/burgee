/**
 * `flagstaff/import` (R11) — the two data corpora the ecosystem already has, as plugins.
 *
 * cli-spinners ships ~80 spinner styles and cli-boxes ships eight border sets, both as
 * plain JSON that thousands of programs already depend on. Neither is bundled here: the
 * weight of a corpus nobody asked for is exactly what U5 is about, and a caller who wants
 * one already has it on disk. So these take the JSON and hand back a plugin:
 *
 * ```js
 * import cliSpinners from 'cli-spinners';
 * import { fromCliSpinners } from 'flagstaff/import';
 * import { register } from 'flagstaff/plugin';
 *
 * register(fromCliSpinners(cliSpinners));
 * spinner('moon');
 * ```
 *
 * The result is an ordinary plugin — it goes through the same `register()`, is validated
 * against the same schema, and can be replaced by another. That is the point: the gallery
 * opens full, and a third-party plugin starts as a copy of one of these.
 */
import { type BorderStyle, type Plugin, type SpinnerDef } from './plugin.js';

/** cli-spinners' shape: no `static`, because it has no projection for a pipe. */
export interface CliSpinner {
  frames: string[];
  interval?: number;
}

/** cli-boxes' shape — the same eight keys `BorderStyle` has, which is why it imports whole. */
export type CliBox = BorderStyle;

const DEFAULT_INTERVAL = 80;
/** What a spinner with no projection of its own gets, matching the built-ins' `running`. */
const DEFAULT_STATIC = '…';

export interface FromCliSpinnersOptions {
  /** The plugin's name, which is what `flagstaff check` and the gallery label it with. */
  name?: string;
  /**
   * The static projection for a style, given its name and its frames. Default: `'…'` for
   * every one of them.
   *
   * The design sketched "the first frame" here, and that turned out to be wrong when it met
   * the corpus: a frozen `⠋` or `▰` is an animation stopped mid-stride, not a projection —
   * it tells a pipe, an agent and a screen reader nothing that `…` does not tell them
   * better. The parameter exists because it is the author's call, not this function's.
   */
  staticFor?: (name: string, spinner: CliSpinner) => string;
}

/** Turn cli-spinners' `spinners.json` into a plugin. The corpus stays the caller's. */
export function fromCliSpinners(corpus: Record<string, CliSpinner>, { name = 'cli-spinners', staticFor = () => DEFAULT_STATIC }: FromCliSpinnersOptions = {}): Plugin {
  const spinners: Record<string, SpinnerDef> = {};
  for (const [style, spinner] of Object.entries(corpus)) {
    // `random` is cli-spinners' own function export, not a style; a JSON corpus has none,
    // but a caller who passes the module rather than the JSON would otherwise import it.
    if (!Array.isArray(spinner?.frames) || spinner.frames.length === 0) continue;
    spinners[style] = { frames: spinner.frames, interval: spinner.interval ?? DEFAULT_INTERVAL, static: staticFor(style, spinner) };
  }
  return { name, contract: 1, spinners };
}

export interface FromCliBoxesOptions {
  name?: string;
}

/** Turn cli-boxes' `boxes.json` into a plugin. Its shape is already ours, so this is a copy. */
export function fromCliBoxes(corpus: Record<string, CliBox>, { name = 'cli-boxes' }: FromCliBoxesOptions = {}): Plugin {
  const borders: Record<string, BorderStyle> = {};
  for (const [style, box] of Object.entries(corpus)) {
    if (typeof box?.topLeft !== 'string') continue;
    borders[style] = box;
  }
  return { name, contract: 1, borders };
}
