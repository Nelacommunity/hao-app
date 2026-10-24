// Hao join page: vanilla JS, no build step. Speaks the protocol in shared/rooms/protocol.ts.
// All model output is rendered with textContent, never innerHTML.
(function () {
  'use strict';

  var app = document.getElementById('app');
  var statusEl = document.getElementById('status');
  var toastEl = document.getElementById('toast');
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
  function render(children) {
    app.replaceChildren.apply(app, children);
  }
  var toastTimer;
  function toast(text) {
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
      channel.send({ type: 'broadcast', event: 'cli', payload: { from: p.pid, role: p.role, language: myLang, name: myName, msg: msg } });
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
      send: function (msg) {
        if (msg.t === 'set_language' && msg.language) {
          myLang = msg.language;
          track();
        }
        sendRaw(msg);
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
  function showEnded(title, body) {
    setStatus('');
    render([
      el('div', { class: 'center' }, [
        el('div', { class: 'big-icon', text: '🏮' }),
        el('h1', { text: title }),
        el('p', { class: 'lead', text: body }),
      ]),
    ]);
  }
  function showExpired() {
    showEnded('房间不存在或已过期', 'This room has ended or expired. 请让对方重新生成二维码 · Ask for a new QR code.');
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
    render([
      el('div', { class: 'center' }, [
        el('h1', { text: '输入房间码' }),
        el('p', { class: 'lead', text: 'Enter the room code shown on the Hao app.' }),
        input,
        el('button', { class: 'btn', text: '加入 · Join', onclick: go }),
      ]),
    ]);
  }

  // ─── Mode 1: conversation (the local person) ───────────────────────────────
  // Flow: pick language → tap Join (unlocks audio + mic) → tap the circle once, speak; recording stops
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
      choose: '选择您的语言', hello: '您好！', intro: '一位外国朋友想和您交流。Hao 会帮你们实时翻译。',
      consent: '本次对话由AI实时翻译，您的语音将被处理用于翻译。', join: '加入', tap: '点击说话', listening: '正在听…说完会自动发送',
      thinking: 'Hao 正在思考…', speaking: 'Hao 正在说话…', other: '对方正在说话…', notHeard: '没听清，请再点一次说话',
      micTitle: '需要麦克风', micDenied: '无法使用麦克风。请在浏览器设置中允许麦克风权限，然后重试。',
      https: '此链接不是安全连接（HTTPS），浏览器不允许使用麦克风。请让对方使用 HTTPS 链接。', retry: '重试',
      connected: '已连接', reconnecting: '重新连接中…', ended: '对话已结束', thanks: '谢谢您的帮助！', full: '这个二维码已被另一部手机使用。',
      fullTitle: '对话已有人加入', empty: '点击下面的圆圈，然后说话。', you: '您', hao: 'Hao',
      nameLabel: '您的称呼', namePlaceholder: '例如：王师傅、李老师', nameHint: '对方会看到这个名字，方便知道是谁说的。', withHost: '正在与 {name} 对话',
    },
    en: {
      choose: 'Choose your language', hello: 'Hello!', intro: 'A traveller would like to talk with you. Hao will interpret in real time.',
      consent: 'This conversation is translated by AI in real time. Your voice will be processed for translation.', join: 'Join',
      tap: 'Tap to speak', listening: 'Listening… it sends when you stop', thinking: 'Hao is thinking…', speaking: 'Hao is speaking…',
      other: 'The other person is speaking…', notHeard: 'Didn’t catch that, tap and try again', micTitle: 'Microphone needed',
      micDenied: 'Microphone access was denied. Allow it in your browser settings and try again.',
      https: 'This link is not secure (HTTPS), so the browser blocks the microphone. Ask for an HTTPS link.', retry: 'Try again',
      connected: 'Connected', reconnecting: 'Reconnecting…', ended: 'The conversation has ended', thanks: 'Thank you!',
      full: 'This QR code is already being used on another phone.', fullTitle: 'Someone already joined', empty: 'Tap the circle below and speak.',
      you: 'You', hao: 'Hao',
      nameLabel: 'Your name', namePlaceholder: 'e.g. Li Wei', nameHint: 'They will see this name, so the chat shows who said what.', withHost: 'Talking with {name}',
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
    render([
      el('h1', { text: '选择您的语言' }),
      el('p', { class: 'lead', text: 'Choose your language' }),
      el('div', { class: 'langs' }, GUEST_LANGUAGES.map(function (l) {
        return el('button', { class: 'lang', onclick: function () { store('hao:conv-lang:' + roomId, l.code); showJoin(l); } }, [
          el('span', { text: l.native }), el('small', { text: l.name }),
        ]);
      })),
    ]);
  }

  function showJoin(lang) {
    var s = CONV_TEXT[lang.ui];
    document.documentElement.lang = lang.speech;
    // Their name labels their messages on the traveller's phone (and in the saved conversation).
    var nameInput = el('input', {
      class: 'name-input', maxlength: '24', autocomplete: 'nickname', placeholder: s.namePlaceholder, 'aria-label': s.nameLabel,
    });
    nameInput.value = store('hao:guest-name') || '';
    var joinBtn = el('button', { class: 'btn', text: s.join, onclick: function () {
      var name = cleanName(nameInput.value);
      if (!name) return nameInput.focus();
      store('hao:guest-name', name);
      join(lang, s, name);
    } });
    function sync() { joinBtn.disabled = !cleanName(nameInput.value); }
    nameInput.addEventListener('input', sync);
    nameInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') joinBtn.click(); });
    sync();
    render([
      el('h1', { text: s.hello }),
      el('p', { class: 'lead', text: s.intro }),
      el('label', { class: 'name-label', text: s.nameLabel }),
      nameInput,
      el('p', { class: 'name-hint', text: s.nameHint }),
      el('div', { class: 'consent' }, [s.consent]),
      el('div', { class: 'spacer' }),
      el('button', { class: 'btn secondary', text: lang.native + ' ▾', onclick: function () { store('hao:conv-lang:' + roomId, ''); startConversation(); } }),
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
    render([
      el('div', { class: 'center' }, [
        el('div', { class: 'big-icon', text: '🎙️' }),
        el('h1', { text: s.micTitle }),
        el('p', { class: 'lead', text: text }),
        canRetry ? el('button', { class: 'btn', text: s.retry, onclick: function () { join(lang, s, name); } }) : null,
      ]),
    ]);
  }

  function runConversation(stream, lang, s, name) {
    var captions = [];
    var phase = { phase: 'idle', by: null };
    var recording = false;

    var listEl = el('div', { class: 'captions conv', dir: lang.rtl ? 'rtl' : 'ltr' });
    var statusLine = el('p', { class: 'circle-hint', text: s.tap });
    var levelRing = el('span', { class: 'ring' });
    var circle = el('button', { class: 'voice-circle', type: 'button', 'aria-label': s.tap }, [levelRing, el('span', { class: 'mic-icon', text: '🎙️' })]);

    var withEl = el('p', { class: 'with-host', hidden: true });
    render([withEl, listEl, el('div', { class: 'circle-wrap' }, [circle, statusLine])]);

    function drawCaptions() {
      listEl.replaceChildren.apply(listEl, captions.length
        ? captions.map(function (c) {
            var mine = c.speaker === 'LOCAL';
            return el('div', { class: 'cap ' + (mine ? 'cap-me' : 'cap-hao') }, [
              el('small', { text: mine ? (name || s.you) : s.hao }),
              el('p', { text: c.text }),
            ]);
          })
        : [el('p', { class: 'empty', text: s.empty })]);
      listEl.scrollTop = listEl.scrollHeight;
    }

    function update() {
      var mine = phase.by === 'LOCAL';
      var label = recording ? s.listening
        : phase.phase === 'thinking' ? s.thinking
        : phase.phase === 'speaking' ? s.speaking
        : phase.phase === 'listening' && !mine ? s.other
        : s.tap;
      statusLine.textContent = label;
      var locked = !recording && phase.phase !== 'idle';
      circle.disabled = locked;
      circle.classList.toggle('recording', recording);
      circle.classList.toggle('busy', locked);
    }

    // ── Playback of Hao's voice, then tell the server so the other person can talk.
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
          toast(s.notHeard);
          return update();
        }
        var blob = new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' });
        var reader = new FileReader();
        reader.onloadend = function () {
          conn.send({ t: 'audio', speaker: 'LOCAL', audio: { data: String(reader.result).split(',')[1] || '', mimeType: blob.type.split(';')[0] } });
        };
        reader.readAsDataURL(blob);
        update();
      };
      recorder.start(250);
      if (navigator.vibrate) navigator.vibrate(15);
      vadTimer = setInterval(function () {
        var now = Date.now(), rms = level();
        // Learn the room's background level during the first 300 ms.
        if (now - started < 300) { noise = Math.max(noise, rms * 1.5); return; }
        var speaking = rms > Math.max(0.02, noise * 2.2);
        levelRing.style.transform = 'scale(' + (1 + Math.min(0.5, rms * 6)) + ')';
        if (speaking) { heard = true; silentSince = null; }
        else if (silentSince === null) silentSince = now;
        var silentFor = silentSince === null ? 0 : now - silentSince;
        if ((heard && silentFor >= 700) || (!heard && now - started > 5000) || now - started > 20000) recorder.stop();
      }, 50);
    }

    circle.addEventListener('click', function () {
      if (recording) return recorder.stop();
      startRecording();
    });

    var conn = connect(
      function () { return { room: roomId, role: 'local', pid: participantId(), lang: lang.code, langName: lang.name, name: name }; },
      {
        onStatus: function (online, hostName) {
          setStatus(online ? s.connected : s.reconnecting, !online);
          if (hostName) {
            withEl.textContent = s.withHost.replace('{name}', hostName);
            withEl.hidden = false;
          }
        },
        onMessage: function (msg) {
          if (msg.t === 'welcome' && msg.snapshot.kind === 'conversation_local') {
            captions = msg.snapshot.captions;
            phase = msg.snapshot.phase;
            drawCaptions();
          } else if (msg.t === 'conv_caption') {
            captions.push(msg.caption);
            captions = captions.slice(-60);
            drawCaptions();
          } else if (msg.t === 'phase') {
            phase = msg.state;
          } else if (msg.t === 'voice') {
            playVoice(msg);
          } else if (msg.t === 'not_heard') {
            toast(s.notHeard);
          } else if (msg.t === 'error') {
            if (msg.code === 'room_not_found') return showExpired();
            if (msg.code === 'room_full') return showEnded(s.fullTitle, s.full);
            toast(msg.message);
          } else if (msg.t === 'ended') {
            return showEnded(s.ended, s.thanks);
          }
          update();
        },
      }
    );
    drawCaptions();
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
    var saved = store('hao:lang:' + roomId);
    var lang = LANGUAGES.find(function (l) { return l.code === saved; });
    if (lang) return runBroadcast(lang);
    chooseLanguage(runBroadcast);
  }

  function chooseLanguage(onChoose) {
    setStatus('');
    render([
      el('h1', { text: 'Choose your language' }),
      el('p', { class: 'lead', text: 'Live captions of the tour guide · Sous-titres en direct · Manukuu ya moja kwa moja' }),
      el(
        'div',
        { class: 'langs' },
        LANGUAGES.map(function (l) {
          return el('button', { class: 'lang', onclick: function () { store('hao:lang:' + roomId, l.code); onChoose(l); } }, [
            el('span', { text: l.native }),
            el('small', { text: l.name }),
          ]);
        })
      ),
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
    var langBtn = el('button', {
      class: 'chip',
      text: lang.native + ' ▾',
      onclick: function () {
        chooseLanguage(function (next) {
          lang = next;
          s = strings(lang.code);
          conn.send({ t: 'set_language', language: { code: lang.code, name: lang.name } });
          runBroadcastView();
        });
      },
    });

    function runBroadcastView() {
      document.documentElement.lang = lang.code;
      listEl.setAttribute('dir', lang.rtl ? 'rtl' : 'ltr');
      langBtn.textContent = lang.native + ' ▾';
      toggleInput.setAttribute('aria-label', s.readAloud);
      render([
        el('div', { class: 'caption-head' }, [langBtn, el('label', { class: 'toggle' }, [toggleInput, el('span', { text: s.readAloud })])]),
        listEl,
        el('button', { class: 'btn secondary', text: '✋ ' + s.ask, onclick: openQuestion }),
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
            text: s.send,
            onclick: function () {
              var text = area.value.trim();
              if (!text) return;
              conn.send({ t: 'question', text: text });
              backdrop.remove();
            },
          }),
          el('button', { class: 'btn secondary', text: s.cancel, onclick: function () { backdrop.remove(); } }),
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
            showEnded(s.ended, '🙏');
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
