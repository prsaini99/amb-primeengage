import { describe, it, expect } from "vitest";
import { scoreAttempt } from "../scoring";

const keys = { q1: 0, q2: 1, q3: 2, q4: 3 };
describe("scoreAttempt", () => {
  it("awards points per correct, no negative marking", () => {
    const r = scoreAttempt(["q1","q2","q3","q4"], { q1: 0, q2: 1, q3: 0, q4: null }, keys, 10);
    expect(r).toEqual({ score: 20, correctCount: 2, wrongCount: 1, unansweredCount: 1 });
  });
  it("treats missing answers as unanswered", () => {
    const r = scoreAttempt(["q1","q2"], {}, keys, 10);
    expect(r).toEqual({ score: 0, correctCount: 0, wrongCount: 0, unansweredCount: 2 });
  });
  it("ignores answers to non-assigned questions", () => {
    const r = scoreAttempt(["q1"], { q1: 0, q2: 1 }, keys, 10);
    expect(r.score).toBe(10);
    expect(r.correctCount + r.wrongCount + r.unansweredCount).toBe(1);
  });
});
