-- KINTO courier UUID migration. Run once in Supabase SQL Editor BEFORE preview testing.
-- Additive only: preserves couriers.id (bigint), orders.courier_id (text),
-- orders.delivery_agent_id (uuid), historical assignments and credentials.
BEGIN;
ALTER TABLE public.couriers
  ADD COLUMN IF NOT EXISTS courier_uuid uuid;
UPDATE public.couriers
SET courier_uuid = gen_random_uuid()
WHERE courier_uuid IS NULL;
ALTER TABLE public.couriers
  ALTER COLUMN courier_uuid SET DEFAULT gen_random_uuid();
ALTER TABLE public.couriers
  ALTER COLUMN courier_uuid SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS couriers_courier_uuid_unique_idx
  ON public.couriers (courier_uuid);
COMMIT;

-- Read-only verification:
SELECT id, name, courier_uuid FROM public.couriers ORDER BY id;
