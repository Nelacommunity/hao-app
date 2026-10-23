// Canned responses for testing rooms end-to-end without an API key (AI_PROVIDER=mock).
import type { AgentProvider, RoomAgentInput, RoomAgentTurn } from './types';

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
  };
}
