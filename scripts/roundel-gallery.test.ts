/**
 * Lock — roundel's theme gallery is generated from its scheme files (R11), and says so truly.
 *
 * The page is compared with a fresh render, so a hand edit, a scheme file added without
 * regenerating, or an importer change that moves a colour or a verdict all fail here.
 */
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { PAGE, render, SCHEMES } from './roundel-gallery.js';

const scratch = (...files: string[]): string => {
  const dir = mkdtempSync(join(tmpdir(), 'gallery-'));
  for (const f of files) copyFileSync(join(SCHEMES, f), join(dir, f));
  return dir;
};

describe('the theme gallery', () => {
  it('is exactly what the scheme files render to — run `npx tsx scripts/roundel-gallery.ts`', () => {
    expect(readFileSync(PAGE, 'utf8')).toBe(render());
  });

  it('lists a scheme roundel flies with every colour and its ratio', () => {
    expect(render(scratch('gruvbox-dark-hard.yaml'))).toContain(
      '| `gruvbox-dark-hard.yaml` | Base16 | flies | `#1d2021` | `#fb4934` 4.77:1 | `#fabd2f` 9.67:1 | `#b8bb26` 7.94:1 | `#8ec07c` 7.79:1 | `#d3869b` 5.98:1 |',
    );
  });

  it('lists a refused scheme rather than leaving it out, naming the slot that refused it', () => {
    expect(render(scratch('tomorrow-night.yaml'))).toContain('| `tomorrow-night.yaml` | Base16 | refused — error (base08) below 4.5:1 | `#1d1f21` | `#cc6666` 4.46:1 |');
  });

  it('reads an iTerm2 preset through fromITerm', () => {
    expect(render(scratch('dracula.itermcolors'))).toContain('| `dracula.itermcolors` | iTerm2 | flies | `#282a36` | `#ff5555` 4.53:1 |');
  });

  it('stops on a file it cannot read, rather than dropping a row', () => {
    const dir = scratch();
    writeFileSync(join(dir, 'broken.yaml'), 'scheme: "no slots"\n');
    expect(() => render(dir)).toThrow(/^broken\.yaml: roundel\/import: no base00…base0F keys/);
    const other = scratch();
    writeFileSync(join(other, 'theme.toml'), '');
    expect(() => render(other)).toThrow(/^theme\.toml: not a scheme the gallery reads/);
  });
});
