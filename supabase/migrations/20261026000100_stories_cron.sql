-- Nightly Discover story generation and clean-up (pg_cron + pg_net; enable both under Database → Extensions
-- on hosted projects). The generate-stories Edge Function is called with the project URL and service role key
-- stored in Vault, once per project:
--   select vault.create_secret('https://<ref>.supabase.co', 'project_url');
--   select vault.create_secret('<service role key or sb_secret_… key>', 'service_role_key');
create extension if not exists pg_net;

select cron.schedule(
  'generate-stories',
  '0 18 * * *', -- 02:00 China time
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/generate-stories',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{"trigger": "cron"}'::jsonb,
    timeout_milliseconds := 300000
  )
  $$
);

-- Stories past their date leave the feed by RLS already; marking them keeps review queries simple.
select cron.schedule(
  'expire-stories',
  '40 * * * *',
  $$ update public.stories set status = 'expired' where status in ('approved', 'draft') and valid_until < now() $$
);
