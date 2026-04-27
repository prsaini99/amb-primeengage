import { requireProfileForApi } from "@/lib/auth/require-profile";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/chat/messages/read
 * Body: { from: string } — the otherProfileId whose unread messages to me
 *                          should be marked read.
 *
 * Marks ALL messages from `from` to the caller with read_at IS NULL as
 * read_at = NOW(). Idempotent (already-read messages aren't re-touched
 * because of the WHERE clause).
 */
export async function POST(req: Request) {
  try {
    const gate = await requireProfileForApi();
    if (!gate.ok) return gate.response;

    let body: { from?: string };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return Response.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const from = body.from?.trim();
    if (!from) {
      return Response.json({ error: "`from` is required." }, { status: 400 });
    }

    const sb = createAdminClient();
    const { error, count } = await sb
      .from("amb_chat_messages")
      .update({ read_at: new Date().toISOString() }, { count: "exact" })
      .eq("sender_id", from)
      .eq("receiver_id", gate.ctx.profileId)
      .is("read_at", null);

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true, marked: count ?? 0 });
  } catch (err) {
    console.error("[chat/read] uncaught:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
