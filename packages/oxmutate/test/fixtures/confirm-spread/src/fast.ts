// Nothing reads what these keep, so every mutant survives the warm run and is confirmed afterwards.
let a = 0;
let b = 0;
let c = 0;

export function first(): void {
  a = a + 1;
}

export function second(): void {
  b = b + 2;
}

export function third(): void {
  c = c + 3;
}

export const seen = (): number => a + b + c;
