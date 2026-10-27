export type Mode = 'fast' | 'safe';

// A string-literal mutant here survives the weak test below but cannot compile: `""` is no Mode.
export function mode(fast: boolean): Mode {
  return fast ? 'fast' : 'safe';
}
