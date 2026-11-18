-- Run as the migration/job owner. Retain dispatch history for investigation.
begin;
select cron.unschedule(jobid)
from cron.job
where jobname = 'kinto-payment-expiry-p4' and username = current_user;
drop function if exists private.kinto_payment_enqueue_expiry();
commit;
