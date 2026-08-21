export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  const cur = new Array<number>(n + 1);
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(cur[j - 1]! + 1, prev[j]! + 1, prev[j - 1]! + cost);
    }
    prev = [...cur];
  }
  return prev[n]!;
}

/** Closest candidate within an edit-distance budget, for did-you-mean hints. */
export function suggestClosest(input: string, candidates: Iterable<string>): string | undefined {
  const budget = Math.max(2, Math.floor(input.length / 4));
  let best: string | undefined;
  let bestDist = budget + 1;
  for (const c of candidates) {
    if (Math.abs(c.length - input.length) >= bestDist) continue;
    const d = levenshtein(input, c);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}
