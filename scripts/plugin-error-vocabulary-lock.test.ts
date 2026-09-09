/**
 * Plugin error vocabulary lock — `plugin-contract` R8.
 *
 * R8 says the family has **one error vocabulary**: a code means the same thing and carries
 * the same `fix` shape in every layer, so an author who debugged against one package has
 * learned all of them. That was a sentence in a design and nothing else. Until 2026-09-09
 * `flagstaff check` printed `E_NO_CONTRIBUTION` and `E_COMPONENT_THREW` as bare string
 * literals in `cli.ts`, outside `PluginErrorCode` in `plugin.ts` — so a second host could
 * spell either one its own way and no check in the repo would have noticed. A vocabulary
 * that anything can add to inline is not a vocabulary.
 *
 * Three things are asserted, and the host list is derived from the tree rather than written
 * here — a package hosts plugins when `src/plugin.ts` exists, the same marker
 * `plugin-schema-lock.test.ts` uses — so a new host is covered the moment it is created:
 *
 *   1. every host declares a non-empty `PluginErrorCode`, so this lock cannot pass by
 *      asserting nothing against a host whose union it failed to find;
 *   2. every `'E_…'` literal a host *ships* is a member of that host's own union — this is
 *      the one that was red before the fix, naming `cli.ts` and the code;
 *   3. every host's union is a subset of the vocabulary home's, so a code invented
 *      downstream has to be added where the contract lives instead of forking it.
 *
 * **Why this reads source text rather than importing a `const` array.** R3 forbids one layer
 * importing another: roundel declares its own `PluginErrorCode` structurally and must keep
 * doing so. A runtime list could therefore never be shared across the family, which is the
 * only place R8's claim bites — so it would cost bytes on `./spinner` (82 B of headroom) and
 * buy nothing. The union stays a type, and the lock reads the declaration that *is* the
 * single source. `refuse()` in `cli.ts` is typed `PluginErrorCode` besides, so the
 * compiler catches the same mistake on the one path that produces most of them.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PACKAGES = join(ROOT, 'packages');

/**
 * Where the contract lives. `plugin-contract`'s design names flagstaff the source of
 * `schema.json` — "the package that most exercises it" — and the vocabulary is the same
 * contract in the same place. Naming it is the point: adding `E_NO_WIDGET_PROJECTION` to
 * caique alone should fail here, and be fixed by declaring it in flagstaff too.
 */
const VOCABULARY_HOME = 'flagstaff';

/** A refusal code as it appears in shipped source: quoted, so `HIDE_CURSOR` is not one. */
const CODE = /'(E_[A-Z_]+)'/g;

/** The union declaration, however it is wrapped — everything up to the terminating `;`. */
const UNION = /export type PluginErrorCode\s*=([^;]*);/;

interface Host {
  name: string;
  declared: string[];
  /** Every code the package ships, with the file and line that writes it. */
  used: { code: string; where: string }[];
}

/** Every `.ts` under a host's `src/`, excluding suites: a test may name a code on purpose. */
function sources(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.ts') && !e.name.endsWith('.test.ts'))
    .map((e) => join(e.parentPath, e.name));
}

function hosts(): Host[] {
  return readdirSync(PACKAGES, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(PACKAGES, e.name, 'src/plugin.ts')))
    .map((e) => {
      const src = join(PACKAGES, e.name, 'src');
      const union = UNION.exec(readFileSync(join(src, 'plugin.ts'), 'utf8'));
      const used: Host['used'] = [];
      for (const file of sources(src)) {
        for (const [i, line] of readFileSync(file, 'utf8').split('\n').entries()) {
          for (const [, code = ''] of line.matchAll(CODE)) used.push({ code, where: `${relative(ROOT, file)}:${i + 1}` });
        }
      }
      return { name: e.name, declared: [...(union?.[1] ?? '').matchAll(CODE)].map(([, c = '']) => c), used };
    });
}

const found = hosts();
const home = found.find((h) => h.name === VOCABULARY_HOME);

describe('the plugin error vocabulary', () => {
  it(`is hosted by ${VOCABULARY_HOME}, the package the contract is authored in`, () => {
    expect(found.map((h) => h.name), 'no plugin host named the vocabulary home — this lock would assert nothing').toContain(VOCABULARY_HOME);
  });

  it.each(found)('$name: declares a non-empty PluginErrorCode', (host) => {
    expect(host.declared, `${host.name}/src/plugin.ts has no \`export type PluginErrorCode = …\` this lock can read`).not.toHaveLength(0);
  });

  /**
   * The one that was red. A refusal printed from a literal rather than the union is a code
   * the family never agreed to, and the failure names the file, the line and the code — so
   * the fix ("declare it in plugin.ts") is readable from the output alone.
   */
  it.each(found)('$name: every code it ships is a member of its own union', (host) => {
    const stray = host.used.filter((u) => !host.declared.includes(u.code)).map((u) => `${u.where} → ${u.code}`);
    expect(stray, `not in ${host.name}'s PluginErrorCode; declare it there rather than inline, or this is a code the family never agreed to`).toEqual([]);
  });

  it.each(found)("$name: uses no code the vocabulary home does not know", (host) => {
    const outside = host.declared.filter((code) => !(home?.declared ?? []).includes(code));
    expect(outside, `declared in ${host.name} but not in ${VOCABULARY_HOME} — add it there too, so one author's fix reads the same in every layer (R8)`).toEqual([]);
  });
});
