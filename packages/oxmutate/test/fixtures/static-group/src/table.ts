// Import-time data, read by three test files: every mutant here is static, and each one survives
// the files that do not look at its row.
export const NAMES = ['alpha', 'beta', 'gamma', 'delta'];
// Never read by a test: its mutants survive every file.
export const SPARE = ['one', 'two', 'three'];
