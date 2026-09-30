/**
 * `roundel/import` (R11) — a theme from the two largest corpora of terminal palettes: Base16
 * schemes and iTerm2's `.itermcolors` files.
 *
 * **Data in, data out.** The caller reads the file; these functions take its text (or, for
 * Base16, the object a YAML or JSON reader already made of it) and return the object `fly()`
 * takes. No network, no bundled corpus, no file system — the same rule `flagstaff/import` keeps
 * for cli-spinners, because the weight of a corpus nobody asked for is what U5 is about.
 *
 * ```js
 * import { readFileSync } from 'node:fs';
 * import { fromBase16 } from 'roundel/import';
 * import { fly } from 'roundel/theme';
 *
 * fly(fromBase16(readFileSync('gruvbox-dark-hard.yaml', 'utf8')), runtime);
 * ```
 *
 * **Which colour each token takes.** A palette file names colours by position, not by meaning,
 * so the mapping is the one both formats already agree on: the sixteen ANSI slots a terminal
 * paints with. `error` is red, `warn` yellow, `ok` green, `flag` cyan and `value` magenta — the
 * hue each token's default names — and `ground` is the background. For Base16 that is the
 * base16-shell assignment read backwards (red ← `base08`, yellow ← `base0A`, green ← `base0B`,
 * cyan ← `base0C`, magenta ← `base0E`, background ← `base00`); for iTerm it is `Ansi 1`, `3`, `2`,
 * `6`, `5` and `Background Color`. Both tables are exported, so the mapping is data a reader can
 * see rather than a choice buried in a function.
 *
 * **Four tokens are not imported, on purpose.** `hint`, `command` and `heading` default to `dim`,
 * `bold` and `bold underline` — attributes, which a palette file has no opinion on, and a hex
 * would replace them rather than colour them. `muted` defaults to `gray`, the terminal's bright
 * black, and that slot is a scheme's comment grey, which is *designed* to recede: `base03` is
 * 2.50:1 on its ground in Default Dark and 2.52:1 in Gruvbox dark hard, and Dracula's `Ansi 8`
 * is 3.03:1 — importing it would refuse three well-made schemes over the one token nobody reads
 * first. Left at their defaults, all four follow the terminal, which in a terminal themed with
 * the same scheme is the scheme's own colour anyway.
 *
 * **Contrast-checked on the way in (R5), with `fly()`'s own judgement.** The theme is run
 * through `audit()` before it is returned, truecolor and the 256-colour substitute both, so
 * whatever these functions return `fly()` accepts, and a theme that does not read is refused
 * here with the slot it came from named. The refusal carries the unchecked theme, for a gallery
 * that wants to show *why*.
 *
 * **Refusals are named.** Anything these formats do not need is not parsed, and anything they
 * need and cannot find is an `ImportError` with a `code` and a `fix`, the shape `PluginError`
 * has: `E_IMPORT_FORMAT` (not a Base16 scheme or an XML plist at all), `E_IMPORT_SLOT` (a slot
 * the mapping reads is missing or is not a colour), `E_IMPORT_CONTRAST` (it parsed, and it
 * does not read).
 */
import { type Conformance, floors } from './contrast.js';
import { audit, type Hex, type Theme } from './theme.js';

export type ImportErrorCode = 'E_IMPORT_FORMAT' | 'E_IMPORT_SLOT' | 'E_IMPORT_CONTRAST';

/** A refused file says what is wrong and what to do about it — `PluginError`'s shape. */
export class ImportError extends Error {
  constructor(
    readonly code: ImportErrorCode,
    message: string,
    readonly fix: string,
    /** For `E_IMPORT_CONTRAST`: the theme as parsed, before the check refused it. */
    readonly theme?: Theme,
  ) {
    super(message);
    this.name = 'ImportError';
  }
}

/** The tokens a palette file colours, and `ground`. The other four keep their defaults. */
export type ImportedToken = 'ground' | 'error' | 'warn' | 'ok' | 'flag' | 'value';

/** Which Base16 slot each token is read from: base16-shell's ANSI assignment, backwards. */
export const BASE16_SLOTS: Readonly<Record<ImportedToken, string>> = {
  ground: 'base00',
  error: 'base08',
  warn: 'base0A',
  ok: 'base0B',
  flag: 'base0C',
  value: 'base0E',
};

/** Which `.itermcolors` key each token is read from: the ANSI slot its default names. */
export const ITERM_SLOTS: Readonly<Record<ImportedToken, string>> = {
  ground: 'Background Color',
  error: 'Ansi 1 Color',
  warn: 'Ansi 3 Color',
  ok: 'Ansi 2 Color',
  flag: 'Ansi 6 Color',
  value: 'Ansi 5 Color',
};

