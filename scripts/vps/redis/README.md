# Redis: shared rate limits and caches

The API routes run on many short-lived instances (EAS Hosting's Workers, the places-chat Edge Function), so anything
kept in memory only applies to one of them. Redis holds, for all of them:

| What | Key | Kept |
|---|---|---|
| Rate limits per user and route, per IP for public routes | `rl:<route>:<user or ip>:<window>` | 1 minute (custom languages: 1 day) |
| Verified sign-ins (by the token's SHA-256, never the token) | `c:auth:<sha256>` | ≤ 1 minute |
| The guide (knowledge, embassies, apps, topics) | `c:guide:rows:v1` | 5 minutes |
| The app's text per language | `c:ui:<lang>:<catalog hash>` | 1 day |

It's optional. Without `REDIS_REST_URL` and `REDIS_REST_TOKEN`, or while Redis is down, rate limits count per
instance and the caches go to Supabase, as before. After a failure Redis is skipped for 30 s, so an outage costs one
3 s timeout, not one per request.

## Run it on the VPS (Coolify)

1. Make two secrets: `openssl rand -hex 32` twice, one for `REDIS_PASSWORD`, one for `REDIS_REST_TOKEN`.
2. Coolify → New resource → Docker Compose → paste `docker-compose.yml` from this folder. Set the two variables.
3. Give the `redis-http` service a domain with HTTPS, e.g. `https://redis.acyrx.com` (port 80). Leave `redis`
   without a domain.
4. Deploy, then check it answers (prints `{"result":"PONG"}`):
   ```bash
   curl -s https://redis.acyrx.com -H "Authorization: Bearer $REDIS_REST_TOKEN" -H 'Content-Type: application/json' -d '["PING"]'
   ```
   And that a wrong token is refused (401):
   ```bash
   curl -s -o /dev/null -w '%{http_code}\n' https://redis.acyrx.com -H 'Authorization: Bearer wrong' -H 'Content-Type: application/json' -d '["PING"]'
   ```

Upstash works too, without the VPS: create a Redis database there and use its REST URL and token.

## Point Hao at it

- **EAS Hosting** (all API routes):
  ```bash
  npx eas-cli@latest env:create --environment production --name REDIS_REST_URL --value https://redis.acyrx.com --visibility plaintext
  npx eas-cli@latest env:create --environment production --name REDIS_REST_TOKEN --value <token> --visibility secret
  ```
  then deploy again (`npx expo export --platform web && npx eas-cli@latest deploy --prod --environment production`).
- **places-chat Edge Function**: add `REDIS_REST_URL` and `REDIS_REST_TOKEN` to the Supabase functions service's
  environment in Coolify and Redeploy it (a restart doesn't pick up new variables).
- **Local development**: the same two lines in `.env`.

The token can read and write everything in this Redis, so it lives only in server environments, never in an
`EXPO_PUBLIC_*` variable or the app.
