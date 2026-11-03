-- Scheduled jobs for places memory (pg_cron; enable it under Database → Extensions on hosted projects).
create extension if not exists pg_cron;

-- Questions nobody answered within 7 days are dropped: an unconfirmed visit never counts, and
-- keeping where someone might have been is not worth it.
select cron.schedule(
  'expire-pending-visits',
  '17 * * * *',
  $$ delete from public.visits where status = 'pending' and created_at < now() - interval '7 days' $$
);

-- Full rebuild of community stats every night (the triggers keep them current during the day).
select cron.schedule(
  'recompute-place-stats',
  '30 19 * * *', -- 03:30 China time
  $$ select public.recompute_all_place_stats() $$
);
