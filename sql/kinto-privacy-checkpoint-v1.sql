-- Source only. DB-owner helper: no browser/Edge RPC and no writes or restore approval.
-- Install after controls, media and chat. Preserve exports separately from DB backups.
BEGIN;
CREATE FUNCTION private.kinto_privacy_checkpoint_v1(p_max_rows integer DEFAULT 5000)RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path=pg_catalog,private,public,extensions,pg_temp AS $$
DECLARE accounts jsonb;media jsonb;chat jsonb;payload text;counts jsonb;a bigint;b bigint;c bigint;
BEGIN
 IF p_max_rows IS NULL OR p_max_rows NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'INVALID_CHECKPOINT_LIMIT';END IF;
 -- A STABLE function reads all three ledgers from the calling statement's snapshot.
 -- Do not stitch independently paginated exports or claim to include later commits.
 SELECT count(*)INTO a FROM private.kinto_erasure_ledger_v1;
 SELECT count(*)INTO b FROM private.kinto_privacy_media_ledger_v1;
 SELECT count(*)INTO c FROM private.kinto_privacy_chat_decisions_v1 WHERE state='erased';
 IF greatest(a,b,c)>p_max_rows THEN RAISE EXCEPTION 'CHECKPOINT_TOO_LARGE_NO_PARTIAL_EXPORT';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('key_hash',customer_hash,'erased_at',erased_at)ORDER BY customer_hash,erased_at),'[]')INTO accounts FROM private.kinto_erasure_ledger_v1;
 SELECT coalesce(jsonb_agg(jsonb_build_object('key_hash',path_hash,'erased_at',removed_at)ORDER BY path_hash,removed_at),'[]')INTO media FROM private.kinto_privacy_media_ledger_v1;
 SELECT coalesce(jsonb_agg(jsonb_build_object('key_hash',erased_key_hash,'erased_at',erased_at)ORDER BY erased_key_hash,erased_at),'[]')INTO chat FROM private.kinto_privacy_chat_decisions_v1 WHERE state='erased';
 IF jsonb_array_length(accounts)<>a OR jsonb_array_length(media)<>b OR jsonb_array_length(chat)<>c THEN RAISE EXCEPTION 'INCOHERENT_CHECKPOINT';END IF;
 counts:=jsonb_build_object('accounts',a,'review_media',b,'chat_text',c);
 payload:=jsonb_build_object('format','kinto-erasure-checkpoint-v1','source_project','hsmmbloouskqdnptiiad','snapshot_at',statement_timestamp(),'database_snapshot',pg_current_snapshot()::text,'counts',counts,'ledgers',jsonb_build_object('accounts',accounts,'review_media',media,'chat_text',chat),'snapshot_coherent',true,'coverage_verified',false,'restore_authorized',false)::text;
 RETURN jsonb_build_object('payload_text',payload,'sha256',encode(digest(convert_to(payload,'UTF8'),'sha256'),'hex'));
END$$;
REVOKE ALL ON FUNCTION private.kinto_privacy_checkpoint_v1(integer)FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
