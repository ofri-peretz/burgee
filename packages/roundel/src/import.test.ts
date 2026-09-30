/**
 * R11 — `roundel/import`: a theme from a Base16 scheme or an iTerm2 `.itermcolors` file,
 * contrast-checked on the way in with `fly()`'s own judgement.
 *
 * The fixtures under `__fixtures__/` are real files in the two formats, not objects typed into
 * this test, because the parsing is the half that can be wrong while every object-shaped test
 * stays green:
 *
 *   - `gruvbox-dark-hard.yaml` — the tinted-theming 0.11 layout (`system`, `palette:`, `#`-
 *     prefixed quoted values, trailing comments). Gruvbox is morhetz's; the Base16 port is
 *     Dawid Kurek's, MIT.
 *   - `tomorrow-night.yaml` — the original chriskempson/base16 layout (flat, unprefixed values).
 *     Chris Kempson's Tomorrow Night, MIT. It is refused, and that is the point of it: its red
 *     is 4.46:1 on its own background.
 *   - `dracula.itermcolors` — the XML property list iTerm2's Export writes, every key sorted
 *     and every component a `<real>`, with Dracula's published palette (Zeno Rocha, MIT).
 */
import { readFileSync } from 'node:fs';

import { beforeEach, describe, expect, it } from 'vitest';

import { BASE16_SLOTS, fromBase16, fromITerm, ImportError, ITERM_SLOTS } from './import.js';
import { validate } from './plugin.js';
import { flown, type Runtime } from './policy.js';
import { audit, fly, type Theme } from './theme.js';

const fixture = (name: string): string => readFileSync(new URL(`__fixtures__/${name}`, import.meta.url), 'utf8');
const GRUVBOX = fixture('gruvbox-dark-hard.yaml');
const TOMORROW = fixture('tomorrow-night.yaml');
const DRACULA = fixture('dracula.itermcolors');

const truecolor: Runtime = { env: { COLORTERM: 'truecolor' }, isTTY: { stdout: true } };

beforeEach(() => {
  flown.level = 0;
  flown.paint = {};
});

/** The refusal a call throws, so its fields can be asserted. Fails the test when nothing is thrown. */
function refusal(run: () => unknown): ImportError {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(ImportError);
    return error as ImportError;
  }
  throw new Error('expected an ImportError, and nothing was thrown');
}

/** A minimal Base16 scheme, flat, with one slot overridden or removed. */
const scheme = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  base00: '1d2021',
  base08: 'fb4934',
  base0A: 'fabd2f',
  base0B: 'b8bb26',
  base0C: '8ec07c',
  base0E: 'd3869b',
  ...over,
});

/** The Dracula plist with one colour dict's body replaced. */
const withDict = (slot: string, body: string): string => {
  const key = `<key>${slot}</key>`;
  const at = DRACULA.indexOf(key) + key.length;
  const end = DRACULA.indexOf('</dict>', at) + '</dict>'.length;
  return `${DRACULA.slice(0, at)}\n\t<dict>${body}</dict>${DRACULA.slice(end)}`;
};
const components = (r: string, g: string, b: string, extra = ''): string =>
  `<key>Red Component</key><real>${r}</real><key>Green Component</key><real>${g}</real><key>Blue Component</key><real>${b}</real>${extra}`;