export interface ImportOptions {
  /** The WCAG level the theme is checked at, and carried on it for `fly()`. Default `AA`. */
  conformance?: Conformance;
}

const TOKENS = Object.keys(BASE16_SLOTS) as ImportedToken[];
const SRGB_MAX = 255;
const HEX_BASE = 16;
const HEX6 = /^[0-9a-f]{6}$/i;

/**
 * Build the theme from one colour per token, then hold it to `fly()`'s check. `slots` is the
 * table the colours were read through, so a refusal names the line of the file to fix.
 */
function checked(colours: Record<ImportedToken, Hex>, slots: Readonly<Record<ImportedToken, string>>, { conformance }: ImportOptions): Theme {
  const theme: Theme = conformance === undefined ? { ...colours } : { ...colours, conformance };
  const failures = audit(theme)
    .filter((f) => !f.passes)
    .map((f) => {
      const slot = slots[f.token as ImportedToken];
      return `${f.token} (${slot}) ${f.at === '256' ? `at 256 colours is ${f.colour}` : f.colour} on ${f.ground}, ${f.ratio.toFixed(2)}:1`;
    });
  if (failures.length > 0) {
    throw new ImportError(
      'E_IMPORT_CONTRAST',
      `roundel/import: below ${String(floors(conformance).TEXT)}:1 (WCAG ${conformance ?? 'AA'}) — ${failures.join('; ')}`,
      'this scheme does not read on its own background; pick another, or edit that slot in the file',
      theme,
    );
  }
  return theme;
}

/** Refuse one slot. A statement rather than a value, so every caller reads as a guard. */
function refuseSlot(slot: string, detail: string, fix: string): never {
  throw new ImportError('E_IMPORT_SLOT', `roundel/import: ${slot} ${detail}`, fix);
}

/** `#rrggbb`, `rrggbb`, quoted or not — Base16 files are written every way. */
function base16Colour(slot: string, raw: unknown): Hex {
  const value = typeof raw === 'string' ? raw.trim().replace(/^#/, '') : '';
  if (!HEX6.test(value)) {
    refuseSlot(
      slot,
      `is ${JSON.stringify(raw) ?? 'missing'}, not a six-digit hex colour`,
      raw === '' || raw === null ? 'quote the value: YAML reads an unquoted # as the start of a comment' : `give ${slot} a value like "1d2021"`,
    );
  }
  return `#${value.toLowerCase()}`;
}

/**
 * The `baseXX: value` lines of a Base16 YAML file, at any indent — which covers both the
 * original flat layout and the 0.11 spec's `palette:` block, and nothing else, because
 * nothing else is needed. A value is the text up to a closing quote, or up to ` #` when it is
 * unquoted. A slot written twice is refused rather than resolved: which one a YAML reader
 * keeps is the reader's choice, and a theme should not depend on it.
 */
function base16Lines(text: string): Record<string, string> {
  const slots = new Map<string, string>();
  // `\r?\n`, not `\n`: `.` stops at a carriage return, so a Windows-saved file would match
  // only its last line — and be refused for missing slots it plainly has.
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*(base[0-9a-f]{2})\s*:(.*)$/i.exec(line);
    if (match === null) continue;
    const key = (match[1] as string).toLowerCase();
    if (slots.has(key)) throw new ImportError('E_IMPORT_FORMAT', `roundel/import: ${key} is written twice`, 'keep one of the two lines');
    slots.set(key, yamlValue((match[2] as string).trim()));
  }
  return Object.fromEntries(slots);
}

/**
 * A YAML scalar as these files write one. Quoted, the text inside the quotes. Unquoted, ` #`
 * starts a comment — and so does a leading `#`, which is why an unquoted `base00: #1d2021` is
 * null to every YAML reader, and is refused here the same way.
 */
