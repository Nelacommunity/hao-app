-- Community recommendations: what people from each country (and region) visited and liked.
-- Raw stats are never readable by clients; get_place_social_proof() returns only groups of at least
-- MIN_GROUP_SIZE (5) people and never a user id. Keep 5 in sync with shared/places/config.ts.

-- ─── Countries → regions, so a Tanzanian also sees what Kenyans liked ───────
create table public.country_groups (
  nationality text primary key check (nationality ~ '^[A-Z]{2}$'),
  region text not null check (region ~ '^[a-z_]{2,40}$')
);

alter table public.country_groups enable row level security;

create policy "Signed-in users can read country groups"
  on public.country_groups for select
  to authenticated
  using (true);

revoke all on public.country_groups from anon, authenticated;
grant select on public.country_groups to authenticated;

insert into public.country_groups (nationality, region)
select code, region
from (
  values
    ('east_africa', array['TZ', 'KE', 'UG', 'RW', 'BI', 'SS', 'ET', 'SO', 'DJ', 'ER']),
    ('west_africa', array['NG', 'GH', 'SN', 'CI', 'ML', 'BF', 'NE', 'GN', 'SL', 'LR', 'TG', 'BJ', 'GM', 'GW', 'CV', 'MR']),
    ('central_africa', array['CM', 'CD', 'CG', 'GA', 'CF', 'TD', 'GQ', 'ST', 'AO']),
    ('southern_africa', array['ZA', 'ZW', 'ZM', 'MW', 'MZ', 'BW', 'NA', 'LS', 'SZ', 'MG', 'MU', 'SC', 'KM']),
    ('north_africa', array['EG', 'MA', 'DZ', 'TN', 'LY', 'SD']),
    ('middle_east', array['SA', 'AE', 'QA', 'KW', 'BH', 'OM', 'YE', 'IQ', 'IR', 'JO', 'LB', 'SY', 'PS', 'IL', 'TR']),
    ('south_asia', array['IN', 'PK', 'BD', 'LK', 'NP', 'BT', 'MV', 'AF']),
    ('southeast_asia', array['ID', 'MY', 'TH', 'VN', 'PH', 'SG', 'MM', 'KH', 'LA', 'BN', 'TL']),
    ('east_asia', array['JP', 'KR', 'KP', 'MN', 'TW', 'HK', 'MO']),
    ('central_asia', array['KZ', 'UZ', 'KG', 'TJ', 'TM']),
    ('eastern_europe', array['RU', 'UA', 'BY', 'MD', 'PL', 'CZ', 'SK', 'HU', 'RO', 'BG', 'GE', 'AM', 'AZ']),
    ('western_europe', array['GB', 'IE', 'FR', 'DE', 'NL', 'BE', 'LU', 'CH', 'AT', 'MC', 'LI']),
    ('northern_europe', array['SE', 'NO', 'DK', 'FI', 'IS', 'EE', 'LV', 'LT']),
    ('southern_europe', array['IT', 'ES', 'PT', 'GR', 'MT', 'CY', 'HR', 'SI', 'RS', 'BA', 'ME', 'MK', 'AL']),
    ('north_america', array['US', 'CA']),
    ('latin_america', array['MX', 'BR', 'AR', 'CL', 'CO', 'PE', 'VE', 'EC', 'BO', 'PY', 'UY', 'CU', 'DO', 'GT', 'HN', 'SV', 'NI', 'CR', 'PA', 'JM', 'HT', 'TT']),
    ('oceania', array['AU', 'NZ', 'FJ', 'PG', 'WS', 'TO', 'VU', 'SB'])
) as groups (region, codes), unnest(codes) as code;

-- ─── Stats tables: written only by the functions below ──────────────────────
create table public.place_country_stats (
  place_id uuid not null references public.places (id) on delete cascade,
  nationality text not null check (nationality ~ '^[A-Z]{2}$'),
  visitor_count integer not null default 0,
  like_count integer not null default 0,
  dislike_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (place_id, nationality)
);

create table public.region_stats (
  place_id uuid not null references public.places (id) on delete cascade,
  region text not null,
  visitor_count integer not null default 0,
  like_count integer not null default 0,
  dislike_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (place_id, region)
);

-- Cold start: likes collected by the team in surveys, counted as visits that were liked.
create table public.seeded_likes (
  place_id uuid not null references public.places (id) on delete cascade,
  nationality text not null check (nationality ~ '^[A-Z]{2}$'),
  likes integer not null check (likes between 0 and 100000),
  created_at timestamptz not null default now(),
  primary key (place_id, nationality)
);

-- The primary key (place_id, nationality) is the place_country_stats(place_id, nationality) index.

alter table public.place_country_stats enable row level security;
alter table public.region_stats enable row level security;
alter table public.seeded_likes enable row level security;

-- No policies and no grants: clients can't read or write these at all.
revoke all on public.place_country_stats from anon, authenticated;
revoke all on public.region_stats from anon, authenticated;
revoke all on public.seeded_likes from anon, authenticated;

