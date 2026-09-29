const maxDistance = 3;

/** Optimal string alignment distance (Damerau–Levenshtein, no substring edited twice). */
function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > maxDistance) return Math.max(a.length, b.length);
  const d: number[][] = [];
  for (let i = 0; i <= a.length; i++) d[i] = [i];
  for (let j = 0; j <= b.length; j++) (d[0] ??= [])[j] = j;
  // Every cell read below is filled before it is read: row 0 and column 0 above, and each
  // other cell by an earlier step of these loops (j outer, i inner, both ascending).
  for (let j = 1; j <= b.length; j++) {
    for (let i = 1; i <= a.length; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const row = d[i] as number[];
      const prev = d[i - 1] as number[];
      row[j] = Math.min((prev[j] as number) + 1, (row[j - 1] as number) + 1, (prev[j - 1] as number) + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        row[j] = Math.min(row[j] as number, ((d[i - 2] as number[])[j - 2] as number) + 1);
      }
    }
  }
  return (d[a.length] as number[])[b.length] as number;
}

/** Close matches, restricted to the same number of edits, as `\n(Did you mean …?)`. */
export function suggestSimilar(word: string, candidates: string[] | undefined): string {
  if (!candidates || candidates.length === 0) return '';
  candidates = Array.from(new Set(candidates));

  const searchingOptions = word.startsWith('--');
  if (searchingOptions) {
    word = word.slice(2);
    candidates = candidates.map((candidate) => candidate.slice(2));
  }

  let similar: string[] = [];
  let bestDistance = maxDistance;
  const minSimilarity = 0.4;
  for (const candidate of candidates) {
    if (candidate.length <= 1) continue; // no one character guesses
    const distance = editDistance(word, candidate);
    const length = Math.max(word.length, candidate.length);
    const similarity = (length - distance) / length;
    if (similarity > minSimilarity) {
      if (distance < bestDistance) {
        bestDistance = distance;
        similar = [candidate];
      } else if (distance === bestDistance) {
        similar.push(candidate);
      }
    }
  }

  similar.sort((a, b) => a.localeCompare(b));
  if (searchingOptions) similar = similar.map((candidate) => `--${candidate}`);
  if (similar.length > 1) return `\n(Did you mean one of ${similar.join(', ')}?)`;
  if (similar.length === 1) return `\n(Did you mean ${similar[0]}?)`;
  return '';
}
