import { describe, expect, it } from 'vitest';

import { readersOf } from './root-suite-changed.mjs';

describe('root-suite-changed', () => {
  const tests = {
    'scripts/a-lock.test.ts': "readFileSync(join(ROOT, 'lefthook.yml'))",
    'scripts/b-lock.test.ts': "join(ROOT, '.github', 'workflows', 'ci.yml')",
    'scripts/c.test.ts': "import { x } from './c.js'",
  };

  it('picks the locks that read a changed config file as text, by name', () => {
    expect(readersOf(['lefthook.yml'], tests)).toEqual(['scripts/a-lock.test.ts']);
    expect(readersOf(['.github/workflows/ci.yml', 'lefthook.yml'], tests)).toEqual(['scripts/a-lock.test.ts', 'scripts/b-lock.test.ts']);
  });

  it('runs the locks that read built declarations when a package source changes', () => {
    const withDts = { ...tests, 'scripts/api-reference-lock.test.ts': "readFileSync(join(pkg, 'dist/index.d.ts'))" };
    expect(readersOf(['packages/hookset/src/core.ts'], withDts)).toEqual(['scripts/api-reference-lock.test.ts']);
    expect(readersOf(['packages/hookset/src/core.test.ts'], withDts)).toEqual([]);
  });

  it('leaves code to --changed, which follows its imports', () => {
    expect(readersOf(['scripts/c.ts', 'packages/x/src/y.tsx'], tests)).toEqual([]);
  });
});
