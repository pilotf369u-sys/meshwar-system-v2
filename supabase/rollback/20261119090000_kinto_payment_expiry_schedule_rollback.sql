-- Run as the migration/job owner. Retain dispatch history for investigation.
begin;
do $rollback$
declare
  expiry_job_id bigint;
begin
  select jobid into expiry_job_id
  from cron.job
  where jobname = 'kinto-payment-expiry-p4' and username = current_user;
  if not found then
    raise exception 'KINTO_PAYMENT_EXPIRY_ROLLBACK_JOB_NOT_FOUND'
      using hint = 'Use the original job owner and verify the cron job exists before removing the enqueue function.';
  end if;

  if cron.unschedule(expiry_job_id) is distinct from true then
    raise exception 'KINTO_PAYMENT_EXPIRY_ROLLBACK_UNSCHEDULE_FAILED';
  end if;

  if exists (
    select 1 from cron.job
    where jobid = expiry_job_id or jobname = 'kinto-payment-expiry-p4'
  ) then
    raise exception 'KINTO_PAYMENT_EXPIRY_ROLLBACK_JOB_STILL_PRESENT';
  end if;
end;
$rollback$;

drop function if exists private.kinto_payment_enqueue_expiry();
commit;
