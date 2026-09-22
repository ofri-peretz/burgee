/**
 * Lock — a fixture this suite spawns cannot outlive the suite.
 *
 * `matrix.test.ts` runs two children that are pinned open by a `setInterval`, and one of them
 * ignores `SIGTERM` on purpose: it is the control case for R2, the whole reason the deadline
 * has a second rung. The second rung is a timer in the **parent**, so a parent that dies first
 * never fires it — and when a hook in that file timed out, vitest tore the worker down and left
 * the child spinning. It was still running hours later, its temp directory already deleted out
 * from under it, found with `pgrep -fl stubborn`.
 *
 * That leak pays for itself in the wrong direction: one timed-out hook leaves a process that
 * makes the next timeout likelier, which is why the suite read as merely "load-sensitive"
 * (D-091) and degraded over a long session instead of flaking at random.
 *
 * So every long-lived fixture carries its own limit, and this file refuses one that does not.
 * It reads the fixture sources out of `matrix.test.ts` rather than trusting a comment, which is
 * what makes it fail on the unfixed file: delete either `${SELF_LIMIT}` and this goes red.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const MATRIX = readFileSync(fileURLToPath(new URL('./matrix.test.ts', import.meta.url)), 'utf8');

/** Every `fixture('name', \`…\`)` call in the matrix suite, as name → body. */
function fixtures(source: string): Map<string, string> {
  const found = new Map<string, string>();
  // Three quote styles, because the suite uses all three: a backtick body for the multi-line
  // fixtures, and single or double quotes for the one-liners. Matching only backticks would
  // have found two fixtures, passed, and checked nothing about the other three.
  for (const match of source.matchAll(/fixture\(\s*'([^']+)',\s*(`[\s\S]*?`|'[^']*'|"[^"]*")\s*,?\s*\)/g)) {
    found.set(match[1] ?? '', match[2] ?? '');
  }
  return found;
}

/** A fixture nothing can end from outside: it installs a timer that keeps the loop alive. */
const longLived = (body: string): boolean => body.includes('setInterval');

describe('a spawned fixture cannot outlive the suite', () => {
  const found = fixtures(MATRIX);

  it('finds the fixtures at all, so a rename cannot make this gate vacuous', () => {
    expect([...found.keys()], 'matrix.test.ts declares fixtures this lock could not parse').toContain('stubborn');
    expect(found.size).toBeGreaterThan(4);
  });

  it.each([...found].filter(([, body]) => longLived(body)))('%s bounds its own lifetime', (_name, body) => {
    expect(
      body.includes('SELF_LIMIT') || /setTimeout\([^)]*process\.exit/.test(body),
      'this fixture is pinned open by a setInterval and nothing inside it ever exits. The deadline that ends ' +
        'it lives in the parent, so a parent that is killed first orphans it forever — which is exactly what ' +
        'happened. Give it the self-limit.',
    ).toBe(true);
  });
});
