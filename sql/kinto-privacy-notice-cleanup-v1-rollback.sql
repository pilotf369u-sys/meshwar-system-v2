-- Removes only the internal helper. Does not recreate any removed recipient links.
BEGIN;
DROP FUNCTION IF EXISTS private.kinto_privacy_notice_cleanup_v1(uuid,uuid);
COMMIT;
