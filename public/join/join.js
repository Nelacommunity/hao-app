// Hao join page: vanilla JS, no build step. Speaks the protocol in shared/rooms/protocol.ts.
// All model output is rendered with textContent, never innerHTML.
(function () {
  'use strict';

  var app = document.getElementById('app');
  var statusEl = document.getElementById('status');
  var toastEl = document.getElementById('toast');
  var subEl = document.getElementById('brand-sub');
  // Rooms run on Supabase Realtime; the host's phone acts as the room. The link carries the code and type.
  var query = new URLSearchParams(location.search);
  var roomId = (query.get('r') || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  var roomType = query.get('t') === 'b' ? 'broadcast' : query.get('t') === 'c' ? 'conversation' : null;
  var sb = null; // Supabase client, created at boot from /api/public-config

  // ─── Small helpers ─────────────────────────────────────────────────────────
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') node.textContent = attrs[k];
      else if (k === 'class') node.className = attrs[k];
      else if (k.indexOf('on') === 0) node.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== false && attrs[k] != null) node.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
    });
    (children || []).forEach(function (c) {
      if (c) node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  // Line icons in the app's style. The markup is fixed here (never model output), so innerHTML is safe.
  var ICONS = {
    mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><path d="M12 19v3"/>',
    micOff: '<path d="M2 2l20 20"/><path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2"/><path d="M5 10v2a7 7 0 0 0 12 5"/><path d="M15 9.34V5a3 3 0 0 0-5.68-1.33"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12"/><path d="M12 19v3"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor" stroke="none"/>',
    volume: '<path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>',
    keyboard: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 13h.01M18 13h.01M10 13h4M7 16h10"/>',
    close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    send: '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
    chevronRight: '<path d="m9 18 6-6-6-6"/>',
    chevronDown: '<path d="m6 9 6 6 6-6"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
    alert: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
    check: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 12h10"/>',
    question: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  };
  function icon(name) {
    var span = el('span', { class: 'icon', 'aria-hidden': 'true' });
    span.innerHTML = '<svg viewBox="0 0 24 24">' + ICONS[name] + '</svg>';
    return span;
  }
  function dots() {
    return el('span', { class: 'typing', 'aria-hidden': 'true' }, [el('span'), el('span'), el('span')]);
  }

  /** `chat` pages fill the screen edge to edge (thread + dock); the rest are padded forms. */
  function render(children, chat) {
    app.className = chat ? 'app chat' : 'app';
    app.replaceChildren.apply(app, children);
  }
  var toastTimer;
  function toast(text) {
    if (!text) return;
    toastEl.textContent = text;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.hidden = true;
    }, 3500);
  }
  function setStatus(text, offline) {
    statusEl.hidden = !text;
    statusEl.textContent = text || '';
    statusEl.classList.toggle('offline', !!offline);
  }
  function setSub(text) {
    subEl.textContent = text;
  }
  function store(key, value) {
    try {
      if (value === undefined) return localStorage.getItem(key);
      localStorage.setItem(key, value);
    } catch (e) {
      return null;
    }
  }
  function participantId() {
    var key = 'hao:pid:' + roomId;
    var id = store(key);
    if (!id) {
      id = (crypto.randomUUID && crypto.randomUUID()) || String(Date.now()) + Math.random().toString(16).slice(2);
      store(key, id);
    }
    return id;
  }

  // Speech synthesis must be unlocked by a user gesture on iOS.
  function unlockSpeech() {
    if (!('speechSynthesis' in window)) return;
    var u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    speechSynthesis.speak(u);
  }
  function speak(text, lang) {
    if (!text || !('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.rate = 0.95;
    speechSynthesis.speak(u);
  }

  // ─── Room channel (Supabase Realtime broadcast + presence) ─────────────────
  // Host → guests: event "srv" with { to, msg }. Guest → host: event "cli" with { from, role, language, msg }.
  function connect(params, handlers) {
    var p = params();
    var myLang = p.lang ? { code: p.lang, name: p.langName } : undefined;
    var myName = p.name || undefined;
    var stopped = false;
    var hostHere = false;
    var expiryTimer = null;
    var channel = sb.channel('hao-room-' + roomId, { config: { broadcast: { self: false }, presence: { key: p.pid } } });

    function forMe(to) {
      if (to === 'all') return true;
      if (to === 'local') return p.role === 'local';
      if (to === 'listeners') return p.role === 'listener';
      if (to && to.pid) return to.pid === p.pid;
      if (to && to.lang) return p.role === 'listener' && !!myLang && to.lang === myLang.code;
      return false;
    }
    function sendRaw(msg) {
      return channel.send({ type: 'broadcast', event: 'cli', payload: { from: p.pid, role: p.role, language: myLang, name: myName, msg: msg } });
    }
    function track() {
      channel.track({ pid: p.pid, role: p.role, language: myLang, name: myName, at: Date.now() });
    }

    channel.on('broadcast', { event: 'srv' }, function (event) {
      var env = event.payload;
      if (stopped || !env || !forMe(env.to)) return;
      var msg = env.msg;
      if (msg.t === 'ended' || (msg.t === 'error' && (msg.code === 'room_not_found' || msg.code === 'room_full'))) stopped = true;
      handlers.onMessage(msg);
    });
    channel.on('presence', { event: 'sync' }, function () {
      var state = channel.presenceState();
      var hostName = '';
      var host = Object.keys(state).some(function (k) {
        return state[k].some(function (m) {
          if (m.role === 'host' && m.name) hostName = String(m.name).slice(0, 24);
          return m.role === 'host';
        });
      });
      if (host && !hostHere) {
        clearTimeout(expiryTimer);
        sendRaw({ t: 'hello' }); // (re)introduce ourselves whenever the host (re)appears
      }
      hostHere = host;
      if (!stopped) handlers.onStatus(host, hostName);
    });
    channel.subscribe(function (status) {
      if (status === 'SUBSCRIBED') {
        track();
        // No host phone in the room for a while: the room is gone (or never existed).
        expiryTimer = setTimeout(function () {
          if (!hostHere && !stopped) {
            stopped = true;
            handlers.onMessage({ t: 'error', code: 'room_not_found', message: '' });
          }
        }, 8000);
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        if (!stopped) handlers.onStatus(false);
      }
    });

    return {
      /** Resolves to 'ok' when Realtime accepted the message ('error' or 'timed out' otherwise). */
      send: function (msg) {
        if (msg.t === 'set_language' && msg.language) {
          myLang = msg.language;
          track();
        }
        return Promise.resolve(sendRaw(msg)).catch(function () { return 'error'; });
      },
      close: function () {
        stopped = true;
        sb.removeChannel(channel);
      },
    };
  }

  /** For typed-in codes: read the room type from the host's presence. */
  function detectType(done) {
    var channel = sb.channel('hao-room-' + roomId, { config: { presence: { key: 'probe-' + Date.now() } } });
    var timer = setTimeout(function () { sb.removeChannel(channel); done(null); }, 8000);
    channel.on('presence', { event: 'sync' }, function () {
      var state = channel.presenceState();
      Object.keys(state).forEach(function (k) {
        state[k].forEach(function (m) {
          if (m.role === 'host' && m.type) {
            clearTimeout(timer);
            sb.removeChannel(channel);
            done(m.type);
          }
        });
      });
    });
    channel.subscribe();
  }

  // ─── Shared screens ────────────────────────────────────────────────────────
  function showState(iconName, title, body, ok, action) {
    render([
      el('div', { class: 'center' }, [
        el('div', { class: 'state-icon' + (ok ? ' ok' : '') }, [icon(iconName)]),
        el('h1', { text: title }),
        body ? el('p', { class: 'lead', text: body }) : null,
        action || null,
      ]),
    ]);
  }
  function showEnded(title, body, iconName) {
    setStatus('');
    showState(iconName || 'check', title, body, !iconName);
  }
  function showExpired() {
    showEnded('房间不存在或已过期', 'This room has ended or expired. 请让对方重新生成二维码 · Ask for a new QR code.', 'clock');
  }
  function showCodeEntry() {
    var input = el('input', { class: 'code-input', maxlength: '16', autocomplete: 'off', placeholder: 'ABCD…', 'aria-label': 'Room code' });
    function go() {
      var code = input.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      if (code.length >= 4) location.href = '/join.html?r=' + code;
    }
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') go();
    });
    showState('scan', '输入房间码', 'Enter the room code shown on the Hao app.', true,
      el('div', { style: 'display:flex;flex-direction:column;align-items:center;gap:12px;width:100%' }, [
        input,
        el('button', { class: 'btn', text: '加入 · Join', onclick: go }),
      ]));
  }

  /** A language list: native name, English name, chevron. */
  function languageList(languages, onChoose) {
    return el('div', { class: 'list' }, languages.map(function (l) {
      return el('button', { class: 'lang', type: 'button', onclick: function () { onChoose(l); } }, [
        el('span', { class: 'lang-text', dir: l.rtl ? 'rtl' : 'ltr' }, [el('span', { text: l.native }), el('small', { text: l.name })]),
        icon('chevronRight'),
      ]);
    }));
  }

  // ─── Mode 1: conversation (the local person) ───────────────────────────────
  // Flow: pick language → name + Join (unlocks audio + mic) → tap the circle once, speak; recording stops
  // after a short pause (~0.7 s) → Hao answers with its voice. No alerts, whispers or summary on this page.
  var GUEST_LANGUAGES = [
    { code: 'zh', name: 'Mandarin Chinese', native: '简体中文', speech: 'zh-CN', ui: 'zh' },
    { code: 'zh-TW', name: 'Traditional Chinese (Mandarin)', native: '繁體中文', speech: 'zh-TW', ui: 'zh' },
    { code: 'yue', name: 'Cantonese', native: '粵語', speech: 'zh-HK', ui: 'zh' },
    { code: 'en', name: 'English', native: 'English', speech: 'en-US', ui: 'en' },
    { code: 'ja', name: 'Japanese', native: '日本語', speech: 'ja-JP', ui: 'en' },
    { code: 'ko', name: 'Korean', native: '한국어', speech: 'ko-KR', ui: 'en' },
    { code: 'ru', name: 'Russian', native: 'Русский', speech: 'ru-RU', ui: 'en' },
    { code: 'ar', name: 'Arabic', native: 'العربية', speech: 'ar-SA', ui: 'en', rtl: true },
    { code: 'fr', name: 'French', native: 'Français', speech: 'fr-FR', ui: 'en' },
    { code: 'es', name: 'Spanish', native: 'Español', speech: 'es-ES', ui: 'en' },
  ];

  var CONV_TEXT = {
    zh: {
      sub: '实时翻译', hello: '您好！', intro: '一位外国朋友想和您聊聊。Hao 会帮你们实时翻译。',
      consent: '本次对话由 AI 实时翻译，您的语音仅用于翻译。', join: '加入对话', tap: '点击说话', listening: '正在听… 说完会自动发送',
      sending: '正在发送…', thinking: 'Hao 正在翻译…', speaking: 'Hao 正在说话…', other: '对方正在说话…', notHeard: '没听清，请再点一次说话',
      micTitle: '需要麦克风', micDenied: '无法使用麦克风。请在浏览器设置中允许麦克风权限，然后重试。',
      https: '此链接不是安全连接（HTTPS），浏览器不允许使用麦克风。请让对方使用 HTTPS 链接。', retry: '重试',
      connected: '已连接', reconnecting: '重新连接中…', ended: '对话已结束', thanks: '谢谢您的帮助！', full: '这个二维码已被另一部手机使用。',
      fullTitle: '对话已有人加入', readyTitle: '准备好了', empty: '点击下方红色按钮说话，说完稍停一下。Hao 会翻译给对方，再把回答读给您听。',
      you: '您', hao: 'Hao 翻译', replay: '再听一遍', withHost: '正在与 {name} 对话',
      nameLabel: '您的称呼', namePlaceholder: '例如：王师傅、李老师', nameHint: '对方会看到这个名字，方便知道是谁说的。',
      aiFailed: '抱歉，刚才没有翻译成功，请再说一次。', busy: '请稍等，Hao 正在说话…', sendFailed: '没有发送成功，请检查网络后再说一次。',
      tooLong: '说得有点长，请分成短一点的句子。', typeInstead: '打字', closeKeyboard: '收起键盘', typePlaceholder: '输入您想说的话…', send: '发送',
      changeLanguage: '更换语言',
    },
    en: {
      sub: 'Live interpreter', hello: 'Hello!', intro: 'A traveller would like to talk with you. Hao will interpret in real time.',
      consent: 'This conversation is translated by AI in real time. Your voice is only used for translation.', join: 'Join the conversation',
      tap: 'Tap to speak', listening: 'Listening… it sends when you stop', sending: 'Sending…', thinking: 'Hao is translating…', speaking: 'Hao is speaking…',
      other: 'The other person is speaking…', notHeard: 'Didn’t catch that, tap and try again', micTitle: 'Microphone needed',
      micDenied: 'Microphone access was denied. Allow it in your browser settings and try again.',
      https: 'This link is not secure (HTTPS), so the browser blocks the microphone. Ask for an HTTPS link.', retry: 'Try again',
      connected: 'Connected', reconnecting: 'Reconnecting…', ended: 'The conversation has ended', thanks: 'Thank you!',
      full: 'This QR code is already being used on another phone.', fullTitle: 'Someone already joined', readyTitle: 'You’re all set',
      empty: 'Tap the red button and speak, then pause. Hao translates for them and reads their answer to you.',
      you: 'You', hao: 'Hao', replay: 'Play again', withHost: 'Talking with {name}',
      nameLabel: 'Your name', namePlaceholder: 'e.g. Li Wei', nameHint: 'They will see this name, so the chat shows who said what.',
      aiFailed: 'Sorry, that didn’t translate. Please say it again.', busy: 'One moment, Hao is speaking…', sendFailed: 'That didn’t send. Check your connection and try again.',
      tooLong: 'That was a bit long. Try shorter sentences.', typeInstead: 'Type', closeKeyboard: 'Hide keyboard', typePlaceholder: 'Type what you want to say…', send: 'Send',
      changeLanguage: 'Change language',
    },
  };

  /** A display name from what the person typed: one line, short. */
  function cleanName(value) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 24);
  }

  function startConversation() {
    var saved = store('hao:conv-lang:' + roomId);
    var lang = GUEST_LANGUAGES.find(function (l) { return l.code === saved; });
    if (lang) return showJoin(lang);
    setStatus('');
    setSub('实时翻译 · Live interpreter');
    render([
      el('div', {}, [el('h1', { text: '选择您的语言' }), el('p', { class: 'lead', text: 'Choose your language' })]),
      languageList(GUEST_LANGUAGES, function (l) { store('hao:conv-lang:' + roomId, l.code); showJoin(l); }),
    ]);
  }

  function showJoin(lang) {
    var s = CONV_TEXT[lang.ui];
    document.documentElement.lang = lang.speech;
    setSub(s.sub);
    // Their name labels their messages on the traveller's phone (and in the saved conversation).
    var nameInput = el('input', {
      id: 'guest-name', class: 'name-input', maxlength: '24', autocomplete: 'nickname', enterkeyhint: 'go', placeholder: s.namePlaceholder,
    });
    nameInput.value = store('hao:guest-name') || '';
    var joinBtn = el('button', { class: 'btn', type: 'button', onclick: function () {
      var name = cleanName(nameInput.value);
      if (!name) return nameInput.focus();
      store('hao:guest-name', name);
      join(lang, s, name);
    } }, [icon('mic'), s.join]);
    function sync() { joinBtn.disabled = !cleanName(nameInput.value); }
    nameInput.addEventListener('input', sync);
    nameInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') joinBtn.click(); });
    sync();
    render([
      el('div', { class: 'hero' }, [
        el('span', { class: 'mark hero-mark', text: '好' }),
        el('h1', { text: s.hello }),
        el('p', { class: 'lead', text: s.intro }),
      ]),
      el('div', { class: 'field' }, [
        el('label', { for: 'guest-name', text: s.nameLabel }),
        nameInput,
        el('p', { class: 'hint', text: s.nameHint }),
      ]),
      el('p', { class: 'consent' }, [icon('shield'), el('span', { text: s.consent })]),
      el('div', { class: 'spacer' }),
      el('button', {
        class: 'lang-chip', type: 'button', 'aria-label': s.changeLanguage,
        onclick: function () { store('hao:conv-lang:' + roomId, ''); startConversation(); },
      }, [icon('globe'), el('span', { text: lang.native }), icon('chevronDown')]),
      joinBtn,
    ]);
  }

  // The Join tap is the user gesture iOS Safari and WeChat need before audio can play or record.
  var audioCtx = null;
  function unlockAudio() {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      var buffer = audioCtx.createBuffer(1, 1, 22050);
      var src = audioCtx.createBufferSource();
      src.buffer = buffer;
      src.connect(audioCtx.destination);
      src.start(0);
    } catch (e) {}
    unlockSpeech();
  }

  function join(lang, s, name) {
    unlockAudio();
    if (!window.isSecureContext || !navigator.mediaDevices || !window.MediaRecorder) return micError(s, s.https, false, lang);
    navigator.mediaDevices
      .getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      .then(function (stream) { runConversation(stream, lang, s, name); })
      .catch(function () { micError(s, s.micDenied, true, lang, name); });
  }

  function micError(s, text, canRetry, lang, name) {
    showState('micOff', s.micTitle, text, false,
      canRetry ? el('button', { class: 'btn', type: 'button', text: s.retry, onclick: function () { join(lang, s, name); } }) : null);
  }

  // Supabase Realtime drops larger messages silently, so long clips are refused here instead.
  var MAX_AUDIO_BASE64 = 240000;
  var MAX_RECORD_MS = 15000;
  // Sent, but the host never started on it (lost message, host offline): free the turn.
  var SEND_TIMEOUT_MS = 12000;

  function runConversation(stream, lang, s, name) {
    var captions = [];
    var phase = { phase: 'idle', by: null };
    var recording = false;
    var sending = false;
    var sendTimer = null;
    var typing = false;
    var noticeTimer = null;
    var lastVoice = null;

    var threadEl = el('div', { class: 'thread', dir: lang.rtl ? 'rtl' : 'ltr', role: 'log' });
    var noticeText = el('span');
    var noticeEl = el('div', { class: 'notice', role: 'alert', hidden: true }, [icon('alert'), noticeText]);
    var levelRing = el('span', { class: 'ring' });
    var circleIcon = el('span', { style: 'display:contents' });
    var circle = el('button', { class: 'voice-circle', type: 'button', 'aria-label': s.tap }, [levelRing, circleIcon]);
    var hintEl = el('p', { class: 'circle-hint', text: s.tap });

    var textInput = el('input', { type: 'text', maxlength: '300', enterkeyhint: 'send', placeholder: s.typePlaceholder, dir: lang.rtl ? 'rtl' : 'auto' });
    var sendBtn = el('button', { class: 'send', type: 'button', 'aria-label': s.send }, [icon('send')]);
    var composer = el('div', { class: 'composer', hidden: true }, [textInput, sendBtn]);
    var keyIcon = el('span', { style: 'display:contents' }, [icon('keyboard')]);
    var keyBtn = el('button', { class: 'side-btn', type: 'button', 'aria-label': s.typeInstead }, [keyIcon]);

    render([
      threadEl,
      el('div', { class: 'dock' }, [
        noticeEl,
        composer,
        el('div', { class: 'controls' }, [keyBtn, circle, el('span', { class: 'side-spacer' })]),
        hintEl,
      ]),
    ], true);

    function notice(text) {
      if (!text) return;
      noticeText.textContent = text;
      noticeEl.hidden = false;
      clearTimeout(noticeTimer);
      noticeTimer = setTimeout(function () { noticeEl.hidden = true; }, 5000);
    }
    function clearNotice() {
      clearTimeout(noticeTimer);
      noticeEl.hidden = true;
    }

    function drawCaptions() {
      var nodes = captions.map(function (c) {
        if (c.speaker === 'LOCAL') {
          return el('div', { class: 'bubble bubble-me' }, [el('small', { text: name || s.you }), el('p', { text: c.text })]);
        }
        return el('div', { class: 'bubble bubble-hao' }, [
          el('div', { class: 'bubble-head' }, [
            el('span', { class: 'mini-mark', text: '好' }),
            el('small', { text: s.hao }),
            el('button', {
              class: 'replay', type: 'button', 'aria-label': s.replay,
              onclick: function () { if (!recording) speakText({ text: c.text, lang: lang.speech }, function () {}); },
            }, [icon('volume')]),
          ]),
          el('p', { text: c.text }),
        ]);
      });
      var working = sending || (phase.phase === 'thinking' && phase.by === 'LOCAL');
      if (!captions.length && !working) {
        nodes.push(el('div', { class: 'empty-card' }, [
          el('div', { class: 'empty-icon' }, [icon('mic')]),
          el('h2', { text: s.readyTitle }),
          el('p', { text: s.empty }),
        ]));
      }
      // Hao is working on the guest's words: show it typing in the thread.
      if (working) {
        nodes.push(el('div', { class: 'bubble bubble-hao' }, [
          el('div', { class: 'bubble-head' }, [el('span', { class: 'mini-mark', text: '好' }), el('small', { text: s.hao })]),
          dots(),
        ]));
      }
      threadEl.replaceChildren.apply(threadEl, nodes);
      threadEl.scrollTop = threadEl.scrollHeight;
    }

    function update() {
      var mine = phase.by === 'LOCAL';
      var state = recording ? 'recording'
        : sending ? 'sending'
        : phase.phase === 'thinking' ? 'thinking'
        : phase.phase === 'speaking' ? 'speaking'
        : phase.phase === 'listening' && !mine ? 'other'
        : 'idle';
      hintEl.textContent = { recording: s.listening, sending: s.sending, thinking: s.thinking, speaking: s.speaking, other: s.other, idle: s.tap }[state];
      var locked = state !== 'idle' && state !== 'recording';
      circle.disabled = locked;
      sendBtn.disabled = locked;
      circle.className = 'voice-circle' + (state === 'recording' ? ' recording' : locked ? ' busy' : '') + (state === 'speaking' ? ' speaking' : '');
      circle.setAttribute('aria-label', recording ? s.send : s.tap);
      circleIcon.replaceChildren(
        state === 'recording' ? icon('stop')
          : state === 'sending' || state === 'thinking' ? dots()
          : state === 'speaking' ? icon('volume')
          : icon('mic')
      );
      drawCaptions();
    }

    // ── Sending a turn to the host, with a watchdog in case it never arrives.
    function sent() {
      sending = false;
      clearTimeout(sendTimer);
    }
    function sendTurn(msg) {
      sending = true;
      clearNotice();
      update();
      clearTimeout(sendTimer);
      sendTimer = setTimeout(function () {
        if (!sending) return;
        sent();
        conn.send({ t: 'mic', active: false });
        notice(s.sendFailed);
        update();
      }, SEND_TIMEOUT_MS);
      conn.send(msg).then(function (result) {
        if (result === 'ok' || !sending) return;
        sent();
        conn.send({ t: 'mic', active: false });
        notice(s.sendFailed);
        update();
      });
    }

    // ── Playback of Hao's voice, then tell the host so the other person can talk.
    function played() { conn.send({ t: 'played' }); }
    function playVoice(msg) {
      var done = false;
      function finish() { if (!done) { done = true; played(); } }
      var fallback = setTimeout(finish, Math.min(30000, 2500 + msg.text.length * 250));
      function after() { clearTimeout(fallback); finish(); }
      if (msg.audio && msg.audio.data) {
        var audio = new Audio('data:' + msg.audio.mimeType + ';base64,' + msg.audio.data);
        audio.onended = after;
        audio.onerror = function () { speakText(msg, after); };
        audio.play().catch(function () { speakText(msg, after); });
      } else {
        speakText(msg, after);
      }
    }
    function speakText(msg, after) {
      if (!('speechSynthesis' in window)) return after();
      speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(msg.text);
      u.lang = msg.lang || lang.speech;
      u.rate = 0.95;
      u.onend = after;
      u.onerror = after;
      speechSynthesis.speak(u);
    }

    // ── Tap once to speak; voice activity detection stops after ~0.7 s of silence.
    var analyser = null;
    try {
      var source = audioCtx.createMediaStreamSource(stream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
    } catch (e) {}
    var samples = analyser ? new Float32Array(analyser.fftSize) : null;
    var mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find(function (t) {
      return MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t);
    });
    var recorder = null, chunks = [], vadTimer = null;

    function level() {
      if (!analyser) return 0;
      analyser.getFloatTimeDomainData(samples);
      var sum = 0;
      for (var i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
      return Math.sqrt(sum / samples.length);
    }

    function startRecording() {
      if (recording || circle.disabled) return;
      clearNotice();
      if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
      if ('speechSynthesis' in window) speechSynthesis.cancel();
      conn.send({ t: 'mic', active: true });
      chunks = [];
      // Speech needs little bandwidth: smaller clips reach the host phone and the AI sooner.
      var recOptions = { audioBitsPerSecond: 32000 };
      if (mimeType) recOptions.mimeType = mimeType;
      recorder = new MediaRecorder(stream, recOptions);
      recorder.ondataavailable = function (ev) { if (ev.data && ev.data.size) chunks.push(ev.data); };
      recording = true;
      update();
      var started = Date.now(), heard = false, silentSince = null, noise = 0.01;
      recorder.onstop = function () {
        clearInterval(vadTimer);
        recording = false;
        levelRing.style.transform = '';
        if (!heard) {
          conn.send({ t: 'mic', active: false });
          notice(s.notHeard);
          return update();
        }
        var blob = new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' });
        var reader = new FileReader();
        reader.onloadend = function () {
          var data = String(reader.result).split(',')[1] || '';
          if (data.length > MAX_AUDIO_BASE64) {
            sending = false;
            conn.send({ t: 'mic', active: false });
            notice(s.tooLong);
            return update();
          }
          sendTurn({ t: 'audio', speaker: 'LOCAL', audio: { data: data, mimeType: blob.type.split(';')[0] } });
        };
        reader.readAsDataURL(blob);
        sending = true; // until the clip is encoded and on its way
        update();
      };
      recorder.start(250);
      if (navigator.vibrate) navigator.vibrate(15);
      vadTimer = setInterval(function () {
        var now = Date.now(), rms = level();
        // Learn the room's background level during the first 300 ms.
        if (now - started < 300) { noise = Math.max(noise, rms * 1.5); return; }
        var speaking = rms > Math.max(0.02, noise * 2.2);
        levelRing.style.transform = 'scale(' + (1 + Math.min(0.4, rms * 5)) + ')';
        if (speaking) { heard = true; silentSince = null; }
        else if (silentSince === null) silentSince = now;
        var silentFor = silentSince === null ? 0 : now - silentSince;
        if ((heard && silentFor >= 700) || (!heard && now - started > 5000) || now - started > MAX_RECORD_MS) recorder.stop();
      }, 50);
    }

    circle.addEventListener('click', function () {
      if (recording) return recorder.stop();
      startRecording();
    });

    // ── Typing instead of speaking (noisy places, or when the mic struggles).
    function sendText() {
      var text = textInput.value.trim();
      if (!text || sendBtn.disabled) return;
      textInput.value = '';
      if ('speechSynthesis' in window) speechSynthesis.cancel();
      sendTurn({ t: 'text', text: text });
    }
    sendBtn.addEventListener('click', sendText);
    textInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') sendText(); });
    keyBtn.addEventListener('click', function () {
      typing = !typing;
      composer.hidden = !typing;
      keyIcon.replaceChildren(icon(typing ? 'close' : 'keyboard'));
      keyBtn.setAttribute('aria-label', typing ? s.closeKeyboard : s.typeInstead);
      if (typing) textInput.focus();
    });

    var conn = connect(
      function () { return { room: roomId, role: 'local', pid: participantId(), lang: lang.code, langName: lang.name, name: name }; },
      {
        onStatus: function (online, hostName) {
          setStatus(online ? s.connected : s.reconnecting, !online);
          if (hostName) setSub(s.withHost.replace('{name}', hostName));
        },
        onMessage: function (msg) {
          if (msg.t === 'welcome' && msg.snapshot.kind === 'conversation_local') {
            captions = msg.snapshot.captions;
            phase = msg.snapshot.phase;
          } else if (msg.t === 'conv_caption') {
            if (msg.caption.speaker === 'LOCAL') sent();
            captions.push(msg.caption);
            captions = captions.slice(-60);
          } else if (msg.t === 'phase') {
            phase = msg.state;
            if (phase.phase === 'thinking' || phase.phase === 'speaking') sent();
          } else if (msg.t === 'voice') {
            if (msg.id === lastVoice) return;
            lastVoice = msg.id;
            playVoice(msg);
          } else if (msg.t === 'not_heard') {
            sent();
            notice(s.notHeard);
          } else if (msg.t === 'error') {
            if (msg.code === 'room_not_found') return showExpired();
            if (msg.code === 'room_full') return showEnded(s.fullTitle, s.full, 'users');
            sent();
            notice(msg.code === 'ai_failed' ? s.aiFailed : msg.code === 'busy' ? s.busy : msg.message);
          } else if (msg.t === 'ended') {
            sent();
            return showEnded(s.ended, s.thanks);
          }
          update();
        },
      }
    );
    update();
  }

  // ─── Mode 2: broadcast (listener) ──────────────────────────────────────────
  var LANGUAGES = [
    { code: 'en', name: 'English', native: 'English', speech: 'en-US' },
    { code: 'sw', name: 'Swahili', native: 'Kiswahili', speech: 'sw-KE' },
    { code: 'fr', name: 'French', native: 'Français', speech: 'fr-FR' },
    { code: 'ar', name: 'Arabic', native: 'العربية', speech: 'ar-SA', rtl: true },
    { code: 'es', name: 'Spanish', native: 'Español', speech: 'es-ES' },
    { code: 'ru', name: 'Russian', native: 'Русский', speech: 'ru-RU' },
    { code: 'ko', name: 'Korean', native: '한국어', speech: 'ko-KR' },
    { code: 'ja', name: 'Japanese', native: '日本語', speech: 'ja-JP' },
    { code: 'de', name: 'German', native: 'Deutsch', speech: 'de-DE' },
    { code: 'pt', name: 'Portuguese', native: 'Português', speech: 'pt-BR' },
    { code: 'it', name: 'Italian', native: 'Italiano', speech: 'it-IT' },
    { code: 'hi', name: 'Hindi', native: 'हिन्दी', speech: 'hi-IN' },
    { code: 'vi', name: 'Vietnamese', native: 'Tiếng Việt', speech: 'vi-VN' },
    { code: 'th', name: 'Thai', native: 'ไทย', speech: 'th-TH' },
    { code: 'id', name: 'Indonesian', native: 'Bahasa Indonesia', speech: 'id-ID' },
    { code: 'tr', name: 'Turkish', native: 'Türkçe', speech: 'tr-TR' },
  ];

  var STRINGS = {
    en: ['Read aloud', 'Ask a question', 'Ask the guide', 'Type your question…', 'Send', 'Cancel', 'Question sent to the guide', 'Couldn’t send. Try again.', 'Waiting for the guide to speak…', 'Reconnecting…', 'Live', 'The tour has ended.', 'Language'],
    sw: ['Soma kwa sauti', 'Uliza swali', 'Muulize mwongozaji', 'Andika swali lako…', 'Tuma', 'Ghairi', 'Swali limetumwa kwa mwongozaji', 'Imeshindwa kutuma. Jaribu tena.', 'Inasubiri mwongozaji azungumze…', 'Inaunganisha upya…', 'Moja kwa moja', 'Ziara imekwisha.', 'Lugha'],
    fr: ['Lire à voix haute', 'Poser une question', 'Demander au guide', 'Écrivez votre question…', 'Envoyer', 'Annuler', 'Question envoyée au guide', 'Échec de l’envoi. Réessayez.', 'En attente du guide…', 'Reconnexion…', 'En direct', 'La visite est terminée.', 'Langue'],
    ar: ['القراءة بصوت عالٍ', 'اطرح سؤالاً', 'اسأل المرشد', 'اكتب سؤالك…', 'إرسال', 'إلغاء', 'تم إرسال السؤال إلى المرشد', 'تعذّر الإرسال. حاول مرة أخرى.', 'في انتظار حديث المرشد…', 'جارٍ إعادة الاتصال…', 'مباشر', 'انتهت الجولة.', 'اللغة'],
    es: ['Leer en voz alta', 'Hacer una pregunta', 'Pregunta al guía', 'Escribe tu pregunta…', 'Enviar', 'Cancelar', 'Pregunta enviada al guía', 'No se pudo enviar. Inténtalo de nuevo.', 'Esperando a que hable el guía…', 'Reconectando…', 'En directo', 'El tour ha terminado.', 'Idioma'],
    ru: ['Читать вслух', 'Задать вопрос', 'Вопрос гиду', 'Напишите ваш вопрос…', 'Отправить', 'Отмена', 'Вопрос отправлен гиду', 'Не удалось отправить. Попробуйте ещё раз.', 'Ждём, когда гид заговорит…', 'Переподключение…', 'В эфире', 'Экскурсия завершена.', 'Язык'],
    ko: ['소리 내어 읽기', '질문하기', '가이드에게 질문', '질문을 입력하세요…', '보내기', '취소', '가이드에게 질문을 보냈습니다', '보내지 못했습니다. 다시 시도하세요.', '가이드의 말을 기다리는 중…', '다시 연결 중…', '라이브', '투어가 종료되었습니다.', '언어'],
    ja: ['読み上げ', '質問する', 'ガイドに質問', '質問を入力…', '送信', 'キャンセル', 'ガイドに質問を送りました', '送信できませんでした。もう一度お試しください。', 'ガイドの話を待っています…', '再接続中…', 'ライブ', 'ツアーは終了しました。', '言語'],
  };
  var KEYS = ['readAloud', 'ask', 'askTitle', 'askPlaceholder', 'send', 'cancel', 'sent', 'failed', 'waiting', 'reconnecting', 'live', 'ended', 'language'];
  function strings(code) {
    var list = STRINGS[code] || STRINGS.en;
    var out = {};
    KEYS.forEach(function (k, i) { out[k] = list[i]; });
    return out;
  }

  function startBroadcast() {
    setSub('Live captions');
    var saved = store('hao:lang:' + roomId);
    var lang = LANGUAGES.find(function (l) { return l.code === saved; });
    if (lang) return runBroadcast(lang);
    chooseLanguage(runBroadcast);
  }

  function chooseLanguage(onChoose) {
    setStatus('');
    render([
      el('div', {}, [
        el('h1', { text: 'Choose your language' }),
        el('p', { class: 'lead', text: 'Live captions of the tour guide · Sous-titres en direct · Manukuu ya moja kwa moja' }),
      ]),
      languageList(LANGUAGES, function (l) { store('hao:lang:' + roomId, l.code); onChoose(l); }),
    ]);
  }

  function runBroadcast(lang) {
    var s = strings(lang.code);
    var readAloud = store('hao:tts') === '1';
    var captions = [];
    var online = false;
    document.documentElement.lang = lang.code;

    var listEl = el('div', { class: 'captions', dir: lang.rtl ? 'rtl' : 'ltr' });
    var toggleInput = el('input', { type: 'checkbox', role: 'switch', 'aria-label': s.readAloud });
    toggleInput.checked = readAloud;
    toggleInput.addEventListener('change', function () {
      readAloud = toggleInput.checked;
      store('hao:tts', readAloud ? '1' : '0');
      if (readAloud) unlockSpeech();
      else if ('speechSynthesis' in window) speechSynthesis.cancel();
    });

    var conn;
    var langName = el('span');
    var langBtn = el('button', {
      class: 'chip',
      type: 'button',
      onclick: function () {
        chooseLanguage(function (next) {
          lang = next;
          s = strings(lang.code);
          conn.send({ t: 'set_language', language: { code: lang.code, name: lang.name } });
          runBroadcastView();
        });
      },
    }, [icon('globe'), langName, icon('chevronDown')]);

    function runBroadcastView() {
      document.documentElement.lang = lang.code;
      listEl.setAttribute('dir', lang.rtl ? 'rtl' : 'ltr');
      langName.textContent = lang.native;
      langBtn.setAttribute('aria-label', s.language);
      toggleInput.setAttribute('aria-label', s.readAloud);
      render([
        el('div', { class: 'caption-head' }, [langBtn, el('label', { class: 'toggle' }, [toggleInput, el('span', { text: s.readAloud })])]),
        listEl,
        el('button', { class: 'btn secondary', type: 'button', onclick: openQuestion }, [icon('question'), s.ask]),
      ]);
      drawCaptions();
      setStatus(online ? s.live : s.reconnecting, !online);
    }

    function drawCaptions() {
      var nearBottom = listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight < 80;
      listEl.replaceChildren.apply(
        listEl,
        captions.length
          ? captions.map(function (c) { return el('p', { class: 'caption', text: c.text }); })
          : [el('p', { class: 'empty', text: s.waiting })]
      );
      if (nearBottom) listEl.scrollTop = listEl.scrollHeight;
    }

    function openQuestion() {
      var area = el('textarea', { maxlength: '300', placeholder: s.askPlaceholder, dir: lang.rtl ? 'rtl' : 'auto' });
      var backdrop = el('div', { class: 'sheet-backdrop', onclick: function (e) { if (e.target === backdrop) backdrop.remove(); } }, [
        el('div', { class: 'sheet' }, [
          el('h2', { text: s.askTitle }),
          area,
          el('button', {
            class: 'btn',
            type: 'button',
            text: s.send,
            onclick: function () {
              var text = area.value.trim();
              if (!text) return;
              conn.send({ t: 'question', text: text });
              backdrop.remove();
            },
          }),
          el('button', { class: 'btn secondary', type: 'button', text: s.cancel, onclick: function () { backdrop.remove(); } }),
        ]),
      ]);
      document.body.appendChild(backdrop);
      area.focus();
    }

    conn = connect(
      function () {
        return { room: roomId, role: 'listener', pid: participantId(), lang: lang.code, langName: lang.name };
      },
      {
        onStatus: function (isOnline) {
          online = isOnline;
          setStatus(online ? s.live : s.reconnecting, !online);
        },
        onMessage: function (msg) {
          if (msg.t === 'welcome' && msg.snapshot.kind === 'broadcast_listener') {
            captions = msg.snapshot.captions;
            drawCaptions();
          } else if (msg.t === 'caption') {
            if (captions.some(function (c) { return c.seq === msg.caption.seq; })) return;
            captions.push(msg.caption);
            captions = captions.slice(-100);
            drawCaptions();
            if (readAloud) speak(msg.caption.text, lang.speech);
          } else if (msg.t === 'question_sent') {
            toast(msg.ok ? s.sent : s.failed);
          } else if (msg.t === 'error') {
            if (msg.code === 'room_not_found') return showExpired();
            toast(msg.message);
          } else if (msg.t === 'ended') {
            showEnded(s.ended, '');
          }
        },
      }
    );
    runBroadcastView();
  }

  // ─── Boot ──────────────────────────────────────────────────────────────────
  if (!roomId) return showCodeEntry();
  fetch('/api/public-config')
    .then(function (res) { return res.json(); })
    .then(function (cfg) {
      if (!cfg.supabaseUrl || !cfg.supabaseKey || !window.supabase) throw new Error('config');
      sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } });
      function start(type) {
        if (type === 'conversation') startConversation();
        else if (type === 'broadcast') startBroadcast();
        else showExpired();
      }
      if (roomType) start(roomType);
      else detectType(start);
    })
    .catch(showExpired);
})();
