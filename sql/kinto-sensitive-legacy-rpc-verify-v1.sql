-- Read-only check of legacy RPC lockdown; expected: no anon or authenticated EXECUTE
-- on the five legacy ID-trusting functions after Stage 3.
WITH legacy(signature) AS (
 VALUES
 ('public.adjust_customer_reward_balance(uuid,numeric,text,text,text)'),
 ('public.admin_approve_featured_request(uuid,uuid,uuid,timestamptz,timestamptz,text)'),
 ('public.admin_reject_featured_request(uuid,uuid,text)'),
 ('public.admin_list_featured_requests(uuid)'),
 ('public.list_featured_merchants(uuid)')
)
SELECT signature,
       to_regprocedure(signature) IS NOT NULL AS exists_in_db,
       has_function_privilege('anon',signature,'EXECUTE') AS anon_execute,
       has_function_privilege('authenticated',signature,'EXECUTE') AS authenticated_execute
FROM legacy ORDER BY signature;
