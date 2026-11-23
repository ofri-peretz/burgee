/**
 * ESLint's own RuleTester, wired to vitest: it calls `describe` / `it` from wherever it is told,
 * and these are vitest's. Test scaffolding: `__fixtures__` is outside coverage and the build.
 */
import { RuleTester } from 'eslint';
import { describe, it } from 'vitest';

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

export const ruleTester = new RuleTester({ languageOptions: { ecmaVersion: 2022, sourceType: 'module' } });
