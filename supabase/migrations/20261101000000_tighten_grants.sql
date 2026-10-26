-- Security tidy-up from an audit of the self-hosted database.

-- ui_translations only revoked insert/update/delete, so anon and signed-in users kept TRUNCATE (which
-- ignores RLS), TRIGGER and REFERENCES. They only need to read it.
revoke all on public.ui_translations from anon, authenticated;
grant select on public.ui_translations to anon, authenticated;

-- The sign-up trigger runs as its owner; nobody needs to call it directly.
revoke all on function public.handle_new_user() from public, anon, authenticated;
