-- 0010 · 2026-04-25 · ambassador-platform repo
--
-- Bug fix: amb_v_leaderboard was counting refunds (positive admin_adjustment
-- deltas from amb_cancel_order) as "earned" points, which inflated rankings.
--
-- Original: SUM(GREATEST(delta, 0)) — any positive ledger row counts.
-- Fixed:    SUM(delta) WHERE reason='submission_awarded' — only points
--           awarded for completing activities count toward earnings.
--
-- The dashboard's "Total earned" stat has the same scoping applied in the
-- application code (app/(ambassador)/dashboard/page.tsx). Definitions are
-- now consistent: "earned" = "awarded for an activity submission".
--
-- Tradeoff: future bonus admin_adjustments (admin gifts not tied to
-- refunds) won't count either. Schema has no way to distinguish bonus from
-- refund adjustments today; if we add that distinction later (e.g.,
-- 'admin_bonus' reason), update this view.
--
-- Idempotent (CREATE OR REPLACE VIEW). Already applied to live project
-- zpciertrkqwzuuektzpj on 2026-04-25 via the Supabase Management API.

CREATE OR REPLACE VIEW public.amb_v_leaderboard AS
SELECT
  p.id          AS user_id,
  p.first_name,
  p.last_name,
  COALESCE(SUM(l.delta), 0)::int AS total_earned
FROM public.amb_profiles p
LEFT JOIN public.amb_points_ledger l
  ON l.user_id = p.id
  AND l.reason = 'submission_awarded'
WHERE p.role = 'ambassador' AND p.status = 'approved'
GROUP BY p.id, p.first_name, p.last_name
ORDER BY total_earned DESC;
