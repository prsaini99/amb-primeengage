import { describe, it, expect } from "vitest";
import { parseQuestionsCsv } from "../csv";

const header = "question,option_a,option_b,option_c,option_d,correct,category";
describe("parseQuestionsCsv", () => {
  it("parses a valid row with letter answer", () => {
    const r = parseQuestionsCsv(`${header}\nCapital of France?,Paris,London,Rome,Berlin,A,GK`);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.rows[0]).toEqual({
      question: "Capital of France?", options: ["Paris","London","Rome","Berlin"],
      correct_index: 0, category: "GK",
    });
  });
  it("accepts numeric correct and quoted fields with commas", () => {
    const r = parseQuestionsCsv(`${header}\n"a, b?",w,x,y,z,2,`);
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.rows[0].question).toBe("a, b?"); expect(r.rows[0].correct_index).toBe(2); expect(r.rows[0].category).toBeNull(); }
  });
  it("reports errors with line numbers for bad correct values and missing fields", () => {
    const r = parseQuestionsCsv(`${header}\nq,a,b,c,d,Z,\n,a,b,c,d,A,`);
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.errors).toHaveLength(2); expect(r.errors[0].line).toBe(2); }
  });
  it("rejects a missing/invalid header", () => {
    expect(parseQuestionsCsv("wrong,header\n1,2").ok).toBe(false);
  });
});
