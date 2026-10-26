# Moving Supabase to a VPS

`migrate-to-vps.sh` copies the database, auth users, Storage files, Vault secrets and cron jobs. The
rest is configuration on the VPS and in the app, listed below.

## Before

1. Run self-hosted Supabase on the VPS (`supabase/docker` from github.com/supabase/supabase), with the
   images up to date so auth and storage match the hosted project's versions, behind https on a domain.
2. Start Docker locally. The Supabase CLI and psql run in containers.
3. `cp scripts/vps/vps.env.example .env.vps.local` and fill it in.
4. Pick a quiet time. Anything written to the hosted project after the dump isn't copied, so either
   stop writes (maintenance) or run the script again on a fresh VPS database just before switching.

## Run

```bash
scripts/vps/migrate-to-vps.sh all
# or step by step: dump → restore → post → storage → verify
```

| Step | What it does |
|---|---|
| `dump` | Roles, schema, data and migration history from the hosted project into `supabase/.vps-backup/` (git-ignored, holds user data: delete it when done) |
| `restore` | Loads them into the VPS database in one transaction |
| `post` | Writes the Vault secrets again with the VPS URL and key, schedules the 4 cron jobs, and rewrites links to hosted Storage (story pictures) to the VPS |
| `storage` | Copies every file in every bucket through the Storage API (safe to run again) |
| `verify` | Compares row counts of every table in `public`, `auth` and `storage`, and lists the cron jobs |

If the restore fails on ownership or permission errors, read the "Permission and ownership errors" part of
[the Supabase guide](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).
`dump` already comments out the two known lines. If the `post` step can't write to `vault.secrets`, run it
again with `supabase_admin` as the user in `NEW_DB_URL`.

## After

**Edge Function.** `supabase functions deploy` doesn't work with self-hosted Supabase; it runs whatever is
in `supabase/docker/volumes/functions/` on the VPS. The deploy script copies `shared/` there as `_shared/` and
points the function's `../../../shared/...` imports at it, so `docker-compose.yml` needs no change. Once, on the VPS:
- Add its secrets to the VPS `.env` and pass them in the `functions` service's `environment`: `GEMINI_API_KEY`,
  `AMAP_KEY`, and any of `GEMINI_STORY_MODEL`, `STORIES_MAX_CALLS`, `STORIES_AUTO_APPROVE_ALL`,
  `STORIES_AI_IMAGES`, `GEMINI_IMAGE_MODEL`, `WIKIMEDIA_CONTACT`.

Then, after each change, set `VPS_SSH` and `VPS_DOCKER_DIR` in `.env.vps.local` and run
`scripts/vps/deploy-function.sh`. It copies `supabase/functions/*` and `shared/`, restarts the container and
checks every function boots. A full test run (calls Gemini):
`curl -X POST $NEW_API_URL/functions/v1/generate-stories -H "Authorization: Bearer $NEW_SERVICE_KEY" -d '{"dry_run":true}'`.

**Auth.** In the VPS `.env`: `SITE_URL` and `ADDITIONAL_REDIRECT_URLS` (copy them from the hosted
Dashboard → Authentication → URL Configuration), SMTP settings so sign-up and password-reset emails send,
and the email templates in `supabase/templates/` (`GOTRUE_MAILER_TEMPLATES_*`). Users keep their passwords,
but the VPS signs sessions with its own JWT secret, so everyone signs in once more after the switch.

**App and server keys.** Point everything at the VPS and its keys:
- `.env` and the EAS environment: `EXPO_PUBLIC_SUPABASE_URL` = the VPS URL,
  `EXPO_PUBLIC_SUPABASE_KEY` = the VPS `ANON_KEY`, `SUPABASE_SECRET_KEY` = the VPS `SERVICE_ROLE_KEY`.
- Redeploy the API routes (EAS Hosting), and ship the app (EAS Update, or a new build) so phones use them.

**QR rooms** use Realtime broadcast and presence only (no table replication), so nothing to enable.

**Keep the hosted project** for a while (paused, not deleted) until the VPS has run a few nights of
stories and everything checks out. Then delete `supabase/.vps-backup/`.
