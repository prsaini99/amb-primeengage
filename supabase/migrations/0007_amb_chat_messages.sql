-- 0007 · 2026-04-25 · ambassador-platform repo
--
-- §6.4 Chat — 1-on-1 messages between admin and ambassador.
--
-- Tech doc Phase 1 deviation: NO Supabase Realtime / WebSockets. The
-- platform polls every ~5s on the client side (paused when the tab is
-- hidden). Drops a moving piece, lower infra cost, fine for the volume.
--
-- "ambassadors can only message the admin; admin can message any
-- ambassador" (§4.7) is enforced at the route handler layer, not via a DB
-- CHECK — Postgres CHECKs can't run subqueries against amb_profiles to look
-- up the receiver's role. Application-layer enforcement is sufficient
-- because all writes go through the gated /api/chat/messages route.
--
-- Indexes optimize the two hot queries:
--   1. Fetch a 1-on-1 thread between A and B → (sender_id, receiver_id, created_at)
--   2. Count unread per receiver  → partial on receiver_id WHERE read_at IS NULL
--
-- Idempotent. Already applied to live project zpciertrkqwzuuektzpj on
-- 2026-04-25 via the Supabase Management API.

CREATE TABLE IF NOT EXISTS public.amb_chat_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id   uuid NOT NULL REFERENCES public.amb_profiles(id) ON DELETE RESTRICT,
  receiver_id uuid NOT NULL REFERENCES public.amb_profiles(id) ON DELETE RESTRICT,
  body        text NOT NULL CHECK (char_length(trim(body)) > 0),
  read_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT amb_chat_messages_no_self CHECK (sender_id <> receiver_id)
);

-- Thread fetch: messages between any two parties in chronological order.
-- The composite index covers both directions when used with the standard
-- thread query: WHERE (sender,receiver) IN ((A,B),(B,A)) ORDER BY created_at.
CREATE INDEX IF NOT EXISTS amb_chat_messages_pair_idx
  ON public.amb_chat_messages (sender_id, receiver_id, created_at);
CREATE INDEX IF NOT EXISTS amb_chat_messages_receiver_created_idx
  ON public.amb_chat_messages (receiver_id, created_at DESC);

-- Unread-count partial index: keeps the hot path tiny since the vast majority
-- of rows have read_at SET.
CREATE INDEX IF NOT EXISTS amb_chat_messages_unread_idx
  ON public.amb_chat_messages (receiver_id, sender_id)
  WHERE read_at IS NULL;

ALTER TABLE public.amb_chat_messages ENABLE ROW LEVEL SECURITY;
