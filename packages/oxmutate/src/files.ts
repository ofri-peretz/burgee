/**
 * The files to mutate, from Stryker-style globs (`src/**\/*.ts`, `!src/**\/*.test.ts`, `{a,b}`).
 * No dependency: a glob is translated to one regular expression, and the walk skips the
 * directories a project never mutates.
 */
import { readdirSync } from 'node:fs';
import path from 'node:path';

const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.turbo', '.oxmutate', '.stryker-tmp', 'reports']);

/** Translate one glob (without a leading `!`) into an anchored regular expression. */
export function globToRegExp(glob: string): RegExp {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i] ?? '';
    if (c === '*') {
      if (glob[i + 1] === '*') {
        // `**/` matches zero or more directories; a bare `**` matches anything.
        if (glob[i + 2] === '/') {
          re += '(?:.*/)?';
          i += 2;
        } else {
          re += '.*';
          i += 1;
        }
      } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else if (c === '{') {
      const close = glob.indexOf('}', i);
      re += `(?:${glob.slice(i + 1, close).split(',').map((s) => s.replace(/[.+^$()|[\]\\]/g, '\\$&')).join('|')})`;
      i = close;
    } else re += c.replace(/[.+^$()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

/** Repository-relative paths (forward slashes) of files matching the include and exclude globs. */
export function matchFiles(root: string, patterns: string[]): string[] {
  const include = patterns.filter((p) => !p.startsWith('!')).map(globToRegExp);
  const exclude = patterns.filter((p) => p.startsWith('!')).map((p) => globToRegExp(p.slice(1)));
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const e of readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = dir ? `${dir}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (!SKIP.has(e.name)) walk(rel);
      } else if (include.some((r) => r.test(rel)) && !exclude.some((r) => r.test(rel))) out.push(rel);
    }
  };
  walk('');
  return out.sort();
}
