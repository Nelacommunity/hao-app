# Hao knowledge base

Source of what Hao's AI agents know about living in China. Edited in the team doc
**“Hao Knowledge Base: Newcomer Setup in China”** (https://claude.ai/artifact/FQmoruBGhBvACB9GohpV8i).

- `newcomer-setup.md` — the main guide (one `##` section per topic).
- `embassies.md` — foreign embassies in Beijing (tables by region: Country | Phone | Address).

To update: export each doc tab as Markdown over these files (keep the `##` headings and table columns), then run

```bash
npm run kb:build
```

which regenerates `shared/ai/knowledge/data.generated.ts`. The API routes retrieve the most relevant sections for each
question, so the whole file is never sent to the model at once.