describe('fromBase16 — a real scheme file in each layout', () => {
  it('reads the 0.11 `palette:` layout, prefixes, quotes and trailing comments and all', () => {
    expect(fromBase16(GRUVBOX)).toEqual({
      ground: '#1d2021',
      error: '#fb4934',
      warn: '#fabd2f',
      ok: '#b8bb26',
      flag: '#8ec07c',
      value: '#d3869b',
    });
  });

  it('refuses Tomorrow Night, whose red does not read on its own ground, naming the slot to fix', () => {
    const e = refusal(() => fromBase16(TOMORROW));
    expect(e.code).toBe('E_IMPORT_CONTRAST');
    expect(e.message).toBe('roundel/import: below 4.5:1 (WCAG AA) — error (base08) #cc6666 on #1d1f21, 4.46:1');
    expect(e.fix).toMatch(/does not read/);
    // The theme as parsed rides on the refusal: the original flat layout was read in full.
    expect(e.theme).toEqual({ ground: '#1d1f21', error: '#cc6666', warn: '#f0c674', ok: '#b5bd68', flag: '#8abeb7', value: '#b294bb' });
  });

  it('refuses exactly what fly() refuses — one judgement, not two', () => {
    const e = refusal(() => fromBase16(TOMORROW));
    expect(() => fly(e.theme as Theme, truecolor)).toThrow(/error #cc6666 on #1d1f21 is 4\.46:1/);
  });
});

describe('fromITerm — a real .itermcolors file', () => {
  it('reads the ANSI slots and the background out of the property list', () => {
    expect(fromITerm(DRACULA)).toEqual({
      ground: '#282a36',
      error: '#ff5555',
      warn: '#f1fa8c',
      ok: '#50fa7b',
      flag: '#8be9fd',
      value: '#ff79c6',
    });
  });
});

describe('whatever an importer returns, the rest of roundel accepts', () => {
  const imported: [string, Theme][] = [
    ['gruvbox', fromBase16(GRUVBOX)],
    ['dracula', fromITerm(DRACULA)],
  ];

  it.each(imported)('%s flies at truecolor, and paints the scheme’s red as error', (_, theme) => {
    fly(theme, truecolor);
    expect(flown.level).toBe(3);
    expect(flown.paint.error).toEqual({ sgr: [38, 2, ...[1, 3, 5].map((i) => Number.parseInt((theme.error as string).slice(i, i + 2), 16))] });
  });

  it.each(imported)('%s passes audit() at truecolor and at its 256-colour substitute', (_, theme) => {
    const rows = audit(theme).filter((f) => f.token in theme);
    expect(rows).toHaveLength(10);
    expect(rows.every((f) => f.passes)).toBe(true);
  });

  it.each(imported)('%s is a valid plugin `tokens` object, so it can be registered as a theme', (_, theme) => {
    expect(() => {
      validate({ name: 'imported', tokens: theme });
    }).not.toThrow();
  });

  it.each(imported)('%s leaves the four attribute and grey tokens to their defaults', (_, theme) => {
    for (const token of ['hint', 'muted', 'command', 'heading']) expect(theme).not.toHaveProperty(token);
  });
});

describe('the mapping is data', () => {
  it('reads each token from the ANSI slot its default names, in both formats', () => {
    expect(BASE16_SLOTS).toEqual({ ground: 'base00', error: 'base08', warn: 'base0A', ok: 'base0B', flag: 'base0C', value: 'base0E' });
    expect(ITERM_SLOTS).toEqual({ ground: 'Background Color', error: 'Ansi 1 Color', warn: 'Ansi 3 Color', ok: 'Ansi 2 Color', flag: 'Ansi 6 Color', value: 'Ansi 5 Color' });
  });
});

describe('conformance', () => {
  it('holds the theme to AAA when asked, and says which level refused it', () => {
    const e = refusal(() => fromBase16(GRUVBOX, { conformance: 'AAA' }));
    expect(e.code).toBe('E_IMPORT_CONTRAST');
    expect(e.message).toMatch(/^roundel\/import: below 7:1 \(WCAG AAA\) — error \(base08\) #fb4934 on #1d2021, 4\.77:1/);
    expect(e.theme?.conformance).toBe('AAA');
  });

  it('carries the level on a theme that passes it, so fly() checks at the same one', () => {
    const bright = scheme({ base00: '000000', base08: 'ff9999', base0A: 'ffff00', base0B: '00ff00', base0C: '00ffff', base0E: 'ff99ff' });
    const theme = fromBase16(bright, { conformance: 'AAA' });
    expect(theme.conformance).toBe('AAA');
    expect(audit(theme).filter((f) => f.token in theme).every((f) => f.required === 7 && f.passes)).toBe(true);
  });

  it('names a failing 256-colour substitute as the substitute, not as the hex written', () => {
    // Nothing clears 7:1 on a mid-grey ground, so the substitute search has no candidate and
    // falls back to per-channel rounding — and that row is refused too, as what is sent.
    const e = refusal(() => fromBase16(scheme({ base00: '767676', base08: '000000' }), { conformance: 'AAA' }));
    expect(e.message).toContain('error (base08) #000000 on #767676, 4.62:1; error (base08) at 256 colours is #000000 on #767676, 4.62:1');
  });
});

describe('fromBase16 — the ways a scheme is written', () => {
  it('reads an object a YAML reader made, flat or under `palette`, with keys in either case', () => {
    const flat = fromBase16(scheme());
    expect(fromBase16({ palette: scheme() })).toEqual(flat);
    const { base00: _ground, ...rest } = scheme();
    expect(fromBase16({ BASE00: '#1D2021', ...rest })).toEqual(flat);
  });

  it('reads a JSON file’s text', () => {
    expect(fromBase16(JSON.stringify({ palette: scheme() }))).toEqual(fromBase16(scheme()));
    expect(fromBase16(`  \n${JSON.stringify(scheme())}`)).toEqual(fromBase16(scheme()));
  });

  it('reads single quotes, no quotes, a trailing comment and CRLF line endings', () => {
    const yaml = ["base00: '1d2021'", 'base08: fb4934 # red', 'base0A: "#fabd2f"', 'base0B: b8bb26\t# green', 'base0C: 8ec07c', 'base0E: d3869b'].join('\r\n');
    expect(fromBase16(yaml)).toEqual(fromBase16(scheme()));
  });

  it('ignores every slot and key the mapping does not read', () => {
    expect(fromBase16(scheme({ base09: 'not a colour', base0F: undefined, scheme: 'x' }))).toEqual(fromBase16(scheme()));
  });
});

describe('fromBase16 — refusals, each with a code and a fix', () => {
  it.each([
    ['a number', 42],
    ['null', null],
    ['an array', [scheme()]],
  ])('refuses %s: a scheme is a string or an object', (_, input) => {
    const e = refusal(() => fromBase16(input as unknown as string));
    expect(e.code).toBe('E_IMPORT_FORMAT');
    expect(e.message).toBe('roundel/import: a Base16 scheme is a string or an object');
  });

  it('refuses text that opens like JSON and is not', () => {
    const e = refusal(() => fromBase16('{ "base00": '));
    expect(e.code).toBe('E_IMPORT_FORMAT');
    expect(e.message).toMatch(/^roundel\/import: not JSON — /);
  });

  it('refuses a file with no base slots at all — the wrong file, not a broken scheme', () => {
    for (const input of ['scheme: "x"\nauthor: "y"\n', { name: 'x' }, { palette: {} }]) {
      const e = refusal(() => fromBase16(input));
      expect(e.code).toBe('E_IMPORT_FORMAT');
      expect(e.message).toMatch(/no base00…base0F keys/);
    }
  });

  it('refuses a slot written twice rather than choosing one of them', () => {
    const e = refusal(() => fromBase16(`${GRUVBOX}  base08: "#ffffff"\n`));
    expect(e.code).toBe('E_IMPORT_FORMAT');
    expect(e.message).toBe('roundel/import: base08 is written twice');
  });

  it('refuses a missing slot, naming it', () => {
    const e = refusal(() => fromBase16(scheme({ base0E: undefined })));
    expect(e.code).toBe('E_IMPORT_SLOT');
    expect(e.message).toBe('roundel/import: base0E is missing, not a six-digit hex colour');
  });

  it('refuses an unquoted `#` value, which YAML reads as a comment, and says to quote it', () => {
    const text = GRUVBOX.replace('base08: "#fb4934"', 'base08: #fb4934');
    const e = refusal(() => fromBase16(text));
    expect(e.code).toBe('E_IMPORT_SLOT');
    expect(e.message).toBe('roundel/import: base08 is "", not a six-digit hex colour');
    expect(e.fix).toMatch(/quote the value/);
    // …and the object a YAML reader makes of the same line, where the value is null.
    expect(refusal(() => fromBase16(scheme({ base08: null }))).fix).toMatch(/quote the value/);
  });

  it.each(['zzzzzz', '#12345', '1234567', 123456])('refuses %j, which is not a colour', (value) => {
    const e = refusal(() => fromBase16(scheme({ base0B: value })));
    expect(e.code).toBe('E_IMPORT_SLOT');
    expect(e.message).toMatch(/^roundel\/import: base0B is .+, not a six-digit hex colour$/);
    expect(e.fix).toBe('give base0B a value like "1d2021"');
  });
});

describe('fromITerm — the ways a preset is written', () => {
  it('reads an integer component, and a dict with no Color Space', () => {
    const plist = withDict('Ansi 1 Color', components('1', '0.3333333333333333', '0.3333333333333333').replace('<real>1</real>', '<integer>1</integer>'));
    expect(fromITerm(plist).error).toBe('#ff5555');
  });

  it('reads the components in any order', () => {
    const body = '<key>Blue Component</key><real>0.3333333333333333</real><key>Red Component</key><real>1</real><key>Green Component</key><real>0.3333333333333333</real>';
    expect(fromITerm(withDict('Ansi 1 Color', body)).error).toBe('#ff5555');
  });

  it('reads a Calibrated or sRGB colour space as sRGB', () => {
    const calibrated = components('1', '0.3333333333333333', '0.3333333333333333', '<key>Color Space</key><string>Calibrated</string>');
    expect(fromITerm(withDict('Ansi 1 Color', calibrated)).error).toBe('#ff5555');
  });
});

describe('fromITerm — refusals, each with a code and a fix', () => {
  it('refuses a binary property list with the command that converts it', () => {
    const e = refusal(() => fromITerm('bplist00\u0000\u0001'));
    expect(e.code).toBe('E_IMPORT_FORMAT');
    expect(e.fix).toMatch(/plutil -convert xml1/);
  });

  it('refuses something that is not text', () => {
    expect(refusal(() => fromITerm(Buffer.from(DRACULA) as unknown as string)).code).toBe('E_IMPORT_FORMAT');
  });

  it.each([
    ['no <plist>', DRACULA.replace('<plist version="1.0">', '')],
    ['no <dict>', '<plist version="1.0"></plist>'],
  ])('refuses a file with %s', (_, plist) => {
    const e = refusal(() => fromITerm(plist));
    expect(e.code).toBe('E_IMPORT_FORMAT');
    expect(e.message).toBe('roundel/import: no <plist><dict> — this is not an .itermcolors file');
  });

  it('refuses a preset missing a slot the mapping reads, naming it', () => {
    const e = refusal(() => fromITerm(DRACULA.replace('<key>Ansi 5 Color</key>', '<key>Ansi 5 Colour</key>')));
    expect(e.code).toBe('E_IMPORT_SLOT');
    expect(e.message).toBe('roundel/import: Ansi 5 Color is not in the file');
  });

  it('refuses a slot key that is not followed by its colour dict', () => {
    const plist = DRACULA.replace('<key>Background Color</key>', '<key>Background Color</key>\n\t<string>#282a36</string>\n\t<key>Unused</key>');
    const e = refusal(() => fromITerm(plist));
    expect(e.message).toBe('roundel/import: Background Color is not in the file');
  });

  it('refuses a slot key at the end of the file, with no dict after it', () => {
    const plist = DRACULA.replace('<key>Ansi 6 Color</key>', '<key>Ansi 6 Colour</key>').replace('</plist>', '<key>Ansi 6 Color</key>\n\t<dict>');
    expect(refusal(() => fromITerm(plist)).message).toBe('roundel/import: Ansi 6 Color is not in the file');
  });

  it('refuses a Display P3 colour rather than reading it as sRGB', () => {
    const e = refusal(() => fromITerm(withDict('Ansi 2 Color', components('0.3', '0.9', '0.5', '<key>Color Space</key>\n<string>P3</string>'))));
    expect(e.code).toBe('E_IMPORT_SLOT');
    expect(e.message).toBe('roundel/import: Ansi 2 Color is in Display P3, and roundel reads sRGB');
    expect(e.fix).toMatch(/sRGB/);
  });

  it.each([
    ['above 1', components('1.2', '0.3', '0.3'), 'Red'],
    ['below 0', components('1', '-0.1', '0.3'), 'Green'],
    ['empty', components('1', '0.3', ''), 'Blue'],
    ['not a number', components('1', '0.3', 'blue'), 'Blue'],
    ['absent', '<key>Red Component</key><real>1</real><key>Green Component</key><real>0.3</real>', 'Blue'],
  ])('refuses a component %s', (_, body, channel) => {
    const e = refusal(() => fromITerm(withDict('Ansi 1 Color', body)));
    expect(e.code).toBe('E_IMPORT_SLOT');
    expect(e.message).toBe(`roundel/import: Ansi 1 Color has no ${channel} Component between 0 and 1`);
    expect(e.fix).toMatch(/Export/);
  });

  it('refuses a preset that parses and does not read, with the iTerm key named', () => {
    const e = refusal(() => fromITerm(withDict('Ansi 1 Color', components('0.2', '0.2', '0.25'))));
    expect(e.code).toBe('E_IMPORT_CONTRAST');
    expect(e.message).toMatch(/— error \(Ansi 1 Color\) #333340 on #282a36, 1\.\d\d:1/);
  });
});

describe('ImportError', () => {
  it('is an Error with a name, a code and a fix — PluginError’s shape', () => {
    const e = new ImportError('E_IMPORT_FORMAT', 'm', 'f');
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('ImportError');
    expect([e.code, e.message, e.fix, e.theme]).toEqual(['E_IMPORT_FORMAT', 'm', 'f', undefined]);
  });
});
