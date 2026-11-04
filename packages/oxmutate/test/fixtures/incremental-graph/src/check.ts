/** What the sum under test must come to. */
export const TARGET = 5;

/** The helper the test asserts through: neither the mutated file nor the test file. */
export const isTarget = (got: number): boolean => got === TARGET;
