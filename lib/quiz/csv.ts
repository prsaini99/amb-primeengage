// lib/quiz/csv.ts — CSV parser for quiz questions.

export type ParsedQuestion = {
  question: string;
  options: [string, string, string, string];
  correct_index: number;
  category: string | null;
};

export type CsvParseResult =
  | { ok: true; rows: ParsedQuestion[] }
  | { ok: false; errors: { line: number; message: string }[] };

const EXPECTED_HEADER = "question,option_a,option_b,option_c,option_d,correct,category";

/** Minimal quoted-CSV splitter: handles quoted fields with embedded commas/newlines. */
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let i = 0;
  while (i <= line.length) {
    if (i === line.length) {
      fields.push("");
      break;
    }
    if (line[i] === '"') {
      // quoted field
      let val = "";
      i++; // skip opening quote
      while (i < line.length) {
        if (line[i] === '"') {
          if (line[i + 1] === '"') {
            val += '"';
            i += 2;
          } else {
            i++; // skip closing quote
            break;
          }
        } else {
          val += line[i];
          i++;
        }
      }
      fields.push(val);
      // skip comma
      if (i < line.length && line[i] === ",") i++;
    } else {
      // unquoted field: read until comma
      const start = i;
      while (i < line.length && line[i] !== ",") i++;
      fields.push(line.slice(start, i));
      if (i < line.length) i++; // skip comma
    }
  }
  return fields;
}

function parseCorrect(raw: string): number | null {
  const upper = raw.trim().toUpperCase();
  if (upper === "A") return 0;
  if (upper === "B") return 1;
  if (upper === "C") return 2;
  if (upper === "D") return 3;
  if (upper === "0") return 0;
  if (upper === "1") return 1;
  if (upper === "2") return 2;
  if (upper === "3") return 3;
  return null;
}

export function parseQuestionsCsv(text: string): CsvParseResult {
  // Normalize line endings
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");

  if (lines.length === 0) {
    return { ok: false, errors: [{ line: 1, message: "File is empty." }] };
  }

  // Validate header (line 1)
  const headerLine = lines[0].trim();
  if (headerLine !== EXPECTED_HEADER) {
    return {
      ok: false,
      errors: [{ line: 1, message: `Invalid header. Expected: ${EXPECTED_HEADER}` }],
    };
  }

  const rows: ParsedQuestion[] = [];
  const errors: { line: number; message: string }[] = [];

  for (let i = 1; i < lines.length; i++) {
    const lineNum = i + 1; // 1-based, header = line 1
    const rawLine = lines[i];

    // Skip completely blank trailing lines
    if (rawLine.trim() === "") continue;

    const fields = splitCsvLine(rawLine);

    // We need exactly 7 columns
    const [questionRaw, optA, optB, optC, optD, correctRaw, categoryRaw] = fields;

    const question = (questionRaw ?? "").trim();
    const option_a = (optA ?? "").trim();
    const option_b = (optB ?? "").trim();
    const option_c = (optC ?? "").trim();
    const option_d = (optD ?? "").trim();
    const correctStr = (correctRaw ?? "").trim();
    const categoryStr = (categoryRaw ?? "").trim();

    const lineErrors: string[] = [];

    if (!question) lineErrors.push("Missing question.");
    if (!option_a) lineErrors.push("Missing option_a.");
    if (!option_b) lineErrors.push("Missing option_b.");
    if (!option_c) lineErrors.push("Missing option_c.");
    if (!option_d) lineErrors.push("Missing option_d.");

    const correct_index = parseCorrect(correctStr);
    if (correct_index === null) lineErrors.push("Invalid 'correct' (use A–D or 0–3).");

    if (lineErrors.length > 0) {
      for (const message of lineErrors) {
        errors.push({ line: lineNum, message });
      }
    } else {
      rows.push({
        question,
        options: [option_a, option_b, option_c, option_d],
        correct_index: correct_index!,
        category: categoryStr || null,
      });
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, rows };
}
