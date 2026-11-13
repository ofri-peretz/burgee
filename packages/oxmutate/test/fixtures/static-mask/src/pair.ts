// Two import-time values that must match. Emptying either one alone breaks `matched`; emptying
// both at once leaves it true. That is the pair a group of static mutants can hide.
const LEFT = 'x';
const RIGHT = 'x';

export function matched(): boolean {
  return LEFT === RIGHT;
}

export function shout(word: string): string {
  return word.toUpperCase();
}

export function twice(word: string): string {
  return word + word;
}