function yamlValue(rest: string): string {
  const quoted = /^(["'])(.*?)\1/.exec(rest);
  if (quoted !== null) return quoted[2] as string;
  if (rest.startsWith('#')) return '';
  return (rest.split(/\s#/)[0] as string).trim();
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** An object's slots, flat or under `palette`, with the keys lower-cased as the lines are. */
function base16Object(scheme: Record<string, unknown>): Record<string, unknown> {
  const palette = isRecord(scheme['palette']) ? scheme['palette'] : scheme;
  return Object.fromEntries(Object.entries(palette).map(([k, v]) => [k.toLowerCase(), v]));
}

/**
 * A theme from a Base16 scheme: the YAML file's text, a JSON file's text, or the object a
 * reader made of either. Both layouts are read — the original, with `base00`…`base0F` at the
 * top, and the 0.11 spec's, with them under `palette`.
 */
export function fromBase16(scheme: string | Record<string, unknown>, opts: ImportOptions = {}): Theme {
  let slots: Record<string, unknown>;
  if (typeof scheme === 'string') {
    if (scheme.trimStart().startsWith('{')) {
      try {
        slots = base16Object(JSON.parse(scheme) as Record<string, unknown>);
      } catch (error) {
        throw new ImportError('E_IMPORT_FORMAT', `roundel/import: not JSON — ${(error as Error).message}`, 'pass the file as it was published, YAML or JSON');
      }
    } else slots = base16Lines(scheme);
  } else if (isRecord(scheme)) slots = base16Object(scheme);
  else throw new ImportError('E_IMPORT_FORMAT', 'roundel/import: a Base16 scheme is a string or an object', "pass the file's text, or the object a YAML reader made of it");
  if (!Object.keys(slots).some((k) => /^base[0-9a-f]{2}$/.test(k))) {
    throw new ImportError('E_IMPORT_FORMAT', 'roundel/import: no base00…base0F keys — this is not a Base16 scheme', 'pass a scheme file, e.g. one from tinted-theming/schemes');
  }
  const colours = Object.fromEntries(TOKENS.map((t) => [t, base16Colour(BASE16_SLOTS[t], slots[BASE16_SLOTS[t].toLowerCase()])]));
  return checked(colours as Record<ImportedToken, Hex>, BASE16_SLOTS, opts);
}

/** `<key>Red Component</key> <real>0.5</real>`, for each channel, anywhere in one colour dict. */
const COMPONENT = /<key>(Red|Green|Blue) Component<\/key>\s*<(real|integer)>([^<]*)<\/\2>/g;
const P3 = /<key>Color Space<\/key>\s*<string>P3<\/string>/;
const CHANNELS = ['Red', 'Green', 'Blue'] as const;

/**
 * One colour dict, read as sRGB. The key has to be followed by its dict — the same text could
 * sit elsewhere as a value — and Display P3 is refused rather than read as if it were sRGB,
 * which would shift every colour and every ratio computed from it.
 */
function itermColour(plist: string, slot: string): Hex {
  const key = `<key>${slot}</key>`;
  const at = plist.indexOf(key);
  const rest = at === -1 ? '' : plist.slice(at + key.length);
  const open = /^\s*<dict>/.exec(rest);
  const close = rest.indexOf('</dict>');
  if (open === null || close === -1) throw new ImportError('E_IMPORT_SLOT', `roundel/import: ${slot} is not in the file`, 'export the whole colour preset, not a single colour');
  const dict = rest.slice(open[0].length, close);
  if (P3.test(dict)) refuseSlot(slot, 'is in Display P3, and roundel reads sRGB', 'set the profile to sRGB in iTerm2 and export it again');
  const found = new Map([...dict.matchAll(COMPONENT)].map((m) => [m[1], (m[3] as string).trim() === '' ? Number.NaN : Number(m[3])]));
  const rgb = CHANNELS.map((channel) => {
    const n = found.get(channel) ?? Number.NaN;
    if (!(n >= 0 && n <= 1)) refuseSlot(slot, `has no ${channel} Component between 0 and 1`, 're-export the preset from iTerm2: Settings → Profiles → Colors → Color Presets → Export');
    return Math.round(n * SRGB_MAX);
  });
  return `#${rgb.map((v) => v.toString(HEX_BASE).padStart(2, '0')).join('')}`;
}

/**
 * A theme from an iTerm2 `.itermcolors` file — its text, an XML property list. A binary plist
 * is refused with the command that converts it; nothing else in the file is read.
 */
export function fromITerm(plist: string, opts: ImportOptions = {}): Theme {
  if (typeof plist !== 'string' || plist.startsWith('bplist')) {
    throw new ImportError('E_IMPORT_FORMAT', 'roundel/import: not an XML property list', 'pass the text of the file; a binary one converts with `plutil -convert xml1 <file>`');
  }
  if (!plist.includes('<plist') || !plist.includes('<dict>')) {
    throw new ImportError('E_IMPORT_FORMAT', 'roundel/import: no <plist><dict> — this is not an .itermcolors file', 'pass a colour preset exported from iTerm2');
  }
  const colours = Object.fromEntries(TOKENS.map((t) => [t, itermColour(plist, ITERM_SLOTS[t])]));
  return checked(colours as Record<ImportedToken, Hex>, ITERM_SLOTS, opts);
}
