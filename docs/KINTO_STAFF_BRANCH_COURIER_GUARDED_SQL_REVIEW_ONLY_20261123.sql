-- KINTO - guard-only branch transfer / courier validation patch
-- Review prior to running. Does not recreate tables, touch data, alter privileges or change payment/pricing.
-- Live function MD5 confirmed by owner: 886b9817c86af7e067d756e9d9f3414c
BEGIN;
DO $kinto_branch_guard$
DECLARE
  target_fn regprocedure := to_regprocedure('public.kinto_save_staff_order_session_v1(text,text,uuid,text,numeric,text,jsonb)');
  definition text;
  old_allowed text := $src$'مندوب','توزيع داخلي','تم التسليم'$src$;
  new_allowed text := $src$'محولة إلى الفرع','مندوب','توزيع داخلي','تم التسليم'$src$;
  old_anchor text := $src$RAISE EXCEPTION 'ORDER_SAVE_STATUS_DENIED'; END IF;
 -- Payment approval and payment-type edits keep their existing dedicated RPCs.$src$;
  new_anchor text := $src$RAISE EXCEPTION 'ORDER_SAVE_STATUS_DENIED'; END IF;
 -- Branch status requires an actual selected branch; a label alone is not assignment.
 IF typed.status='محولة إلى الفرع' AND (
    typed.branch_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.branches b WHERE b.id::text=typed.branch_id
    )
 ) THEN
   RAISE EXCEPTION 'ORDER_SAVE_BRANCH_REQUIRED' USING ERRCODE='42501';
 END IF;
 -- Courier status requires a selected, active courier assigned to the matching branch.
 IF typed.status='مندوب' AND (
    typed.delivery_agent_id IS NULL OR typed.courier_id IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM public.couriers c
      WHERE c.courier_uuid=typed.delivery_agent_id
        AND c.id::text=typed.courier_id
        AND coalesce(c.is_active,true)
        AND (typed.branch_id IS NULL OR c.branch_id=typed.branch_id)
    )
 ) THEN
   RAISE EXCEPTION 'ORDER_SAVE_COURIER_REQUIRED' USING ERRCODE='42501';
 END IF;
 -- Payment approval and payment-type edits keep their existing dedicated RPCs.$src$;
  before_acl aclitem[];
  before_owner oid;
  before_secdef boolean;
  before_config text[];
  after_definition text;
BEGIN
  IF target_fn IS NULL THEN RAISE EXCEPTION 'KINTO_BRANCH_FUNCTION_MISSING'; END IF;
  definition := pg_get_functiondef(target_fn);
  IF md5(definition) <> '886b9817c86af7e067d756e9d9f3414c' THEN
    RAISE EXCEPTION 'KINTO_BRANCH_FUNCTION_HASH_MISMATCH: %', md5(definition);
  END IF;
  before_acl := (SELECT proacl FROM pg_proc WHERE oid=target_fn);
  before_owner := (SELECT proowner FROM pg_proc WHERE oid=target_fn);
  before_secdef := (SELECT prosecdef FROM pg_proc WHERE oid=target_fn);
  before_config := (SELECT proconfig FROM pg_proc WHERE oid=target_fn);
  IF before_owner <> 'postgres'::regrole::oid OR before_secdef IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'KINTO_BRANCH_FUNCTION_SECURITY_MISMATCH';
  END IF;
  IF (length(definition)-length(replace(definition,old_allowed,''))) <> length(old_allowed)
     OR (length(definition)-length(replace(definition,old_anchor,''))) <> length(old_anchor) THEN
    RAISE EXCEPTION 'KINTO_BRANCH_EXPECTED_ANCHOR_NOT_UNIQUE';
  END IF;
  definition := replace(replace(definition,old_allowed,new_allowed),old_anchor,new_anchor);
  EXECUTE definition;
  after_definition := pg_get_functiondef(target_fn);
  IF position(new_allowed IN after_definition) = 0
     OR position('ORDER_SAVE_BRANCH_REQUIRED' IN after_definition)=0
     OR position('ORDER_SAVE_COURIER_REQUIRED' IN after_definition)=0 THEN
    RAISE EXCEPTION 'KINTO_BRANCH_VERIFY_PATCH_NOT_APPLIED';
  END IF;
  IF (SELECT proacl FROM pg_proc WHERE oid=target_fn) IS DISTINCT FROM before_acl
     OR (SELECT proowner FROM pg_proc WHERE oid=target_fn) IS DISTINCT FROM before_owner
     OR (SELECT prosecdef FROM pg_proc WHERE oid=target_fn) IS DISTINCT FROM before_secdef
     OR (SELECT proconfig FROM pg_proc WHERE oid=target_fn) IS DISTINCT FROM before_config THEN
    RAISE EXCEPTION 'KINTO_BRANCH_FUNCTION_METADATA_CHANGED';
  END IF;
END;
$kinto_branch_guard$;
COMMIT;
SELECT md5(pg_get_functiondef('public.kinto_save_staff_order_session_v1(text,text,uuid,text,numeric,text,jsonb)'::regprocedure)) AS updated_hash,
       position('ORDER_SAVE_BRANCH_REQUIRED' IN pg_get_functiondef('public.kinto_save_staff_order_session_v1(text,text,uuid,text,numeric,text,jsonb)'::regprocedure))>0 AS branch_guard_ready,
       position('ORDER_SAVE_COURIER_REQUIRED' IN pg_get_functiondef('public.kinto_save_staff_order_session_v1(text,text,uuid,text,numeric,text,jsonb)'::regprocedure))>0 AS courier_guard_ready;
