# Hao 好 — China, made easy

Hao is an AI companion for foreigners living in or visiting China: it talks to locals for you, finds places that fit
you, guides you through setting up life in China, and remembers what matters, in your own language.

Built with Expo SDK 58 (iOS, Android and web), Expo Router API routes, Supabase and Qwen (Alibaba Cloud Model Studio).

## What it does

| Tab / screen | What you get |
|---|---|
| **Discover** | A swipe-up feed of AI-written stories about your city (culture, places, food, festivals, paintings, "your country and China"), mixed with real nearby places and a phrase of the day. Quizzes, "Tried it / Want to try", read or listen mode, likes and sharing. |
| **Ask Hao** | One chat with four modes. **Places**: "halal noodles near me" → real AMap results ranked for you and for people from your country, as cards with Navigate, Talk to staff and Save; "plan my Saturday in Chengdu" → a day of sights and meals on a Mapbox map with the walk between them; "make my trip journal" → your visits on a map, ready to share; 📷 photograph a menu or sign → every dish translated with price and spice, and a warning on anything that clashes with your diet or allergies. **Guide**: step-by-step checklists for WeChat, Alipay, SIM cards, banks, trains, hotel registration and more, and "is ¥80 fair for this taxi?" checked against normal prices and known scams. **Interpret**: Hao talks to a local in Mandarin for you. **Memory**: "what did the taxi driver say about the fare?" |
| **SOS** | One button in Ask Hao: tap to call 110 / 120 / 119 / 122, your location in Chinese to read or play to the operator, your embassy and help phrases. Works offline. |
| **QR rooms** | A local scans your QR code with WeChat or their camera, with no app or account. Live voice conversation, with Hao translating each turn aloud on the other person's phone, or a captioned tour broadcast to many listeners. |
| **Explore** | A Mapbox map in your language with places around you, turn-by-turn routes (Mapbox Directions), and hand-off to the AMap, Apple Maps or DiDi apps. |
| **My Places** | Everywhere you've eaten, visited and stayed, with ratings and tags, and where you want to go next. Kept on the phone, so it opens without signal. |
| **Me** | Your **Hao DNA**, built by chatting (nationality, diet, allergies, spice, budget, loves, wants), Hao's memory, contact details you can choose to share in a conversation, language, theme and account. |

The whole app is available in any language the user picks.

## Architecture

```
app (Expo Router, iOS / Android / web)
 ├─ Map: Mapbox GL JS (WebView / iframe) ── Mapbox tiles, labels in the traveller's language
 ├─ Supabase Auth + Postgres (RLS on every table) + Realtime (QR rooms) + Storage
 └─ Expo Router API routes (src/app/api, EAS Hosting)
     ├─ /api/route, /api/where ── Mapbox (Directions, Geocoding)
     ├─ /api/places, /api/search-places ── AMap place search (data only, no AMap map)
     └─ AI routes ── Qwen
Supabase Edge Function generate-stories (nightly, pg_cron) ── Qwen · AMap places · Wikipedia
```

- **AI** (`shared/ai`): every model call goes through one provider (`createProvider`). `agent.ts` holds the prompts
  and validates every reply; `qwen.ts` is the transport. Text uses `qwen3.8-flash` with strict JSON schemas, speech
  uses `qwen3.8-omni-flash`, voice uses `qwen3-tts-flash`, story illustrations use `qwen-image-3.0-pro`.
- **Keys stay on the server**: the app only calls its own API routes, which check the Supabase session first.
- **Knowledge**: answers are grounded in a reviewed knowledge base (`knowledge/`, BM25 retrieval in
  `shared/ai/knowledge`), including 175 embassies for emergencies.

## Setup

### 1. Supabase
Hosted project:
```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npm run db:push                       # applies supabase/migrations
```
Local: `npm run db:start` uses `supabase/config.toml`. Self-hosted on a VPS: see `scripts/vps/README.md`.

Auth emails (the 6-digit sign-up and password-reset codes, `supabase/templates/`) are sent through Resend's SMTP:
set `RESEND_API_KEY` and `AUTH_EMAIL_FROM` (see `.env.example`). Minimum password length is 8.

