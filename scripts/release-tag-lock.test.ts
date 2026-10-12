// A release's tag must point at the commit that built it. `git push origin "$tag"` is allowed to
// fail; `gh release create` then makes the tag itself — from `--target`, which defaults to the
// default branch's head. A merge that lands mid-job would put `name@version` on code that was
// never published. Found by `.sdlc/models/release-tag.qnt`; eslint's release.yml already pins it.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const release = readFileSync(join(import.meta.dirname, '..', '.github', 'workflows', 'release.yml'), 'utf8');
const creates = release.split('\n').filter((line) => !line.trim().startsWith('#') && line.includes('gh release create'));

describe('release.yml tags the commit it built', () => {
  it('creates releases', () => {
    expect(creates.length).toBeGreaterThan(0);
  });

  it('pins every `gh release create` to the built commit', () => {
    for (const line of creates) expect(line).toContain('--target "$(git rev-parse HEAD)"');
  });
});
