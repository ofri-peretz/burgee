export const triple = (n: number): number => n * 3;

export const label = (s: string): string => (s.length > 3 ? s.toUpperCase() : `${s}!`);
