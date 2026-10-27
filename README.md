# Hao 好 — China, made easy

Expo (SDK 57) app for foreigners and tourists in China.

## Screens
- `/` — landing page (hero, features, live demo)
- `/onboarding` — 3 intro slides + language picker
- `/home` — quick actions, phrase of the day, featured places & dishes, essentials, emergency numbers
- `/room` — **QR rooms** over Supabase Realtime: live voice conversation with a local on their own phone, or a captioned tour broadcast (see below)
- `/translate` — **Hao Agent** with two modes. **Interpret**: tell the AI what you need; it talks to the local in Mandarin, understands their answer, asks follow-ups and gives you clear steps. **Guide**: everything for life in China (WeChat setup, Alipay/WeChat Pay, metro, DiDi, trains, SIM/eSIM, shopping, hotel registration, health, delivery) as step-by-step checklists Hao tracks with you (several tasks at once, saved on the device), with phrases for staff, app links and a hand-off to Interpret when you need to talk to someone. Knowledge pack: `shared/ai/china-guide.ts` **Memory**: Hao remembers what people told you, your places and plans (Supabase, RLS-protected), uses it in every mode, and answers questions like “what did the taxi driver say about the fare?” with the memories it used. Manage or delete everything in Me → Hao’s memory.
- `/explore` — map with your location, area dropdown and a pull-up places sheet. Tap a place for the route from where you are (walk / bike / drive times via OpenStreetMap routing, with the rooms server as a fallback proxy and a straight-line estimate if offline) and **Go** to hand off to Amap / Apple Maps / Google Maps. Pins and routes are converted to GCJ-02 so they line up on mainland-China maps
- `/food` — dish suggestions filtered by diet & spice, with "show this to order" phrases
- `/place/[id]` — place details + full-screen "show to taxi driver" mode

## Setup

### 1. Supabase (auth + database)
**Hosted:** create a project at https://supabase.com, then:
```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npm run db:push                       # applies supabase/migrations
```
In the dashboard → **Authentication → Email Templates**, paste `supabase/templates/confirmation.html`
into *Confirm signup* and `supabase/templates/recovery.html` into *Reset password* (Hao verifies with
6-digit codes, `{{ .Token }}`). Set **Authentication → Providers → Email → minimum password length** to 8.

**Local (Docker):** `npm run db:start` runs Supabase locally with `supabase/config.toml`
(templates, confirmations and redirect URLs already configured). Emails appear in Inbucket/Mailpit at
http://127.0.0.1:54324.

### 2. Environment
```bash
cp .env.example .env
```
Fill in `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_KEY` (publishable/anon key) and `QWEN_API_KEY`.
The AI is Qwen (Alibaba Cloud Model Studio) everywhere, including the `generate-stories` Edge Function.

### 3. Run
```bash
npm install
npm start
```

## How auth works
- `src/lib/supabase.ts` — Supabase client; sessions persist in SQLite-backed `localStorage` on device.
- `src/lib/auth.tsx` — `AuthProvider` / `useAuth()` (session, profile, sign out) and `useLanguagePreference()`.
- `src/app/_layout.tsx` — `Stack.Protected` guards: signed-out users see landing, onboarding and `(auth)`;
  signed-in users see the tabs. The splash screen stays up until the stored session loads.
- `(auth)/sign-up` → `verify` (6-digit code) · `sign-in` · `forgot-password` → `verify` → `update-password`.
- Profile tab: edit name, language (saved to the profile), saved places, sign out, **delete account**
  (required by the App Store and Google Play).

## Database (`supabase/migrations/20261019000000_init.sql`)
| Table / function | Purpose | Access (RLS) |
|---|---|---|
| `profiles` | name + language, created by a trigger on sign-up | read/update own row; only editable columns |
| `saved_places` | bookmarked places | read/insert/delete own rows |
| `profiles.preferences` | diet, allergies, spice, budget (migration `20261020000000_preferences.sql`) | update own row |
| `memories` + `search_memories()` | Hao’s long-term memory (what locals said, facts, places, plans) with full-text search; `profiles.memory_enabled` switch (migration `20261021000000_memories.sql`) | read/insert/delete own rows |
| `delete_account()` | deletes the caller and all their data | signed-in users only |

