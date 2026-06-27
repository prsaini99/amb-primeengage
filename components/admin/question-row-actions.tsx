"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";

import type { QuestionFormResult } from "@/app/actions/quizzes";

type Props = {
  questionId: string;
  deleteAction: (questionId: string) => Promise<QuestionFormResult>;
  onEditClick: () => void;
};

/**
 * Inline Edit / Delete buttons for a question row.
 * The parent (QuestionRow) controls the edit-expansion state.
 */
export function QuestionRowActions({
  questionId,
  deleteAction,
  onEditClick,
}: Props) {
  const router = useRouter();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, startDeleteTransition] = useTransition();

  function handleDelete() {
    if (!confirm("Delete this question? This cannot be undone.")) return;
    setDeleteError(null);
    startDeleteTransition(async () => {
      const result = await deleteAction(questionId);
      if (!result.ok) {
        setDeleteError(result.error);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <>
      {deleteError && (
        <span className="text-[12px] text-red-600 block mb-1">{deleteError}</span>
      )}
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onEditClick}
          className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-navy-800 hover:text-amber-500"
        >
          <Pencil size={12} /> Edit
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={isDeleting}
          className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-red-500 hover:text-red-700 disabled:opacity-50"
        >
          <Trash2 size={12} /> {isDeleting ? "Deleting…" : "Delete"}
        </button>
      </div>
    </>
  );
}
