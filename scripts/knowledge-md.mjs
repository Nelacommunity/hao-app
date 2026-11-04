// Reads the guide's Markdown sources in knowledge/ into rows for the guide_* tables.
// Used by push-knowledge.mjs (writes them to Supabase) and build-story-facts.mjs.
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8').replace(/\r\n/g, '\n');
const slug = (title) => title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** `##` blocks of a file as { title, body }. */
function blocks(text) {
  const out = [];
  for (const block of text.split(/^(?=## )/m).slice(1)) {
    const [heading, ...rest] = block.split('\n');
    out.push({ title: heading.replace(/^##\s+/, '').trim(), body: rest.join('\n').trim() });
  }
  return out;
}

/** Rows of every Markdown table in `text`, header row and separator dropped. */
function tableRows(text, columns) {
  const rows = [];
  for (const line of text.split('\n')) {
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length !== columns || /^-+$/.test(cells[0])) continue;
    rows.push(cells);
  }
  return rows.slice(1);
}

export function readKnowledge() {
  // Retrieval sections: one per `##` heading of the main guide, searched per question.
  const sections = blocks(read('knowledge/newcomer-setup.md'))
    .filter((b) => b.body)
    .map((b, i) => ({ id: slug(b.title), title: b.title, body: b.body, kind: 'section', position: i }));
  // The quick reference goes into every Guide system prompt instead of being searched.
  const reference = blocks(read('knowledge/quick-reference.md')).find((b) => b.title === 'Quick reference');
  if (reference?.body) sections.push({ id: 'quick-reference', title: reference.title, body: reference.body, kind: 'reference', position: sections.length });

  const embassies = [];
  let region = '';
  for (const line of read('knowledge/embassies.md').split('\n')) {
    const h = line.match(/^##\s+(.+)/);
    if (h) region = h[1].trim();
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (region && cells.length === 3 && cells[0] !== 'Country' && !/^-+$/.test(cells[0])) {
      embassies.push({ country: cells[0], phone: cells[1], address: cells[2], region });
    }
  }

  const guide = Object.fromEntries(blocks(read('knowledge/guide-topics.md')).map((b) => [b.title, b.body]));
  const topics = tableRows(guide.Topics ?? '', 4).map(([id, emoji, title, starter], position) => ({ id, emoji, title, starter, position }));
  const apps = tableRows(guide.Apps ?? '', 3).map(([id, name, store_search], position) => ({ id, name, store_search, position }));

  if (sections.length < 10 || embassies.length < 100 || !topics.length || !apps.length) {
    throw new Error(
      `Unexpected knowledge files: ${sections.length} sections, ${embassies.length} embassies, ${topics.length} topics, ${apps.length} apps`
    );
  }
  return { sections, embassies, topics, apps };
}
