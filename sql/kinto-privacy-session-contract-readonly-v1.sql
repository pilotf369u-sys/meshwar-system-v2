-- Read only, four named function definitions. No login endpoint is called or changed.
BEGIN READ ONLY;
SET LOCAL statement_timeout='8s';
SET LOCAL lock_timeout='500ms';
WITH wanted(signature) AS (VALUES
 ('private.require_customer_review_session(text)'),
 ('private.require_admin_session_v147(text)'),
 ('public.customer_session_identity_v150(text)'),
 ('public.customer_submit_product_review_v132(text,uuid,uuid,smallint,text)')
)
SELECT signature,
       to_regprocedure(signature) IS NOT NULL AS exists,
       CASE WHEN to_regprocedure(signature) IS NOT NULL
            THEN pg_get_functiondef(to_regprocedure(signature))
       END AS definition
FROM wanted
ORDER BY signature;
COMMIT;
