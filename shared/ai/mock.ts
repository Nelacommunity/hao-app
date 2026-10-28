// Canned responses for testing rooms end-to-end without an API key (AI_PROVIDER=mock).
import type { AgentProvider, RoomAgentInput, RoomAgentTurn } from './types';
import { emptyTwinUpdates, twinMissing } from './twin';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function mockProvider(): AgentProvider {
  let chunk = 0;
  return {
    name: 'mock',
    async soloTurn(input) {
      await wait(300);
      return {
        heard: input.text ?? '(audio)',
        heard_translation: '',
        goal: 'Test conversation',
        say_to_local_zh: '您好，请问地铁站在哪里？',
        say_to_local_pinyin: 'nín hǎo, qǐngwèn dìtiě zhàn zài nǎlǐ?',
        say_to_local_gloss: 'Hello, where is the subway station?',
        tell_traveller: 'I asked where the subway station is.',
        key_points: [],
        next_speaker: 'local',
        status: 'in_progress',
        memories: [],
      };
    },
    async transcribeAndTranslate({ targets }) {
      await wait(600 + Math.random() * 900);
      chunk += 1;
      const transcript = `第${chunk}句：这里是故宫的太和殿。`;
      return {
        transcript,
        translations: Object.fromEntries(targets.map((t) => [t.code, `[${t.code}] Sentence ${chunk}: this is the Hall of Supreme Harmony.`])),
      };
    },
    async guideTurn(input) {
      await wait(400);
      const wechat = input.tasks.find((t) => t.id === 'wechat-setup');
      if (!wechat) {
        return {
          reply: 'Let’s set up WeChat together. First, install WeChat and open it. Tell me when you see the sign-up screen.',
          task_id: 'wechat-setup',
          task_title: 'Set up WeChat',
          task_steps: [
            { title: 'Install WeChat', detail: 'Download it from your app store.' },
            { title: 'Sign up with your phone number', detail: 'Foreign numbers usually work.' },
            { title: 'Pass the security check', detail: 'An existing user scans a QR code to verify you.' },
            { title: 'Add a payment card', detail: 'Wallet → Bank Cards → add your Visa/Mastercard.' },
          ],
          step_updates: [{ task_id: 'wechat-setup', step_index: 0, status: 'doing' }],
          quick_replies: ['Done', 'I’m stuck'],
          phrase_zh: '',
          phrase_pinyin: '',
          phrase_meaning: '',
          apps: ['wechat'],
          handoff_goal: '',
          memories: [],
        };
      }
      const next = wechat.steps.findIndex((s) => s.status !== 'done');
      return {
        reply: next === 2 ? 'For the security check, ask hotel staff to scan your QR code.' : 'Great, on to the next step.',
        task_id: '',
        task_title: '',
        task_steps: [],
        step_updates: next >= 0 ? [{ task_id: 'wechat-setup', step_index: next, status: 'done' }] : [],
        quick_replies: ['Done', 'What’s next?'],
        phrase_zh: next === 2 ? '您好，可以帮我扫一下微信二维码验证吗？' : '',
        phrase_pinyin: next === 2 ? 'Nín hǎo, kěyǐ bāng wǒ sǎo yíxià Wēixìn èrwéimǎ yànzhèng ma?' : '',
        phrase_meaning: next === 2 ? 'Hello, could you scan my WeChat QR code to verify me?' : '',
        apps: [],
        handoff_goal: next === 2 ? 'Ask the front desk to scan my WeChat QR code to verify my new account' : '',
        memories: [],
      };
    },

    async memoryTurn(input) {
      await wait(300);
      const hit = input.memories.find((m) => input.question.toLowerCase().split(/\W+/).some((w) => w.length > 3 && m.content.toLowerCase().includes(w)));
      return hit
        ? { answer: `You noted: ${hit.content}`, cited_ids: [hit.id], new_memories: [] }
        : { answer: 'I don’t remember that yet.', cited_ids: [], new_memories: [] };
    },

    async placesPlan(input) {
      await wait(250);
      const text = input.text.toLowerCase();
      const dna = emptyTwinUpdates();
      if (/\bi (love|like)\b/.test(text)) dna.loves_add = [input.text.replace(/^.*\bi (love|like)\s+/i, '').slice(0, 60)];
      if (/\bi want to\b/.test(text)) dna.wants_add = [input.text.replace(/^.*\bi want to\s+/i, '').slice(0, 80)];
      const base = { query: '', category: '' as const, near: '', filters: [], place_ref: 0, place_name: '', rating: 0, tags: [], scope: '' as const, days: 0, dna, reply: '', quick_replies: [] };
      if (/people from my country|where do .* (eat|go)|weekend|holiday/.test(text)) {
        return { ...base, tool: 'community_picks', category: /hotel/.test(text) ? 'hotel' : /weekend|holiday|trip/.test(text) ? 'attraction' : 'food', scope: /weekend|holiday|trip/.test(text) ? 'anywhere' : 'nearby' };
      }
      if (/\b(went|visited|been to|had (lunch|dinner))\b/.test(text)) {
        const ref = input.shown.length ? input.shown[0].ref : 0;
        return { ...base, tool: 'log_visit', place_ref: ref, place_name: ref ? '' : input.text, rating: /\b(love|liked|great)\b/.test(text) ? 1 : 0, reply: 'Nice! I’ll remember it.' };
      }
      if (/\bplan (my|a)\b|itinerary/.test(text)) return { ...base, tool: 'plan_day', query: /temple/.test(text) ? '寺庙' : '' };
      if (/journal|recap|summary of my/.test(text)) return { ...base, tool: 'trip_journal', days: /week/.test(text) ? 7 : 30 };
      if (/\bmy (places|food)|where have i been\b/.test(text)) return { ...base, tool: 'get_my_places', category: /food/.test(text) ? 'food' : '' };
      if (/\bsave\b/.test(text) && input.shown.length) return { ...base, tool: 'save_place', place_ref: input.shown[0].ref, reply: 'Saved to Want to go.' };
      if (/^(hi|hello|thanks|thank you)\b/.test(text)) return { ...base, tool: 'none', reply: 'Hi! Ask me for food or places near you.', quick_replies: ['Food near me'] };
      const food = /food|eat|restaurant|lunch|dinner|noodle|halal|hungry/.test(text);
      return {
        ...base,
        tool: 'search_places',
        category: food ? 'food' : 'attraction',
        filters: /halal/.test(text) ? ['halal'] : [],
        quick_replies: ['Cheaper options', 'Save the first one'],
      };
    },

    async twinTurn(input) {
      await wait(250);
      // Scripted: confirm what was detected, then ask for the next missing thing.
      const updates = emptyTwinUpdates();
      const said = input.text.toLowerCase();
      const missing = twinMissing(input.profile);
      if (missing[0] === 'nationality' && input.detected.nationality && /^(yes|yeah|right|correct)/.test(said)) updates.nationality = input.detected.nationality;
      if (/student/.test(said)) updates.traveller_type = 'student';
      if (/tourist/.test(said)) updates.traveller_type = 'tourist';
      if (/halal/.test(said)) updates.diet_add = ['halal'];
      if (/vegetarian/.test(said)) updates.diet_add = ['vegetarian'];
      if (/peanut/.test(said)) updates.allergies_add = ['peanuts'];
      if (/night market|street food|temple|hotpot/.test(said)) updates.loves_add = [input.text.trim()];
      const next = missing.find((m) => !(m === 'nationality' && updates.nationality) && !(m === 'traveller_type' && updates.traveller_type));
      const questions: Record<string, { reply: string; quick_replies: string[] }> = {
        nationality: {
          reply: input.detected.nationality ? `Looks like you're from ${input.detected.nationality}. Right?` : 'Where are you from?',
          quick_replies: input.detected.nationality ? ['Yes', 'No'] : [],
        },
        traveller_type: { reply: 'Are you studying in China or visiting?', quick_replies: ['Student', 'Tourist'] },
        diet: { reply: 'Any diet I should follow?', quick_replies: ['Halal', 'Vegetarian', 'No restrictions'] },
        allergies: { reply: 'Any food allergies?', quick_replies: ['Peanuts', 'Shellfish', 'None'] },
        spice: { reply: 'How spicy do you like it?', quick_replies: ['No spice', 'Mild', 'Hot'] },
        budget: { reply: 'What do you usually spend on a meal?', quick_replies: ['Under ¥40', '¥40–120', 'More'] },
        loves: { reply: 'What do you love doing or eating?', quick_replies: ['Street food', 'Night markets', 'Temples'] },
      };
      const q = next ? questions[next] : null;
      return q ? { ...q, updates, done: false } : { reply: 'Thanks! Talk to me from Me any time to change this.', quick_replies: [], updates, done: true };
    },

    async explain({ title }) {
      await wait(200);
      return { text: `${title}. This is a mock explanation from Hao: a short spoken story about what it is, why it matters in China, and one tip for your visit.` };
    },

    async summarizeConversation(input) {
      await wait(200);
      const first = input.lines.find((l) => l.speaker === 'USER')?.text ?? '';
      return {
        title: input.context ? `At the ${input.context.toLowerCase()}` : 'A conversation',
        summary: first ? `You said: “${first.slice(0, 120)}”.` : 'A short conversation.',
        learned: [],
        memories: [],
        dna: emptyTwinUpdates(),
      };
    },

        async placesReply(input) {
      await wait(200);
      const first = /^1\. ([^\n—]+)/m.exec(input.results)?.[1]?.trim();
      return {
        reply: first ? `My top pick is ${first}. Tap a card to navigate or save it.` : 'I couldn’t find anything for that. Try another search?',
        quick_replies: ['Cheaper options', 'Something else'],
      };
    },

    async readImage() {
      await wait(300);
      return {
        kind: 'menu' as const,
        title: 'Noodle shop menu',
        summary: 'A small noodle shop, most dishes ¥18–35.',
        items: [
          { zh: '牛肉面', name: 'Beef noodle soup', price: '¥22', spicy: 1, contains: ['beef', 'wheat noodles'], warning: '' },
          { zh: '红烧肉', name: 'Braised pork belly', price: '¥38', spicy: 0, contains: ['pork'], warning: 'Contains pork' },
        ],
        picks: ['Beef noodle soup'],
      };
    },

    async transcribe({ audio }) {
      await wait(150);
      // Tests send the transcript as base64 text; empty clips stand for silence.
      const text = (() => {
        try {
          return atob(audio.data).startsWith('TEXT:') ? atob(audio.data).slice(5) : '';
        } catch {
          return '';
        }
      })();
      return { text, language: /[\u4e00-\u9fff]/.test(text) ? 'Chinese' : 'English' };
    },

    async roomAgentTurn(input, onSay) {
      const turn = await mockRoomTurn(input);
      // Like a streamed reply: the spoken line arrives before the rest.
      if (turn.say_to_other) onSay?.(turn.say_to_other);
      await wait(150);
      return turn;
    },

    async synthesize() {
      return null;
    },

    async translate({ text }) {
      await wait(200);
      return { text: `（翻译）${text}`, detectedLanguage: 'English' };
    },

    async translateUi({ strings, target }) {
      await wait(100);
      return strings.map((s) => `[${target.code}] ${s}`);
    },
    async translatePlaces({ places, target }) {
      await wait(100);
      return places.map((p) => ({ ...p, name: `[${target.code}] ${p.name}` }));
    },
  };
}

