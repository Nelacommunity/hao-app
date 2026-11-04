# Hao knowledge base

What Hao's AI agents know about living in China. At runtime it lives in Supabase, not in the app code:

| Table | Contents | Source file |
|---|---|---|
| `guide_sections` | Knowledge sections searched per question (`kind = 'section'`) and the quick reference sent with every Guide chat (`kind = 'reference'`) | `newcomer-setup.md`, `quick-reference.md` |
| `guide_embassies` | Foreign embassies in Beijing (SOS sheet, passport and emergency questions) | `embassies.md` |
| `guide_topics` | Topic chips in an empty Guide chat; `translations` is filled by the API server per language | `guide-topics.md` (Topics) |
| `guide_apps` | Apps Hao may suggest installing, with their store search term | `guide-topics.md` (Apps) |

The main guide is edited in the team doc **“Hao Knowledge Base: Newcomer Setup in China”**
(https://claude.ai/artifact/FQmoruBGhBvACB9GohpV8i). To update:

1. Export each doc tab as Markdown over these files (keep the `##` headings and table columns), or edit them directly.
2. Sync them into the database (needs `SUPABASE_SECRET_KEY` in `.env`):

```bash
npm run kb:push            # writes changed rows, removes rows no longer in the files
npm run kb:push -- --dry-run
```

No app release is needed: the API server reloads the guide every 5 minutes, and the app fetches topics, apps and
embassies from the database (keeping a copy on the device for offline use). Changing a topic's wording clears its
translations so they are made again. Run `npm run stories:facts` too if the culture, food or weather sections changed.
