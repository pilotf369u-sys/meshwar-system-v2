begin read only;
select jobid, jobname, schedule, database, username, active
from cron.job where jobname = 'kinto-payment-expiry-p4';

select r.runid, r.status, r.start_time, r.end_time
from cron.job_run_details r join cron.job j using (jobid)
where j.jobname = 'kinto-payment-expiry-p4'
order by r.start_time desc limit 20;

-- pg_net enqueue success alone does not prove a successful expiry RPC.
select d.request_id, d.queued_at, r.status_code, r.timed_out,
       r.error_msg is not null as transport_error,
       case when r.id is null then
         case when d.queued_at > now() - interval '2 minutes' then 'awaiting_response' else 'response_missing' end
       when r.status_code = 200 and not coalesce(r.timed_out, false) and r.error_msg is null then 'ok'
       else 'failed' end as outcome
from private.kinto_payment_expiry_dispatch d
left join net._http_response r on r.id = d.request_id
where d.queued_at > now() - interval '10 minutes'
order by d.queued_at desc;

select count(*) filter (where a.status = 'pending' and h.expires_at <= now()) as overdue_pending,
       count(*) filter (where a.status = 'reconciliation_required') as awaiting_reconciliation
from private.kinto_payment_attempts_p4 a
join private.kinto_stock_holds_p4 h on h.attempt_id = a.id
where h.status in ('active', 'reconciliation_required');
rollback;