After changing the schema run `npm run db:types` to regenerate `src/lib/database.types.ts`.

## Agent security
The agent calls Qwen from the server route `src/app/api/agent+api.ts`, so the API key never ships inside the
app, and the route rejects requests without a valid Supabase session. In development the app reaches it through
the Expo dev server. For production, deploy with EAS Hosting (`npx expo export --platform web && npx eas-cli@latest deploy`),
add the env vars there, and set the `origin` option of the `expo-router` plugin in `app.json` to the deployed URL.

## QR rooms: conversation & tour broadcast

Rooms run on **Supabase Realtime** (broadcast + presence) — there is no separate server to run. The host's phone
acts as the room: it keeps the state, decides whose turn it is, and calls the AI through the app's API routes
(`/api/room/*`, Qwen key on the server, signed-in users only, memory saved as the user). Guests need **no app and
no account**: they open `public/join.html` (served by the Expo web server) from the QR code.

- **One QR page, like WeChat** (Translate tab → QR icon): **My code** shows your card and QR with a switch between
  *Talk with a local* and *Tour broadcast* (plus where you are: restaurant, taxi…); **Scan** opens the camera.
- **Conversation (live voice):** the local scans with WeChat or the camera, picks their language and taps **Join**
  (unlocks audio on iOS/WeChat). Either person taps the big mic once and speaks; recording stops after ~0.7 s of silence.
  Each turn: speech-to-text → Hao agent → Hao's voice on the *other* phone. Hao introduces itself, answers simple
  questions from your profile (*Hao may decide for me*), repeats prices back, and always checks with you about
  allergies, payments and anything over budget. Alerts, private notes and the order summary stay on your phone.
  One person talks at a time; rejoining restores captions; rooms close after 5 quiet minutes; what the local said and
  the final order are saved to Hao's memory.
- **Tour broadcast:** switch to *Tour broadcast* → *Start broadcast* → *Go live*. Each ~4–6 s chunk is transcribed once
  and translated once per language present (from channel presence); captions reach each listener in their language,
  in spoken order. Listeners can send questions, which appear in Chinese on the guide's phone.

### Run it
```bash
npx expo start --tunnel   # https link for the QR code (the guest's microphone needs https)
```
That's all: the QR link points at the dev server automatically. Without `--tunnel` the link is `http://<LAN-IP>:8081`,
which works for broadcast listeners on the same Wi-Fi but browsers block the microphone for conversation guests.

**Production:** deploy the web build and API routes with EAS Hosting (`npx expo export --platform web && npx eas-cli@latest deploy`),
set `EXPO_PUBLIC_WEB_URL` to the deployed URL (QR links) and the `origin` option of the `expo-router` plugin in
`app.json` (native API calls), and add `QWEN_API_KEY` to the hosting environment.

Supabase Realtime needs no setup beyond the defaults (public broadcast channels enabled). Room codes are 10 random
characters (≈ 49 bits), so channels can't be guessed. The old `server/` folder (Node WebSocket server) is no longer
used and can be deleted.

### Room speed

A conversation turn is tuned to get Hao talking about 4–5 s after the speaker stops (it was 7–8 s):

- Recording stops after 0.7 s of silence.
- The agent listens to the audio itself while a second call (`QWEN_AUDIO_MODEL`, default `qwen3.8-omni-flash`)
  transcribes it in parallel. The transcript is the caption and a guard: when it hears no speech, the agent's
  reply is dropped (a model that knows the conversation can otherwise "hear" a price in background noise).
- `/api/room/turn` streams NDJSON (`said` → `say` → `done`). Phones start speaking the line for the other person
  as soon as the model writes it; whispers, alerts and the order summary follow a moment later.
- Profile and memories load during transcription; verified sign-in tokens are cached for a minute.
- Each turn logs `[turn] stt=… say=… llm=…` in the Expo server console. `QWEN_ROOM_MODEL` picks the agent model for text turns; audio turns use `QWEN_AUDIO_MODEL`.

