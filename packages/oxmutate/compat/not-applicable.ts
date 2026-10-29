/**
 * Stryker's mutator specs that test Stryker's internals, not the mutants it makes. Skipped by
 * their exact name (the vendored specs are never edited), each with the reason it cannot grade
 * a drop-in. Anything not listed here is graded.
 */
export const NOT_APPLICABLE: Readonly<Record<string, string>> = {
  'should only keep scopes with exactly one mutant':
    "Calls the mutator's private `filter()` with Stryker's own `Mutable` objects. oxmutate applies the same rule (keep a CallExpression mutant only when it is its scope's sole one) inside the native core, which has no such function to call.",
  'should mutate a template root call expression into void 0': 'Svelte template context (`isExpressionContext: true`): oxmutate instruments JavaScript and TypeScript files, not Svelte templates.',
  'should not mutate a template root super call expression': 'Svelte template context (`isExpressionContext: true`), as above.',
  "should not crash if a regex couldn't be parsed":
    "Asserts the exact `console.error` text Stryker's weapon-regex binding logs. oxmutate's regex mutator is native and logs nothing; that it makes no mutant for an unparsable pattern is graded by every other Regex case.",
};
