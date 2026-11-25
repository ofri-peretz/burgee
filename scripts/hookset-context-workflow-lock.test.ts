/**
 * Lock: the reusable hookset-check.yml gates the always-loaded Claude context in every caller.
 *
 * Each repo pins a hookset tag in lefthook.yml and calls this workflow from main, so this step is
 * how `hookset context` reaches CI everywhere. It reads context.ts from the pinned tag, so a repo
 * on a tag before 1.1.0 skips it, and fails the job when the context is over the ceiling. burgee
 * does not call that workflow, so its own ceiling is held here.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { load as loadYaml } from 'js-yaml';
import { describe, expect, it } from 'vitest';

import { checkContext, contextText } from '../packages/hookset/src/context.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

interface Step {
  name?: string;
  if?: string;
  run?: string;
}
const workflow = loadYaml(readFileSync(resolve(ROOT, '.github/workflows/hookset-check.yml'), 'utf8')) as {
  jobs: Record<string, { steps: Step[] }>;
};
const steps = workflow.jobs['hookset']?.steps ?? [];
const names = steps.map((s) => s.name);
const context = steps.find((s) => s.name === 'hookset context');

describe('hookset-check.yml runs hookset context', () => {
  it('runs in the hookset job, after the pinned checkout, even when hookset check failed', () => {
    expect(names.indexOf('hookset context')).toBeGreaterThan(names.indexOf('hookset check'));
    expect(context?.if).toBe("${{ !cancelled() && steps.pin.outcome == 'success' }}");
  });

  it('checks against the pinned context.ts and fails the job over the ceiling', () => {
    expect(context?.run).toContain('.hookset/packages/hookset/src/context.ts');
    expect(context?.run).toContain('context.checkContext(process.cwd())');
    expect(context?.run).toContain('process.exitCode = result.ok ? 0 : 1;');
  });
});

describe("burgee's own always-loaded context", () => {
  it('stays at or under context.tokens in .claude/hookset.json', () => {
    const result = checkContext(ROOT);
    expect(result.ok, contextText(result)).toBe(true);
  });
});
