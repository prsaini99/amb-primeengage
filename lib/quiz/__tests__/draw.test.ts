import { describe, it, expect } from "vitest";
import { drawRandom } from "../draw";

describe("drawRandom", () => {
  it("returns n unique ids from the pool", () => {
    const pool = ["a","b","c","d","e"];
    const out = drawRandom(pool, 3, mulberry(42));
    expect(out).toHaveLength(3);
    expect(new Set(out).size).toBe(3);
    out.forEach((id) => expect(pool).toContain(id));
  });
  it("caps at pool size when n exceeds it", () => {
    expect(drawRandom(["a","b"], 5, mulberry(1))).toHaveLength(2);
  });
  it("is deterministic for a fixed rng", () => {
    expect(drawRandom(["a","b","c","d"], 2, mulberry(7)))
      .toEqual(drawRandom(["a","b","c","d"], 2, mulberry(7)));
  });
});
// seeded PRNG for tests
function mulberry(seed: number) { return () => {
  seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}; }
