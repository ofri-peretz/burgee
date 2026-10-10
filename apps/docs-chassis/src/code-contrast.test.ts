/**
 * Every colour a code block can paint clears WCAG AA (4.5:1) on the card it is painted on, in
 * both themes. Lighthouse measured the opposite on every docs site in the family with
 * fumadocs' default pair — github-dark's comments at 3.82:1 on the dark card, github-light's
 * orange at 3.48:1 on white — so this reads the themes `source-config.mjs` actually configures,
 * through fumadocs' own highlighter, against the card colours `global.css` actually states.
 */
import { readFileSync } from 'node:fs';

import { getHighlighter } from 'fumadocs-core/highlight';
import { describe, expect, it } from 'vitest';

import { CODE_THEMES } from './source-config.mjs';

/** WCAG 2.x AA for normal-size text; code is set below the 18pt "large text" line. */
const AA_NORMAL_TEXT = 4.5;

const CSS = readFileSync(new URL('global.css', import.meta.url), 'utf8');

/** The `--color-fd-card` value inside the first rule whose selector is `selector`. */
function cardColour(selector: string): string {
  const missing = new Error(`global.css states no --color-fd-card under ${selector}`);
  const start = CSS.indexOf(`${selector} {`);
  if (start === -1) throw missing;
  const match = /--color-fd-card:\s*(#[\da-f]{6})/iu.exec(CSS.slice(start, CSS.indexOf('}', start)));
  if (match?.[1] === undefined) throw missing;
  return match[1];
}

type Rgb = readonly [number, number, number];

/** `#rrggbb` or `#rrggbbaa`, composited over `ground` when it carries alpha. */
function rgb(hex: string, ground?: Rgb): Rgb {
  const channel = (index: number): number => Number.parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16);
  const colour: Rgb = [channel(0), channel(1), channel(2)];
  if (hex.length !== 9 || ground === undefined) return colour;
  const alpha = channel(3) / 255;
  return [0, 1, 2].map((i) => colour[i]! * alpha + ground[i]! * (1 - alpha)) as unknown as Rgb;
}

/** One sRGB channel, 0–255, linearised at IEC 61966-2-1's 0.04045, as axe-core (which Lighthouse runs) does. */
function linear(value: number): number {
  const c = value / 255;
  return c <= 0.040_45 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance([r, g, b]: Rgb): number {
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function contrast(a: Rgb, b: Rgb): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (high + 0.05) / (low + 0.05);
}

/**
 * Scopes that never colour a glyph. `carriage-return` is VS Code's marker for line-ending
 * whitespace — the grammars that emit it (mdx's two-space hard break, emacs-lisp's `\r`) put it
 * on spaces only, and contrast is a property of text a reader has to read.
 */
const WHITESPACE_ONLY_SCOPES = new Set(['carriage-return']);

/** Every foreground the theme can paint, with the ground it is painted on. */
async function pairsOf(themeName: (typeof CODE_THEMES)[keyof typeof CODE_THEMES], card: string): Promise<{ scope: string; fg: string; ratio: number }[]> {
  const highlighter = await getHighlighter('js', { themes: [themeName] });
  const theme = highlighter.getTheme(themeName);
  const cardRgb = rgb(card);
  const entries = [{ scope: 'editor.foreground', foreground: theme.fg, background: undefined as string | undefined }];
  for (const setting of theme.settings) {
    const { foreground, background } = setting.settings ?? {};
    if (foreground === undefined) continue;
    const scopes = [setting.scope ?? '(default)'].flat();
    if (scopes.every((scope) => WHITESPACE_ONLY_SCOPES.has(scope))) continue;
    const scope = scopes.join(', ');
    entries.push({ scope, foreground, background });
  }
  return entries.map(({ scope, foreground, background }) => {
    // A token that paints its own background (diff and invalid markup) is read on that.
    const ground = background === undefined ? cardRgb : rgb(background, cardRgb);
    return { scope, fg: foreground, ratio: Number(contrast(rgb(foreground, ground), ground).toFixed(2)) };
  });
}

describe('code-block contrast', () => {
  it.each([
    ['light', CODE_THEMES.light, ':root'],
    ['dark', CODE_THEMES.dark, '.dark'],
  ] as const)('every %s-theme token (%s) clears 4.5:1 on the card under %s', async (_mode, themeName, selector) => {
    const pairs = await pairsOf(themeName, cardColour(selector));
    expect(pairs.length).toBeGreaterThan(10);
    expect(pairs.filter((pair) => pair.ratio < AA_NORMAL_TEXT)).toEqual([]);
  });
});