-- ─── Recompute ───────────────────────────────────────────────────────────────
-- Counts distinct users who opted in (share_visits) with a confirmed visit, plus seeded likes.
-- Deleted visits, or a user turning sharing off, drop out on the next recompute.
create function public.recompute_place_stats(target_place uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.place_country_stats where place_id = target_place;
  delete from public.region_stats where place_id = target_place;
  -- The place itself is being deleted (cascading to its visits): nothing to count.
  if not exists (select 1 from public.places where id = target_place) then
    return;
  end if;

  insert into public.place_country_stats (place_id, nationality, visitor_count, like_count, dislike_count, updated_at)
  select target_place, nationality, sum(visitors), sum(likes), sum(dislikes), now()
  from (
    select p.nationality,
           count(distinct v.user_id) as visitors,
           count(distinct v.user_id) filter (where v.rating = 1) as likes,
           count(distinct v.user_id) filter (where v.rating = -1) as dislikes
    from public.visits v
    join public.profiles p on p.id = v.user_id
    where v.place_id = target_place and v.status = 'confirmed' and p.share_visits and p.nationality is not null
    group by p.nationality
    union all
    select s.nationality, s.likes, s.likes, 0 from public.seeded_likes s where s.place_id = target_place
  ) counted
  group by nationality;

  insert into public.region_stats (place_id, region, visitor_count, like_count, dislike_count, updated_at)
  select target_place, g.region, sum(c.visitor_count), sum(c.like_count), sum(c.dislike_count), now()
  from public.place_country_stats c
  join public.country_groups g on g.nationality = c.nationality
  where c.place_id = target_place
  group by g.region;
end;
$$;

-- Nightly safety net (pg_cron): rebuilds every place's stats in one pass.
create function public.recompute_all_place_stats()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.place_country_stats where true;
  delete from public.region_stats where true;

  insert into public.place_country_stats (place_id, nationality, visitor_count, like_count, dislike_count, updated_at)
  select place_id, nationality, sum(visitors), sum(likes), sum(dislikes), now()
  from (
    select v.place_id, p.nationality,
           count(distinct v.user_id) as visitors,
           count(distinct v.user_id) filter (where v.rating = 1) as likes,
           count(distinct v.user_id) filter (where v.rating = -1) as dislikes
    from public.visits v
    join public.profiles p on p.id = v.user_id
    where v.status = 'confirmed' and p.share_visits and p.nationality is not null
    group by v.place_id, p.nationality
    union all
    select s.place_id, s.nationality, s.likes, s.likes, 0 from public.seeded_likes s
  ) counted
  group by place_id, nationality;

  insert into public.region_stats (place_id, region, visitor_count, like_count, dislike_count, updated_at)
  select c.place_id, g.region, sum(c.visitor_count), sum(c.like_count), sum(c.dislike_count), now()
  from public.place_country_stats c
  join public.country_groups g on g.nationality = c.nationality
  group by c.place_id, g.region;
end;
$$;

revoke execute on function public.recompute_place_stats(uuid) from public, anon, authenticated;
revoke execute on function public.recompute_all_place_stats() from public, anon, authenticated;

-- ─── Triggers ────────────────────────────────────────────────────────────────
-- Any change that touches a confirmed visit recomputes that place.
create function public.visits_recompute_stats()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.status = 'confirmed' then
    perform public.recompute_place_stats(old.place_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.status = 'confirmed'
     and (tg_op = 'INSERT' or old.status <> 'confirmed' or old.place_id <> new.place_id or old.rating is distinct from new.rating) then
    perform public.recompute_place_stats(new.place_id);
  end if;
  return null;
end;
$$;

create trigger visits_recompute_stats
  after insert or update or delete on public.visits
  for each row execute function public.visits_recompute_stats();

-- Turning sharing on/off or changing nationality moves the user's visits between groups.
create function public.profiles_recompute_stats()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid;
begin
  for target in select distinct place_id from public.visits where user_id = new.id and status = 'confirmed' loop
    perform public.recompute_place_stats(target);
  end loop;
  return null;
end;
$$;

create trigger profiles_recompute_stats
  after update of share_visits, nationality on public.profiles
  for each row
  when (old.share_visits is distinct from new.share_visits or old.nationality is distinct from new.nationality)
  execute function public.profiles_recompute_stats();

create function public.seeded_likes_recompute_stats()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.recompute_place_stats(coalesce(new.place_id, old.place_id));
  return null;
end;
$$;

create trigger seeded_likes_recompute_stats
  after insert or update or delete on public.seeded_likes
  for each row execute function public.seeded_likes_recompute_stats();

revoke execute on function public.visits_recompute_stats() from public, anon, authenticated;
revoke execute on function public.profiles_recompute_stats() from public, anon, authenticated;
revoke execute on function public.seeded_likes_recompute_stats() from public, anon, authenticated;

-- ─── The only way to read stats ──────────────────────────────────────────────
-- Counts for the given places from people of `nationality` and of its region, only for groups of at
-- least 5 people. Returns no user ids, profiles or visits.
create function public.get_place_social_proof(place_ids uuid[], nationality text)
returns table (place_id uuid, scope text, region text, visitor_count integer, like_count integer, dislike_count integer)
language sql
stable
security definer
set search_path = ''
as $$
  with ids as (
    select unnest(place_ids[1:100]) as id
  ), nat as (
    select upper(get_place_social_proof.nationality) as code
  )
  select c.place_id, 'country'::text, null::text, c.visitor_count, c.like_count, c.dislike_count
  from public.place_country_stats c, nat
  where c.place_id in (select id from ids) and c.nationality = nat.code and c.visitor_count >= 5
  union all
  select r.place_id, 'region'::text, r.region, r.visitor_count, r.like_count, r.dislike_count
  from public.region_stats r
  join public.country_groups g on g.region = r.region
  join nat on g.nationality = nat.code
  where r.place_id in (select id from ids) and r.visitor_count >= 5;
$$;

revoke execute on function public.get_place_social_proof(uuid[], text) from public, anon;
grant execute on function public.get_place_social_proof(uuid[], text) to authenticated, service_role;
