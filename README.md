# Hao 好 — China, made easy

Hao is an AI companion for foreigners living in or visiting China: it talks to locals for you, finds places that fit
you, guides you through setting up life in China, and remembers what matters, in your own language.

Built with Expo SDK 58 (iOS, Android and web), Expo Router API routes, Supabase and Qwen (Alibaba Cloud Model Studio).

## What it does

| Tab / screen | What you get |
|---|---|
| **Discover** | A swipe-up feed of AI-written stories about your city (culture, places, food, festivals, paintings, "your country and China"), mixed with real nearby places and a phrase of the day. Quizzes, "Tried it / Want to try", read or listen mode, likes and sharing. |
| **Ask Hao** | One chat with four modes. **Places**: "halal noodles near me" → real AMap results ranked for you and for people from your country, as cards with Navigate, Talk to staff and Save. **Guide**: step-by-step checklists for WeChat, Alipay, SIM cards, banks, trains, hotel registration and more. **Interpret**: Hao talks to a local in Mandarin for you. **Memory**: "what did the taxi driver say about the fare?" |
| **QR rooms** | A local scans your QR code with WeChat or their camera, with no app or account. Live voice conversation, with Hao translating each turn aloud on the other person's phone, or a captioned tour broadcast to many listeners. |
| **Explore** | Map with places around you (AMap, or Mapbox for travellers who don't read Chinese), routes, and hand-off to AMap / Apple Maps / DiDi. |
| **My Places** | Everywhere you've eaten, visited and stayed, with ratings and tags, and where you want to go next. |
| **Me** | Your **Hao DNA**, built by chatting (nationality, diet, allergies, spice, budget, loves, wants), Hao's memory, contact details you can choose to share in a conversation, language, theme and account. |

The whole app is available in any language the user picks.

## Architecture

```
app (Expo Router, iOS / Android / web)
 ├─ Supabase Auth + Postgres (RLS on every table) + Realtime (QR rooms) + Storage
 └─ Expo Router API routes (src/app/api, EAS Hosting) ── Qwen · AMap
Supabase Edge Function generate-stories (nightly, pg_cron) ── Qwen · AMap · Wikipedia
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
Required: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_KEY`, `SUPABASE_SECRET_KEY`, `QWEN_API_KEY`, `AMAP_KEY`.
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
| `scripts/` | Build steps (`kb:build`, `i18n:build`, `map:build`, `stories:facts`), seeding, and VPS tools |

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
AMap (高德) tiles drawn with Leaflet in a WebView: loads in mainland China, needs no Google Play services. With
`EXPO_PUBLIC_MAPBOX_TOKEN`, travellers who don't read Chinese get Mapbox with labels in their language.
Coordinates are converted between GCJ-02 and WGS-84 so pins line up.

## Checks
```bash
npx tsc --noEmit && npx expo lint
npm run test:ranking && npm run test:twin && npm run test:stories
```
