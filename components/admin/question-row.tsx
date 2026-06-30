"use client";

import { useState } from "react";

import { Badge } from "@/components/admin/table";
import { QuestionForm } from "@/components/admin/question-form";
import { QuestionRowActions } from "@/components/admin/question-row-actions";
import type { QuestionFormResult } from "@/app/actions/quizzes";

const CORRECT_LABEL = ["A", "B", "C", "D"] as const;

type QuestionData = {
  id: string;
  question: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_index: number;
  category: string | null;
};

type Props = {
  question: QuestionData;
  index: number;
  updateAction: (
    questionId: string,
    prev: QuestionFormResult | null,
    fd: FormData,
  ) => Promise<QuestionFormResult>;
  deleteAction: (questionId: string) => Promise<QuestionFormResult>;
};

/**
 * Renders a question table row with optional inline edit expansion.
 * Managing edit state here allows the expanded form row to span all columns.
 */
export function QuestionRow({ question, index, updateAction, deleteAction }: Props) {
  const [editing, setEditing] = useState(false);

  // Bind question id for useActionState in QuestionForm.
  const boundUpdateAction = updateAction.bind(null, question.id);

  return (
    <>
      {/* Display row */}
      <tr className="hover:bg-paper/60">
        <td className="px-4 py-3 border-b border-line text-navy-900 align-top text-mute font-mono text-[12px]">
          {index + 1}
        </td>
        <td className="px-4 py-3 border-b border-line text-navy-900 align-top max-w-xs">
          <span className="line-clamp-2 text-[13.5px]">{question.question}</span>
        </td>
        <td className="px-4 py-3 border-b border-line text-navy-900 align-top">
          {question.category ? (
            <span className="text-[12.5px] text-mute">{question.category}</span>
          ) : (
            <span className="text-[12px] text-mute/40">—</span>
          )}
        </td>
        <td className="px-4 py-3 border-b border-line text-navy-900 align-top text-[12.5px] max-w-[120px]">
          <span className="line-clamp-2">{question.option_a}</span>
        </td>
        <td className="px-4 py-3 border-b border-line text-navy-900 align-top text-[12.5px] max-w-[120px]">
          <span className="line-clamp-2">{question.option_b}</span>
        </td>
        <td className="px-4 py-3 border-b border-line text-navy-900 align-top text-[12.5px] max-w-[120px]">
          <span className="line-clamp-2">{question.option_c}</span>
        </td>
        <td className="px-4 py-3 border-b border-line text-navy-900 align-top text-[12.5px] max-w-[120px]">
          <span className="line-clamp-2">{question.option_d}</span>
        </td>
        <td className="px-4 py-3 border-b border-line text-navy-900 align-top">
          <Badge tone="success">
            {CORRECT_LABEL[question.correct_index as 0 | 1 | 2 | 3]}
          </Badge>
        </td>
        <td className="px-4 py-3 border-b border-line text-navy-900 align-top text-right whitespace-nowrap">
          <QuestionRowActions
            questionId={question.id}
            deleteAction={deleteAction}
            onEditClick={() => setEditing((v) => !v)}
          />
        </td>
      </tr>

      {/* Inline edit row — spans all columns */}
      {editing && (
        <tr>
          <td
            colSpan={9}
            className="px-6 py-5 border-b border-line bg-paper/60"
          >
            <div className="max-w-2xl">
              <p className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-mute mb-4">
                Edit question
              </p>
              <QuestionForm
                mode="edit"
                action={boundUpdateAction}
                initial={{
                  question: question.question,
                  option_a: question.option_a,
                  option_b: question.option_b,
                  option_c: question.option_c,
                  option_d: question.option_d,
                  correct_index: question.correct_index,
                  category: question.category,
                }}
                onCancel={() => setEditing(false)}
              />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