## Knowledge base

What Hao's agents know about living in China comes from the team doc **“Hao Knowledge Base: Newcomer Setup in China”**
(https://claude.ai/artifact/FQmoruBGhBvACB9GohpV8i), snapshotted in `knowledge/` (main guide + 175 embassies in Beijing,
doc revision of 2026-10-22).

- `npm run kb:build` turns `knowledge/*.md` into `shared/ai/knowledge/data.generated.ts`. Run it after updating the Markdown.
- Each request retrieves only the relevant sections (`shared/ai/knowledge/index.ts`, keyword/BM25 search, no extra service):
  Guide gets up to 3 sections, the interpreter 2, live room turns 1 small one (latency).
- When a question is about passports, arrests or emergencies, the user's embassy is added, using the country named in the
  question or found in their memories.
- `shared/ai/china-guide.ts` stays as a short always-on quick reference; the knowledge base takes priority.

## Discover (reels)

The Discover tab is a full-screen, swipe-up feed like reels, rebuilt every day (`src/lib/discover.ts`):
"Today in China" first (date, lunar date, festival or solar term, zodiac year, what's coming up), then the
culture, place, dish and phrase of the day, upcoming festivals, and every other place, dish and culture card,
in a different order each day. Hearts save places to the profile (Supabase) and dishes/culture on the device.
Cards show real photos (`assets/discover/`, mapped in `src/data/photos.ts`): freely licensed Wikimedia Commons
files, bundled in the app (≈4.4 MB) because Wikimedia is blocked in mainland China. Each card shows the credit;
the full list is `assets/discover/CREDITS.md`. Cards without a fitting photo keep the coloured design.
Content lives in `src/data/culture.ts`; lunar festival dates are listed per year, so add the next year's dates
each year.

## App languages

The whole app (screens, tips, places, dishes) shows in the language the user picks.

- English is written in the code: `t('Get started')` in components, `tx('…')` for text in lists and data
  (shown with `t(value)`). After changing text run `npm run i18n:build` to refresh `shared/i18n/catalog.generated.ts`.
- The first time anyone picks a language, `/api/ui-strings` has Qwen translate the catalog (≈25 s, one time),
  saves it in Supabase (`ui_translations`) and every later user gets it from the database. Phones also keep a
  copy, so a language loads instantly after the first time. A new or changed string is the only thing re-translated.
- Abuse-proof: the server only ever translates its own catalog (never text from the request), each language once;
  custom languages need a signed-in user (3 new ones per day). The table is read-only for clients; only the API
  writes it, with `SUPABASE_SECRET_KEY`. Without that key the endpoint refuses to translate rather than spending tokens.

## Maps on Android

iOS uses Apple Maps (works in China). Android draws the map with Leaflet in a WebView using Amap (高德) tiles,
because react-native-maps on Android needs Google Play services and a Google key and Google Maps doesn't load in
mainland China. Leaflet is bundled (`npm run map:build`), so nothing comes from a CDN. Works in Expo Go.

## HTTPS for QR links

Guests' phones only allow the microphone on https pages, and WeChat blocks or warns on http links, so the QR link
must be https. The QR page shows a warning when it isn't.

- Quick, in development: `npx expo start --tunnel` (the app detects the https tunnel URL), or run any https tunnel
  to port 8081 (e.g. `cloudflared tunnel --url http://localhost:8081`) and put its URL in `EXPO_PUBLIC_WEB_URL`.
- Production: deploy the web build and API routes to EAS Hosting (`npx expo export -p web` then
  `npx eas-cli@latest deploy --prod`), add the server env vars there (`QWEN_API_KEY`, `SUPABASE_SECRET_KEY`,
  `EXPO_PUBLIC_SUPABASE_*`), and set `EXPO_PUBLIC_WEB_URL` to the https URL it gives you.

## Next steps
- Android release builds need a Google Maps API key for `react-native-maps` (see Expo docs).
- Add Sign in with Apple / Google (Supabase supports both; needs a development build).
