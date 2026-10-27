# Moving Supabase to a VPS

`migrate-to-vps.sh` copies the database, auth users, Storage files, Vault secrets and cron jobs. The
rest is configuration on the VPS and in the app, listed below.

## Before

1. Run self-hosted Supabase on the VPS (`supabase/docker` from github.com/supabase/supabase), with the
   images up to date so auth and storage match the hosted project's versions, behind https on a domain.
2. Start Docker locally. The Supabase CLI and psql run in containers.
3. `cp scripts/vps/vps.env.example .vps.env.local` and fill it in.
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
- Add its secrets to the VPS `.env` and pass them in the `functions` service's `environment`: `QWEN_API_KEY`,
  `AMAP_KEY`, and any of `QWEN_BASE_URL`, `QWEN_STORY_MODEL`, `STORIES_MAX_CALLS`, `STORIES_AUTO_APPROVE_ALL`,
  `STORIES_AI_IMAGES`, `QWEN_IMAGE_MODEL`, `WIKIMEDIA_CONTACT`.

Then, after each change, set `VPS_SSH` and `VPS_DOCKER_DIR` in `.vps.env.local` and run
`scripts/vps/deploy-function.sh`. It copies `supabase/functions/*` and `shared/`, restarts the container and
checks every function boots. A full test run (calls Qwen):
`curl -X POST $NEW_API_URL/functions/v1/generate-stories -H "Authorization: Bearer $NEW_SERVICE_KEY" -d '{"dry_run":true}'`.

**Auth.** In the VPS `.env`: `SITE_URL` and `ADDITIONAL_REDIRECT_URLS` (copy them from the hosted
Dashboard → Authentication → URL Configuration), the Resend SMTP settings below so sign-up and password-reset emails send,
and the email templates in `supabase/templates/` (`GOTRUE_MAILER_TEMPLATES_*`). Users keep their passwords,
but the VPS signs sessions with its own JWT secret, so everyone signs in once more after the switch.

**Emails (Resend).** Sign-up asks for a 6-digit code (`{{ .Token }}` in `supabase/templates/confirmation.html`),
and so does "Forgot password?" (`recovery.html`); sign-in is email + password. Supabase Auth sends the codes through
Resend's SMTP. Verify a domain at resend.com → Domains, create an API key, then set these in the Supabase service's
environment (under Coolify: the service → Environment Variables, then Redeploy, since a restart doesn't pick up new
values):

| Supabase `.env` / Coolify | Auth (GoTrue) variable | Value |
|---|---|---|
| `SMTP_HOST` | `GOTRUE_SMTP_HOST` | `smtp.resend.com` |
| `SMTP_PORT` | `GOTRUE_SMTP_PORT` | `465` |
| `SMTP_USER` | `GOTRUE_SMTP_USER` | `resend` |
| `SMTP_PASS` | `GOTRUE_SMTP_PASS` | the Resend API key (`re_…`) |
| `SMTP_ADMIN_EMAIL` | `GOTRUE_SMTP_ADMIN_EMAIL` | the sender, on the verified domain (e.g. `login@acyrx.com`) |
| `SMTP_SENDER_NAME` | `GOTRUE_SMTP_SENDER_NAME` | `Hao` |
| `ENABLE_EMAIL_AUTOCONFIRM` | `GOTRUE_MAILER_AUTOCONFIRM` | `false` (otherwise no code is sent) |
| — | `GOTRUE_RATE_LIMIT_EMAIL_SENT` | `60` (emails per hour; the default is very low) |
| — | `GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_REAUTHENTICATION` | `true` (a stolen access token alone can't change the password) |

The emails must use Hao's templates (a 6-digit code); Auth's built-in ones send a link the app can't open.
Self-hosted Auth downloads templates from a URL, so `node --env-file=.vps.env.local scripts/vps/upload-email-templates.mjs`
puts `supabase/templates/*.html` in a public `email-templates` bucket and prints the values to set. Under Coolify,
`GOTRUE_MAILER_TEMPLATES_*` are derived in the compose file, so set their sources in Environment Variables:
`MAILER_TEMPLATES_CONFIRMATION` and `MAILER_TEMPLATES_RECOVERY` (the files' URLs), and, if the subjects are derived
the same way, `MAILER_SUBJECTS_CONFIRMATION` and `MAILER_SUBJECTS_RECOVERY`; then Redeploy. Without Coolify, set the
`GOTRUE_MAILER_*` names on the auth service directly. Run the script again after changing a template, then restart
the auth container.

Check it: sign up in the app with a real address; the code should arrive within seconds and show in Resend →
Emails. If not, the auth container's logs (`docker logs <auth container>`) show the SMTP error.

**App and server keys.** Point everything at the VPS and its keys:
- `.env` and the EAS environment: `EXPO_PUBLIC_SUPABASE_URL` = the VPS URL,
  `EXPO_PUBLIC_SUPABASE_KEY` = the VPS `ANON_KEY`, `SUPABASE_SECRET_KEY` = the VPS `SERVICE_ROLE_KEY`.
- Redeploy the API routes (EAS Hosting), and ship the app (EAS Update, or a new build) so phones use them.

**QR rooms** use Realtime broadcast and presence only (no table replication), so nothing to enable.

**Keep the hosted project** for a while (paused, not deleted) until the VPS has run a few nights of
stories and everything checks out. Then delete `supabase/.vps-backup/`.
