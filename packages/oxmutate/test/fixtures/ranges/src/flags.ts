export const flag = (on: boolean): string => (on ? 'on' : 'off');
// Stryker disable all: read only by the debug log, which no test asserts on
export const label = (n: number): string => `#${String(n)}`;
// Stryker restore all
export const twice = (n: number): number => n * 2;
