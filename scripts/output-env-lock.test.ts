/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — the output-policy variables are read by roundel's policy and by nothing else we wrote.
 *
 * `cli-output-stack` R2 (U2): one policy function decides the output mode, so no other family
 * module may read `NO_COLOR`, `FORCE_COLOR`, `CI` or `CLI_ACCESSIBLE` and come to its own
 * answer. Two surfaces that decide colour separately disagree on the run where it matters —
 * `burgee`'s help once let `FORCE_COLOR` beat `NO_COLOR` while every other surface did not.
 *
 * Scope (D-20261019-output-env-lock-scope): **code burgee owns**. The owners are roundel's two
 * policy subpaths — `roundel/policy` (`outputMode`, `colorLevel`) and `roundel/terminal`
 * (`interactive`), split only because R8 caps `./chalk`'s graph at chalk's own bytes. The
 * drop-ins are allow-listed by file, each naming the incumbent whose own suite grades its read:
 * a drop-in that consulted roundel instead would answer differently from the package it
 * replaces, and the compat grade would say so. `isTTY` is not on the list: it is a fact about a
 * stream, and every writer that hides a cursor or sizes a frame reads it from the stream it owns.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const PACKAGES = resolve(dirname(fileURLToPath(import.meta.url)), '../packages');

/** The variables R2 gives to one policy. */
const NAMES = 'NO_COLOR|FORCE_COLOR|CLI_ACCESSIBLE|CI';

/**
 * A read of one of {@link NAMES} from an environment record: `env['CI']`, `env?.["NO_COLOR"]`,
 * `env.FORCE_COLOR`, `'CI' in rt.env`, or `const { NO_COLOR } = env`. A sentence that mentions
 * `NO_COLOR` in help text, or a fixture that *writes* `{ CI: 'true' }`, is not a read.
 */
const ENV_READ = new RegExp(
  [
    String.raw`\benv\s*(?:\?\.)?\[\s*['"\x60](?:${NAMES})['"\x60]\s*\]`,
    String.raw`\benv\??\.(?:${NAMES})\b`,
    String.raw`['"\x60](?:${NAMES})['"\x60]\s+in\s+[\w.?]*\benv\b`,
    String.raw`\{[^}]*\b(?:${NAMES})\b[^}]*\}\s*=\s*[\w.?]*\benv\b`,
  ].join('|'),
);

/** The two policy subpaths that own the decision. */
const OWNERS = new Set(['roundel/src/policy.ts', 'roundel/src/terminal.ts']);

/** Drop-ins whose incumbent reads the variable itself, and whose graded suite asserts that read. */
const DROP_INS: Record<string, string> = {
  'burgee/src/commander/command.ts': "commander's useColor (NO_COLOR, FORCE_COLOR)",
  'caique/src/clack-core.ts': "@clack/core's isCI and its CI-aware settings",
  'controlroom/src/ink/process.ts': "ink's is-in-ci rule (CI=0 and CI=false read as not CI)",
  'flagstaff/src/ora.ts': "ora's isEnabled default ('CI' in env)",
  'paratext/src/hyperlinks.ts': 'supports-hyperlinks 4.5.0 and the supports-color 10.2.2 half it defers to',
  'roundel/src/picocolors.ts': "picocolors' isColorSupported",
};

/** Published packages only: compat-oracle is private tooling, not a layer. */
function publishedPackages(): string[] {
  return readdirSync(PACKAGES, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((name) => {
      try {
        const manifest = JSON.parse(readFileSync(join(PACKAGES, name, 'package.json'), 'utf-8')) as { private?: boolean };
        return manifest.private !== true;
      } catch {
        return false;
      }
    });
}

function sources(dir: string, out: string[] = []): string[] {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== 'node_modules' && e.name !== 'dist') sources(p, out);
    } else if (/\.tsx?$/.test(e.name) && !/\.(test|spec)\.tsx?$/.test(e.name) && !e.name.endsWith('.d.ts')) {
      out.push(p);
    }
  }
  return out;
}

/** A line with its comment removed; a comment line is empty. `//` inside a URL stays code. */
function code(line: string): string {
  if (/^\s*(\*|\/\*)/.test(line)) return '';
  return line.replace(/(?<![:'"\x60\\])\/\/.*$/, '');
}

/** `pkg/src/file.ts:line` for every read of a policy variable outside the owners and the drop-ins. */
function offenders(): string[] {
  const out: string[] = [];
  for (const pkg of publishedPackages()) {
    for (const file of sources(join(PACKAGES, pkg, 'src'))) {
      const rel = relative(PACKAGES, file).split(sep).join('/');
      if (OWNERS.has(rel) || rel in DROP_INS) continue;
      readFileSync(file, 'utf-8')
        .split(/\r?\n/)
        .forEach((line, i) => {
          if (ENV_READ.test(code(line))) out.push(`${rel}:${String(i + 1)}`);
        });
    }
  }
  return out;
}

describe('output-policy variables (cli-output-stack R2)', () => {
  it('no module burgee owns reads NO_COLOR, FORCE_COLOR, CI or CLI_ACCESSIBLE outside roundel/policy and roundel/terminal', () => {
    expect(offenders(), 'ask roundel/policy (outputMode, colorLevel) or roundel/terminal (interactive) instead').toEqual([]);
  });

  it('every allow-listed file exists and still reads a policy variable, so no entry outlives its reason', () => {
    for (const rel of [...OWNERS, ...Object.keys(DROP_INS)]) {
      const text = readFileSync(join(PACKAGES, rel), 'utf-8');
      expect(text.split(/\r?\n/).some((line) => ENV_READ.test(code(line))), `${rel} no longer reads one; drop its entry`).toBe(true);
    }
  });

  it.each([
    "const off = env['NO_COLOR'] !== undefined;",
    'if (rt.env?.["FORCE_COLOR"]) level = 3;',
    'return process.env.CI === "true";',
    "const ci = 'CI' in rt.env;",
    'const { NO_COLOR, FORCE_COLOR } = runtime.env;',
    "const accessible = host.env[`CLI_ACCESSIBLE`] === '1';",
  ])('catches %j', (line) => {
    expect(ENV_READ.test(code(line))).toBe(true);
  });

  it.each([
    "'help.color': 'always, never or auto (default: auto); NO_COLOR is honoured',",
    "const ENV = { ci: { CI: 'true' }, accessible: { CLI_ACCESSIBLE: '1' } };",
    ' * `NO_COLOR` wins outright, then `FORCE_COLOR`.',
    "const CI_NAME = env['CI_NAME'];",
    "if (env['CIRCLECI']) vendor = 'circle';",
    "return colorLevel({ env, isTTY: { stdout: interactive }, argv }) > 0; // NO_COLOR via env['NO_COLOR']",
  ])('ignores %j', (line) => {
    expect(ENV_READ.test(code(line))).toBe(false);
  });
});
