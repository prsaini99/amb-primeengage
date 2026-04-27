"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, FileUp, Send, X } from "lucide-react";

const MIME_LIMITS: Record<string, number> = {
  "image/jpeg": 5 * 1024 * 1024,
  "image/png":  5 * 1024 * 1024,
  "image/webp": 5 * 1024 * 1024,
  "image/gif":  5 * 1024 * 1024,
  "video/mp4":       50 * 1024 * 1024,
  "video/quicktime": 50 * 1024 * 1024,
  "video/webm":      50 * 1024 * 1024,
  "application/pdf": 10 * 1024 * 1024,
  "application/zip":              50 * 1024 * 1024,
  "application/x-zip-compressed": 50 * 1024 * 1024,
};
const MAX_FILES = 10;

// Add explicit .zip extension to accept — some browsers/OSes don't reliably
// surface ZIP MIME types in the file picker filter, so the extension hint
// keeps .zip files selectable. The runtime check still uses MIME_LIMITS.
const ACCEPT = Object.keys(MIME_LIMITS).join(",") + ",.zip";

type SignedUpload = {
  name: string;
  path: string;
  signedUploadUrl: string;
  token: string;
};

export function SubmissionForm({ activityId }: { activityId: string }) {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function addFiles(picked: FileList | null) {
    if (!picked) return;
    setError(null);
    const accepted: File[] = [];
    for (const f of Array.from(picked)) {
      const cap = MIME_LIMITS[f.type];
      if (cap === undefined) {
        setError(`Unsupported file type: ${f.type || f.name}.`);
        return;
      }
      if (f.size > cap) {
        setError(`${f.name} is too large for ${f.type} (max ${(cap / 1024 / 1024) | 0} MB).`);
        return;
      }
      accepted.push(f);
    }
    const next = [...files, ...accepted];
    if (next.length > MAX_FILES) {
      setError(`Max ${MAX_FILES} files per submission.`);
      return;
    }
    setFiles(next);
  }

  function removeFile(idx: number) {
    setFiles(files.filter((_, i) => i !== idx));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (files.length === 0 && !text.trim()) {
      setError("Add at least one file or some text before submitting.");
      return;
    }

    startTransition(async () => {
      try {
        // 1. Mint signed-upload URLs (only if there are files).
        let uploads: SignedUpload[] = [];
        if (files.length > 0) {
          setProgress("Preparing upload…");
          const signRes = await fetch(
            "/api/dashboard/submissions/sign-upload",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                activity_id: activityId,
                files: files.map((f) => ({
                  name: f.name,
                  type: f.type,
                  size: f.size,
                })),
              }),
            },
          );
          const signJson = (await signRes.json()) as
            | { uploads: SignedUpload[] }
            | { error: string };
          if (!signRes.ok || "error" in signJson) {
            setError("error" in signJson ? signJson.error : `HTTP ${signRes.status}`);
            setProgress(null);
            return;
          }
          uploads = signJson.uploads;

          // 2. PUT each file to its signed URL in parallel.
          setProgress(`Uploading ${files.length} file${files.length === 1 ? "" : "s"}…`);
          const putResults = await Promise.all(
            files.map((file, i) =>
              fetch(uploads[i].signedUploadUrl, {
                method: "PUT",
                headers: { "Content-Type": file.type },
                body: file,
              }),
            ),
          );
          const failed = putResults.findIndex((r) => !r.ok);
          if (failed !== -1) {
            setError(
              `Upload failed for ${files[failed].name} (HTTP ${putResults[failed].status}).`,
            );
            setProgress(null);
            return;
          }
        }

        // 3. Commit the submission.
        setProgress("Saving submission…");
        const commitRes = await fetch("/api/dashboard/submissions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            activity_id: activityId,
            text_content: text.trim() || undefined,
            files: uploads.map((u, i) => ({
              path: u.path,
              type: files[i].type,
              size: files[i].size,
            })),
          }),
        });
        const commitJson = (await commitRes.json()) as
          | { ok: true; submission_id: string }
          | { error: string };
        if (!commitRes.ok || "error" in commitJson) {
          setError("error" in commitJson ? commitJson.error : `HTTP ${commitRes.status}`);
          setProgress(null);
          return;
        }

        setProgress(null);
        router.refresh(); // Re-render the activity detail with submitted state
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setProgress(null);
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <label className="block">
        <span className="text-[12px] font-semibold text-mute uppercase tracking-wide">
          Notes (optional)
        </span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          maxLength={4000}
          disabled={pending}
          placeholder="Anything we should know about your submission?"
          suppressHydrationWarning
          className="w-full mt-2 rounded-xl bg-paper-2 ring-1 ring-line px-4 py-3 text-[14.5px] focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:opacity-50 resize-y"
        />
      </label>

      <div>
        <span className="text-[12px] font-semibold text-mute uppercase tracking-wide">
          Files (up to {MAX_FILES}: image ≤5 MB · video / ZIP ≤50 MB · PDF ≤10 MB)
        </span>
        <label className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-paper-2 ring-1 ring-dashed ring-line-strong px-4 py-6 text-[13.5px] text-mute hover:ring-navy-800/40 cursor-pointer">
          <FileUp size={16} />
          <span>Click to add files</span>
          <input
            type="file"
            multiple
            accept={ACCEPT}
            disabled={pending}
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = ""; // allow re-adding the same file later
            }}
            className="hidden"
            suppressHydrationWarning
          />
        </label>

        {files.length > 0 && (
          <ul className="mt-3 space-y-2">
            {files.map((f, i) => (
              <li
                key={i}
                className="flex items-center gap-3 rounded-lg bg-paper-2 ring-1 ring-line px-3 py-2 text-[13px]"
              >
                <span className="font-mono text-[12.5px] text-mute truncate flex-1">
                  {f.name}
                </span>
                <span className="text-mute text-[12px] whitespace-nowrap">
                  {(f.size / 1024 / 1024).toFixed(2)} MB
                </span>
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  disabled={pending}
                  className="text-mute hover:text-amber-500 disabled:opacity-50"
                  title="Remove"
                >
                  <X size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2.5 text-[13px] text-amber-500 bg-amber-500/10 rounded-xl px-4 py-3 ring-1 ring-amber-500/30">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {progress && !error && (
        <div className="text-[13px] text-cyan-500 bg-cyan-50 rounded-xl px-4 py-3 ring-1 ring-cyan-300/60">
          {progress}
        </div>
      )}

      <div className="pt-2">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center justify-center gap-2 h-12 px-6 text-[14px] font-semibold rounded-full bg-amber-500 hover:bg-amber-400 text-white shadow-soft transition-all disabled:opacity-60"
        >
          <Send size={15} />
          {pending ? "Submitting…" : "Submit"}
        </button>
        <p className="mt-3 text-[12px] text-mute">
          Submissions lock immediately on save — no edits or resubmits.
        </p>
      </div>
    </form>
  );
}
