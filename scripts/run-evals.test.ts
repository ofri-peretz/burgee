import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { brokenLinks, grade, missingScripts, billingFor, unknownFloorIds } from './run-evals';

/** A throwaway repo root with one doc, so each checker is exercised on a known tree. */
function repo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'evals-'));
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(join(root, rel, '..'), { recursive: true });
    writeFileSync(join(root, rel), body);
  }
  return root;
}

describe('layer 1 — links', () => {
  it('reports a relative link to nothing, and one that escapes the repo', () => {
    const root = repo({ 'docs/a.md': '[x](./missing.md) [y](../../outside.md) [ok](./a.md)' });
    expect(brokenLinks(['docs/a.md'], root)).toEqual([
      'docs/a.md → ./missing.md',
      'docs/a.md → ../../outside.md (outside the repository — dangles in a clone)',
    ]);
  });

  it('ignores links inside code, anchors and URLs', () => {
    const root = repo({ 'docs/a.md': '`[x](./nope.md)` [h](#top) [u](https://x.y/z)\n```\n[c](./nope.md)\n```' });
    expect(brokenLinks(['docs/a.md'], root)).toEqual([]);
  });
});

describe('layer 1 — scripts', () => {
  it('reports script files and npm scripts that do not exist', () => {
    const root = repo({
      'package.json': JSON.stringify({ scripts: { test: 'x' } }),
      'scripts/real.ts': '',
      'docs/a.md': 'run scripts/real.ts then scripts/gone.ts, or npm run test, or npm run gone',
    });
    expect(missingScripts(['docs/a.md'], root)).toEqual(['docs/a.md → scripts/gone.ts', 'docs/a.md → npm run gone']);
  });
});

describe('layer 1 — floor ids', () => {
  it('reports an id a child cites that the umbrella does not define', () => {
    const root = repo({
      'docs/intents/agent-native-cli-layer/design.md': '| F1 | x | R |\n| K5 | y | lock |',
      'docs/intents/child/intent.md': 'needs F1 and K5 and Z9 and F99',
    });
    expect(unknownFloorIds(root)).toEqual(['docs/intents/child/intent.md → F99']);
  });

  it('is clean on this repository', () => {
    expect(unknownFloorIds()).toEqual([]);
  });
});

describe('layer 2 — grading and billing', () => {
  it('grades contains / omits case-insensitively', () => {
    expect(grade('Hello World', [{ check: 'output-contains', value: 'hello' }]).ok).toBe(true);
    expect(grade('Hello World', [{ check: 'output-omits', value: 'world' }]).ok).toBe(false);
  });

  it('prefers the subscription token and warns when both are set', () => {
    expect(billingFor({}).billing).toBe('none');
    expect(billingFor({ CLAUDE_CODE_OAUTH_TOKEN: 't' }).billing).toBe('subscription');
    expect(billingFor({ CLAUDE_CODE_OAUTH_TOKEN: 't', ANTHROPIC_API_KEY: 'k' })).toEqual({ billing: 'console', bothSet: true, hasCredential: true });
    expect(billingFor({ ANTHROPIC_API_KEY: '' }).billing).toBe('none');
  });
});
