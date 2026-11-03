-- Runs on the VPS database after the dump is restored (scripts/vps/migrate-to-vps.sh).
-- psql variables: old_api_url, new_api_url, new_service_key.
\set ON_ERROR_STOP on
-- The DO block below can't see psql variables, so pass the URLs as session settings.
select set_config('hao.old_api_url', :'old_api_url', false), set_config('hao.new_api_url', :'new_api_url', false);

-- ─── Vault: the restored secrets were encrypted with the hosted project's key, so they can't be read
-- here. Write them again with the VPS's own values (the nightly cron job reads them).
delete from vault.secrets where name in ('project_url', 'service_role_key');
select vault.create_secret(:'new_api_url', 'project_url');
select vault.create_secret(:'new_service_key', 'service_role_key');

-- ─── Scheduled jobs (pg_cron keeps them as data, which the dump doesn't carry). Same jobs as
-- supabase/migrations/*_places_cron.sql and *_stories_cron.sql; scheduling a name again replaces it.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'expire-pending-visits',
  '17 * * * *',
  $$ delete from public.visits where status = 'pending' and created_at < now() - interval '7 days' $$
);

select cron.schedule(
  'recompute-place-stats',
  '30 19 * * *', -- 03:30 China time
  $$ select public.recompute_all_place_stats() $$
);

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

select cron.schedule(
  'expire-stories',
  '40 * * * *',
  $$ update public.stories set status = 'expired' where status in ('approved', 'draft') and valid_until < now() $$
);

-- ─── Links to stored files: story pictures (and anything else) saved as full URLs of the hosted
-- project's storage now point at the VPS. Only text and jsonb columns in public are touched.
do $$
declare
  old_prefix text := rtrim(current_setting('hao.old_api_url'), '/') || '/storage/v1/';
  new_prefix text := rtrim(current_setting('hao.new_api_url'), '/') || '/storage/v1/';
  col record;
  changed bigint;
begin
  for col in
    select table_name, column_name, data_type
    from information_schema.columns c
    join information_schema.tables t using (table_schema, table_name)
    where c.table_schema = 'public' and t.table_type = 'BASE TABLE'
      and c.data_type in ('text', 'character varying', 'jsonb', 'ARRAY')
      and (c.data_type <> 'ARRAY' or c.udt_name = '_text')
      and c.is_generated = 'NEVER'
  loop
    if col.data_type = 'jsonb' then
      execute format('update public.%I set %I = replace(%I::text, $1, $2)::jsonb where %I::text like $3', col.table_name, col.column_name, col.column_name, col.column_name)
        using old_prefix, new_prefix, '%' || old_prefix || '%';
    elsif col.data_type = 'ARRAY' then
      execute format('update public.%I set %I = replace(%I::text, $1, $2)::text[] where %I::text like $3', col.table_name, col.column_name, col.column_name, col.column_name)
        using old_prefix, new_prefix, '%' || old_prefix || '%';
    else
      execute format('update public.%I set %I = replace(%I, $1, $2) where %I like $3', col.table_name, col.column_name, col.column_name, col.column_name)
        using old_prefix, new_prefix, '%' || old_prefix || '%';
    end if;
    get diagnostics changed = row_count;
    if changed > 0 then
      raise notice 'Storage links moved: public.%.% (% rows)', col.table_name, col.column_name, changed;
    end if;
  end loop;
end $$;
