/**
 * `burgee` — the package's own command line.
 *
 * One program, so the name a user types is the name they installed. Subcommands
 * hang off it; `brand` is the first.
 *
 * `burgee brand` — fly your own burgee. Any CLI can have one: give it the two
 * colours it already uses and it gets the same surfaces this project generates
 * for itself — the flag, a favicon master, a social card, an article cover and a
 * nav lockup. Bring your own glyph with --charge and the swallowtail, the
 * reversed field and the sizes still come for free.
 *
 * Built with `defineProgram` and `run`, so this is also the package's own
 * dogfood: it answers --json and --help like anything else built on burgee,
 * which means an agent can drive it without reading this file.
 *
 * The field it derives is reversed and passes through a dark midpoint. Both are
 * deliberate — see `opposedField`. Pass --ground to move the midpoint, or build
 * the stops yourself through `defineBurgee` if you want something else.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { DEFAULT_GROUND, defineBurgee, opposedField, type BurgeeBrand } from './brand.js';
import { auditBurgee, report, type ContrastFinding } from './contrast.js';
import { defineCommand, defineProgram, run } from './execute.js';

interface Options {
  name?: string;
  on?: string;
  'allow-low-contrast'?: boolean;
  lead?: string;
  follow?: string;
  ground?: string;
  charge?: string;
  bordure?: string;
  'bordure-width'?: string;
  out?: string;
  tagline?: string;
}

/** Master size for the standalone flag; rasterisers downsample from here. */
const MASTER = 512;

/** What to do about a failing contrast check, in the words that fix it (E3). */
const CONTRAST_HINT =
  'hint: darken the --ground stop under the charge, or pass --allow-low-contrast';

/** Hairline. Anything heavier stops reading as an edge and starts shouting. */
const DEFAULT_BORDURE_WIDTH = '1.5';

/** Every file the command writes, and what consumes it. */
function surfaces(brand: BurgeeBrand, tagline: string): Array<{ file: string; svg: string }> {
  const burgee = defineBurgee(brand);
  const subtitle = tagline === '' ? {} : { subtitle: tagline };
  return [
    { file: 'flag.svg', svg: burgee.flag(MASTER) },
    { file: 'icon.svg', svg: burgee.favicon() },
    { file: 'og.svg', svg: burgee.og(subtitle) },
    { file: 'cover.svg', svg: burgee.cover(subtitle) },
    { file: 'lockup.svg', svg: burgee.lockup({ theme: 'dark' }) },
    { file: 'lockup-light.svg', svg: burgee.lockup({ theme: 'light' }) },
  ];
}

export const brandCommand = defineCommand({
  name: 'brand',
  description: 'Generate a burgee — flag, favicon, social card, cover and lockup — from two colours',
   
  options: {
    lead: {
      type: 'string',
      required: true,
      description: 'leading colour, hex. Your primary; it leads the charge upper-left',
    },
    follow: {
      type: 'string',
      required: true,
      description: 'following colour, hex. Your secondary; it follows lower-right',
    },
    name: { type: 'string', description: 'brand name, used as the accessible label and card title' },
    ground: {
      type: 'string',
      default: DEFAULT_GROUND,
      description: 'the field’s dark midpoint, which is what keeps the charge legible',
    },
    charge: {
      type: 'string',
      description: 'path to an SVG whose contents replace the bars, drawn in a 0 0 100 100 box',
    },
    bordure: { type: 'string', description: 'outline colour, hex. Omit for no outline' },
    'bordure-width': { type: 'string', default: DEFAULT_BORDURE_WIDTH, description: 'outline width' },
    tagline: { type: 'string', description: 'one line under the name on the card and cover' },
    out: { type: 'string', description: 'directory to write into. Omit to print the flag only' },
    'on': {
      type: 'string',
      description: 'page colour(s) the flag will fly on, comma separated. Checked for contrast',
    },
    'allow-low-contrast': {
      type: 'boolean',
      description: 'emit anyway when a contrast check fails. Says so in the output',
    },
  },
  run: ({ options }) => {
    const lead = options.lead ?? '';
    const follow = options.follow ?? '';
    const colors = { lead, follow };

    const charge =
      options.charge === undefined
        ? {}
        : { charge: readFileSync(options.charge, 'utf8').replace(/<\/?svg[^>]*>/g, '').trim() };
    const bordure =
      options.bordure === undefined
        ? {}
        : {
            bordure: {
              color: options.bordure,
              width: Number(options['bordure-width'] ?? DEFAULT_BORDURE_WIDTH),
            },
          };

    const brand: BurgeeBrand = {
      ...(options.name === undefined ? {} : { name: options.name }),
      mark: colors,
      field: opposedField(colors, options.ground ?? DEFAULT_GROUND),
      ...charge,
      ...bordure,
    };

    // AA is checked before anything is written. A flag whose own bars do not
    // clear 3:1 against its own field is broken at every size, and finding that
    // out after six files have landed helps nobody.
    const grounds = (options.on ?? '')
      .split(',')
      .map((g) => g.trim())
      .filter((g) => g !== '');
    const findings: ContrastFinding[] = auditBurgee(brand, grounds);
    const failed = findings.filter((f) => !f.passes);
    if (failed.length > 0 && options['allow-low-contrast'] !== true) {
      throw new Error(`contrast below WCAG AA:\n${report(failed)}\n${CONTRAST_HINT}`);
    }

    const written = surfaces(brand, options.tagline ?? '');
    const contrast = findings.map((f) => ({ what: f.what, ratio: f.ratio, passes: f.passes }));
    if (options.out === undefined) {
      return { flag: defineBurgee(brand).flag(MASTER), files: [], contrast };
    }

    mkdirSync(options.out, { recursive: true });
    for (const s of written) writeFileSync(join(options.out, s.file), `${s.svg}\n`);
    return { out: options.out, files: written.map((s) => s.file), contrast };
  },
});

export const program = defineProgram({
  name: 'burgee',
  description: 'The agent-native CLI framework, and the tools that come with it',
  commands: [brandCommand],
});

run(program);
