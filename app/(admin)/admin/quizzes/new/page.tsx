import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { QuizForm } from "@/components/admin/quiz-form";
import { createRound } from "@/app/actions/quizzes";

export const metadata = { title: "New quiz round · Admin" };

export default function NewQuizPage() {
  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/quizzes"
          className="inline-flex items-center gap-1.5 text-[12.5px] text-mute hover:text-navy-900"
        >
          <ArrowLeft size={14} /> Back to quiz rounds
        </Link>
        <h1 className="font-display text-3xl font-semibold text-navy-900 mt-3">
          New quiz round
        </h1>
        <p className="text-[13.5px] text-mute mt-1">
          Create a draft round, add questions, then activate it. Only one round can be active at a time.
        </p>
      </div>

      <div className="rounded-2xl bg-paper-2 ring-1 ring-line p-6 md:p-8 max-w-3xl">
        <QuizForm mode="create" action={createRound} />
      </div>
    </div>
  );
}
