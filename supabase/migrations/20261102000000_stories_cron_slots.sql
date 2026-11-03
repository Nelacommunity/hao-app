-- The nightly story run, split across 15-minute slots. One city takes 5–8 minutes and the Edge runtime stops a
-- request after 15, so a single call for every city was cut off part-way (2 of 4 cities, run never closed).
-- Each call now sends resume: true: the function skips cities and languages that already have stories today and
-- only starts a new city in its first 5 minutes. Eight slots from 02:00 to 03:45 China time leave room for
-- retries; once every city is done, the remaining calls return at once without a run row.
-- The HTTP timeout is 14 minutes: pg_net closing the connection earlier would stop the function with it.
select cron.unschedule('generate-stories');

select cron.schedule(
  'generate-stories',
  '*/15 18-19 * * *', -- 02:00–03:45 China time
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/generate-stories',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{"trigger": "cron", "resume": true}'::jsonb,
    timeout_milliseconds := 840000
  )
  $$
);
