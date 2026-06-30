// lib/quiz/draw.ts — Fisher–Yates partial shuffle, optional injected rng.
export function drawRandom(ids: string[], n: number, rand: () => number = Math.random): string[] {
  const a = ids.slice();
  const k = Math.min(n, a.length);
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor(rand() * (a.length - i));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, k);
}
