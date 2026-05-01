import { requireProfileForApi } from "@/lib/auth/require-profile";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_BODY_CHARS = 4000;
const MAX_PAGE_SIZE = 200;

/**
 * GET /api/chat/messages?with=<otherProfileId>&after=<isoTimestamp>
 *
 * Returns messages between the caller and `with`, optionally only those
 * created strictly after `after`. Used both for initial fetch (no `after`)
 * and for the polling tail (`after = lastSeenCreatedAt`).
 */
export async function GET(req: Request) {
  try {
    const gate = await requireProfileForApi();
    if (!gate.ok) return gate.response;

    const url = new URL(req.url);
    const other = url.searchParams.get("with");
    const after = url.searchParams.get("after");

    if (!other) {
      return Response.json({ error: "`with` query param is required." }, { status: 400 });
    }
    if (other === gate.ctx.profileId) {
      return Response.json({ error: "Cannot chat with yourself." }, { status: 400 });
    }

    const sb = createAdminClient();

    // Validate the other party + enforce the "ambassador only chats with
    // admin, admin only chats with ambassador" rule before exposing data.
    const allowed = await isPairingAllowed(sb, gate.ctx.role, other);
    if (!allowed.ok) return Response.json({ error: allowed.error }, { status: allowed.status });

    let q = sb
      .from("amb_chat_messages")
      .select("id, sender_id, receiver_id, body, read_at, created_at")
      .or(
        `and(sender_id.eq.${gate.ctx.profileId},receiver_id.eq.${other}),and(sender_id.eq.${other},receiver_id.eq.${gate.ctx.profileId})`,
      )
      .order("created_at", { ascending: true })
      .limit(MAX_PAGE_SIZE);

    if (after) q = q.gt("created_at", after);

    const { data, error } = await q;
    if (error) return Response.json({ error: error.message }, { status: 500 });

    return Response.json({ messages: data ?? [] });
  } catch (err) {
    console.error("[chat:GET] uncaught:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

/**
 * POST /api/chat/messages
 * Body: { receiver_id: string, body: string }
 *
 * Sender derived from the session. Receiver-role validated against caller-
 * role. Ambassador-to-ambassador and admin-to-admin both rejected.
 */
export async function POST(req: Request) {
  try {
    const gate = await requireProfileForApi();
    if (!gate.ok) return gate.response;

    let body: { receiver_id?: string; body?: string };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return Response.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const receiverId = body.receiver_id?.trim();
    const text = (body.body ?? "").trim();

    if (!receiverId) {
      return Response.json({ error: "receiver_id is required." }, { status: 400 });
    }
    if (receiverId === gate.ctx.profileId) {
      return Response.json({ error: "Cannot send to yourself." }, { status: 400 });
    }
    if (!text) {
      return Response.json({ error: "Message body is empty." }, { status: 400 });
    }
    if (text.length > MAX_BODY_CHARS) {
      return Response.json(
        { error: `Message is too long (max ${MAX_BODY_CHARS} chars).` },
        { status: 400 },
      );
    }

    const sb = createAdminClient();

    const allowed = await isPairingAllowed(sb, gate.ctx.role, receiverId);
    if (!allowed.ok) return Response.json({ error: allowed.error }, { status: allowed.status });

    const { data: inserted, error } = await sb
      .from("amb_chat_messages")
      .insert({
        sender_id: gate.ctx.profileId,
        receiver_id: receiverId,
        body: text,
      })
      .select("id, sender_id, receiver_id, body, read_at, created_at")
      .single();

    if (error || !inserted) {
      return Response.json({ error: error?.message ?? "Send failed." }, { status: 500 });
    }
    return Response.json({ message: inserted });
  } catch (err) {
    console.error("[chat:POST] uncaught:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

/**
 * Validates the "admin <-> ambassador, never same-role" pairing rule.
 * Returns ok:true if the pairing is allowed, otherwise an error to surface.
 */
async function isPairingAllowed(
  sb: ReturnType<typeof createAdminClient>,
  callerRole: "admin" | "ambassador",
  otherProfileId: string,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const { data: other } = await sb
    .from("amb_profiles")
    .select("role, status")
    .eq("id", otherProfileId)
    .maybeSingle();
  if (!other) {
    return { ok: false, error: "Other party not found.", status: 404 };
  }
  if (callerRole === "ambassador" && other.role !== "admin") {
    return { ok: false, error: "Yuvaah Club members can only chat with the admin.", status: 403 };
  }
  if (callerRole === "admin" && other.role !== "ambassador") {
    return { ok: false, error: "Admin can only chat with Yuvaah Club members.", status: 403 };
  }
  if (callerRole === "admin" && other.status !== "approved") {
    return { ok: false, error: "Yuvaah Club member is not active.", status: 403 };
  }
  return { ok: true };
}
