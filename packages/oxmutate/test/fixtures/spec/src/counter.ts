export function makeCounter(): { inc(): void; dec(): void; value(): number } {
  let n = 0;
  return {
    inc(): void {
      n = n + 1;
    },
    dec(): void {
      if (n > 0) n = n - 1;
    },
    value: (): number => n,
  };
}