### 2. Environment
```bash
cp .env.example .env
```
Required: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_KEY`, `SUPABASE_SECRET_KEY`, `QWEN_API_KEY`, `AMAP_KEY`, `EXPO_PUBLIC_MAPBOX_TOKEN`.
Everything else is optional and explained in `.env.example`.

### 3. Run
```bash
npm install
npm start                    # or: npx expo start --tunnel, for https QR links (guests' microphones need https)
```

### 4. Ship
```bash
npx expo export --platform web && npx eas-cli@latest deploy --prod --environment production   # web + API routes
npx eas-cli@latest build -p android --profile preview                                         # Android APK
```
Set the server variables (`QWEN_API_KEY`, `SUPABASE_SECRET_KEY`, `AMAP_KEY`) in the EAS `production` environment,
`EXPO_PUBLIC_WEB_URL` to the deployed URL, and the `origin` of the `expo-router` plugin in `app.json` to it too.

## Project structure

| Path | Contents |
|---|---|
| `src/app` | Screens (Expo Router) and `api/` server routes |
| `src/components`, `src/lib` | UI components; client logic (auth, chats, places, rooms, i18n) and `lib/server` for API routes |
| `shared/` | Code shared by the app, the API and the Edge Function: AI provider and prompts, places ranking, stories, rooms protocol, i18n catalog |
| `supabase/` | Migrations, Edge Function, auth email templates, local config |
| `public/join` | The QR guest page (plain JS, no app needed) |
| `knowledge/` | The knowledge base Hao answers from |
| `scripts/` | Build steps (`kb:build`, `i18n:build`, `stories:facts`), seeding, and VPS tools |

## How it works

### Auth
`src/lib/auth.tsx` provides the session and profile; `src/app/_layout.tsx` guards routes with `Stack.Protected`.
Sign-up → 6-digit email code (`verify`) · sign-in (email + password) · forgot password → code → new password ·
Me → change password · delete account (required by the App Store and Google Play).

### QR rooms
Rooms run on Supabase Realtime (broadcast + presence), with no separate server. The host's phone keeps the room's
state and calls the AI through `/api/room/*`; guests open `public/join.html` from the QR code. Room codes are 10
random characters (≈ 49 bits). A conversation turn gets Hao speaking about 4–5 s after the speaker stops:
recording ends after 0.7 s of silence, the agent listens to the audio while a parallel call transcribes it (the
transcript is the caption and a guard against "hearing" prices in noise), and `/api/room/turn` streams the line to
speak before the rest of the turn. Each turn logs `[turn] stt=… say=… llm=…` in the server console.

### Discover stories
The `generate-stories` Edge Function writes each night's stories per city and language from verified facts
(AMap places, Wikipedia, `src/data/*`), validates them, and queues sensitive types for review in the admin screen.
Feed and events are API routes (`/api/discover-feed`).

### App languages
English lives in the code (`t('…')`, `tx('…')`); `npm run i18n:build` refreshes the catalog. The first time anyone
picks a language, `/api/ui-strings` translates the catalog once and stores it in Supabase (`ui_translations`) for
everyone. The server only translates its own catalog, never text from the request.

### Maps
Mapbox is the app's map system. The map is Mapbox GL JS with the Standard style in a WebView (an iframe on web),
driven by `src/components/map/` and labelled in the traveller's language (Simplified or Traditional Chinese for
Chinese readers). It needs no Google Play services or native map SDK and runs in Expo Go. Street routes with
turn-by-turn steps (`/api/route`) and the city Hao detects from GPS (`/api/where`) come from Mapbox too.
`EXPO_PUBLIC_MAPBOX_TOKEN` (a public `pk.…` token) is required, both in the app and on the server.

AMap is used only as a place database (search and details, `src/lib/server/amap.ts`), because Mapbox has very
little place data in mainland China. Its places are in GCJ-02, so `src/lib/china-coords.ts` converts them to
WGS-84 before they go on the Mapbox map, and routes back again, so pins and route lines line up.

## Checks
```bash
npx tsc --noEmit && npx expo lint
npm run test:ranking && npm run test:twin && npm run test:stories
```

## License

Copyright © 2026 Brown Mafuru (team leader), Alpha Tito, Walter Kennedy, Daniel Verheij and Prince Limu,
Dalian Neusoft University of Information. Anyone outside the team needs written approval from the team leader to
clone, use or share the code, and it may not be used commercially without the team's approval. See `LICENSE`
(English and Chinese). Third-party components keep their own licences.
