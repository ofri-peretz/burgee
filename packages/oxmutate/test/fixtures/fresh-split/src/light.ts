const FACTOR = 3;
const LONG = 3;

export const triple = (n: number): number => n * FACTOR;

export const label = (s: string): string => (s.length > LONG ? s.toUpperCase() : `${s}!`);
