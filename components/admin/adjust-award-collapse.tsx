"use client";

import { useState } from "react";
import { Pencil, X } from "lucide-react";

import { AwardForm } from "./award-form";

/**
 * Collapsed-by-default "Edit award" affordance for the awarded card on the
 * admin submission detail page. Reveals the AwardForm in adjust mode when
 * clicked. The form posts to /api/admin/submissions/[id]/adjust-award which
 * appends an admin_adjustment ledger entry rather than mutating history.
 */
export function AdjustAwardCollapse({
  submissionId,
  currentPoints,
}: {
  submissionId: string;
  currentPoints: number;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-4 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-navy-800 hover:text-amber-500"
      >
        <Pencil size={12} /> Edit award
      </button>
    );
  }

  return (
    <div className="mt-4 pt-4 border-t border-line">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-mute">
          Edit award
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-mute hover:text-navy-900"
          title="Cancel"
        >
          <X size={14} />
        </button>
      </div>
      <AwardForm
        submissionId={submissionId}
        defaultPoints={currentPoints}
        mode="adjust"
      />
    </div>
  );
}