async function mockRoomTurn(input: RoomAgentInput): Promise<RoomAgentTurn> {
  await wait(200);
  const intro = input.introduced ? '' : `你好，我是Hao，帮${input.userName}翻译。`;
  if (input.speaker === 'USER') {
    return {
      say_to_other: `${intro}（${input.said}）请问有没有花生？`,
      say_to_speaker: '',
      whisper_to_user: '',
      alert: { type: null, message: '' },
      agent_answered_itself: false,
      summary_update: { title: 'Order', items: ['Kung Pao chicken ×1 (no peanuts)'], total: '' },
      memories: [],
      contact_request: null,
    };
  }
  const price = /(\d+)/.exec(input.said)?.[1];
  return {
    say_to_other: price ? `They said it costs ¥${price}.` : `They said: ${input.said}`,
    say_to_speaker: price ? `你说的是${price}块，对吗？` : '',
    whisper_to_user: price ? 'I asked them to confirm the price.' : '',
    alert: price && Number(price) > 100 ? { type: 'budget', message: `¥${price} is above your budget.` } : { type: null, message: '' },
    agent_answered_itself: false,
    summary_update: price ? { title: 'Order', items: ['Kung Pao chicken ×1 (no peanuts)'], total: `¥${price}` } : null,
    memories: price ? [{ kind: 'said', text: `The restaurant said the order costs ¥${price}` }] : [],
    contact_request: /电话|手机号|号码/.test(input.said) ? 'phone' : /邮箱|email/i.test(input.said) ? 'email' : null,
  };
}
