import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/admin/orders/[id]/notes
 * Body: { admin_notes: string }
 *
 * Plain admin_notes update. Replaces the side-channel where admin used to
 * save notes by clicking "Mark fulfilled" or "Cancel + refund". Now that
 * the Fulfill gate is gone, admin can edit notes any time independently.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;

    const gate = await requireAdmin();
    if (!gate.ok) return gate.response;

    let body: { admin_notes?: string };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return Response.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const notes = body.admin_notes?.trim() || null;

    const sb = createAdminClient();
    const { data, error } = await sb
      .from("amb_orders")
      .update({ admin_notes: notes })
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (error) return Response.json({ error: error.message }, { status: 500 });
    if (!data) return Response.json({ error: "Order not found." }, { status: 404 });

    return Response.json({ ok: true });
  } catch (err) {
    console.error("[admin/orders/notes] uncaught:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
