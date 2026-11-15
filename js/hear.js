(function () {
  const captionBox = document.getElementById('captionBox');
  const startBtn = document.getElementById('startBtn');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const unsupportedNotice = document.getElementById('unsupportedNotice');
  const T = window.HearI18n.t;

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let listening = false;
  let finalTranscript = '';
  // Defaults to match the site's UI language (see i18n.js); picking a
  // language from the toggle below overrides that default from then on.
  let lang = window.HearI18n.getSpeechLang();
  let captionDelay = 0; // ms, controlled by caption speed setting

  function syncLangToggle() {
    const group = document.getElementById('langGroup');
    const v = lang === 'ko-KR' ? 'ko' : 'en';
    group.querySelectorAll('.toggle-btn').forEach((b) => b.classList.toggle('active', b.dataset.v === v));
  }

  if (!SpeechRecognition) {
    unsupportedNotice.style.display = 'block';
    startBtn.disabled = true;
  }

  function setStatus(isLive) {
    statusDot.classList.toggle('live', isLive);
    statusText.textContent = isLive ? T('hear.statusLive') : T('hear.statusOff');
  }

  // 아주 오래 켜 두면 글이 끝없이 커지니, 너무 길어지면 오래된 앞부분부터 지워요
  function appendFinal(text) {
    finalTranscript += text + ' ';
    if (finalTranscript.length > 30000) {
      const cut = finalTranscript.indexOf(' ', finalTranscript.length - 24000);
      finalTranscript = cut > 0 ? finalTranscript.slice(cut + 1) : finalTranscript.slice(-24000);
    }
  }
  // 자막 상자: 길어지면 아래로 따라 내려가고, 위로 스크롤하면 지난 자막을 볼 수 있어요.
  // 위로 올려 둔 동안은 새 자막이 와도 위치를 그대로 두고, 다시 맨 아래로 내리면 따라가기를 이어요.
  let stickToBottom = true;
  captionBox.addEventListener('scroll', () => {
    stickToBottom = captionBox.scrollHeight - captionBox.scrollTop - captionBox.clientHeight < 40;
  });
  function renderCaption(text) {
    let span = captionBox.querySelector('.caption-text');
    if (!span) {
      captionBox.textContent = '';
      span = document.createElement('span');
      span.className = 'caption-text';
      captionBox.appendChild(span);
    }
    span.textContent = text || T('hear.captionPlaceholder');
    if (stickToBottom) captionBox.scrollTop = captionBox.scrollHeight;
  }

  // ---- 문장부호 (beta) ----
  // 말끝 음높이와 어미·어순으로 ? . , 와 영어 대문자를 붙이는 시험 기능이에요. 기본은 꺼짐입니다.
  let qmOn = false;
  let qmMarks = [];
  let qmPending = [];
  let qmInterimWords = 0;
  let lastInterim = '';
  function qmActive() { return qmOn && !!window.HEARQ; }
  function qmSync() {
    const Q = window.HEARQ;
    if (!Q) return;
    Q.lang = lang;
    Q.addPeriod = true; // 한국어도 질문이 아니면 마침표를 붙여요 (영어는 항상)
    const want = qmActive() && listening;
    if (want) {
      Q.start().catch(() => { qmOn = false; syncQmToggle(); });
    } else {
      try { Q.stop(); } catch (e) {}
    }
  }
  function syncQmToggle() {
    const group = document.getElementById('qmGroup');
    if (!group) return;
    group.querySelectorAll('.toggle-btn').forEach((b) => b.classList.toggle('active', b.dataset.v === (qmOn ? 'on' : 'off')));
  }
  if (window.HEARQ) {
    window.HEARQ.onPause((r) => {
      setTimeout(() => { if (qmActive() && qmInterimWords > 0) qmMarks.push({ n: qmInterimWords, r }); }, 250);
    });
  }
  // 한 번 끝난 말(쉬며 이어 말한 여러 문장 포함)에 ? . , 와 영어 대문자를 붙여 글자로 돌려줘요.
  const EN_STANDALONE = /^(really|why|what|how|who|where|when|okay|ok|yes|yeah|yep|no|nope|right|sure|seriously|thanks|sorry|please|hi|hello|bye|wow|oh)$/i;
  function qmFormat(text, r, mk) {
    const Q = window.HEARQ;
    const isEn = /^en/.test(lang);
    const words = text.split(/\s+/).filter(Boolean);
    if (!words.length) return text;
    const marks = (mk || []).slice();
    if (!isEn) Q.midQuestionIndexes(words).forEach((n) => { if (!marks.some((m) => Math.abs(m.n - n) <= 1)) marks.push({ n, r: null }); });
    let sorted = marks.filter((m) => m.n > 0 && m.n < words.length).sort((a, b) => a.n - b.n);
    // 영어: 쉰 뒤에 남은 게 한 단어뿐이면 앞에 붙여요 ("Really?", "Why?" 같은 말은 그대로)
    if (isEn) sorted = sorted.filter((m, i) => {
      const end = i + 1 < sorted.length ? sorted[i + 1].n : words.length;
      return !(end - m.n === 1 && !EN_STANDALONE.test((words[m.n] || '').replace(/[^a-z']/gi, '')));
    });
    const pieces = [];
    let prev = 0;
    sorted.forEach((m) => {
      if (m.n <= prev) return;
      const chunk = words.slice(prev, m.n).join(' ');
      const next = words[m.n] || '';
      const kind = Q.pauseType(chunk);
      if (kind === 'none') return; // 조사나 부사 뒤에서 쉰 거면 아무것도 안 넣어요
      if (kind === 'comma') { pieces.push({ text: chunk, punct: ',' }); prev = m.n; return; }
      const d = Q.decide(chunk, m.r);
      let punct;
      if (d.question) punct = '?';
      else if (isEn) punct = /^(and|but|so|because|or|then|cause)$/i.test(next) ? ',' : '.';
      else punct = Q.addPeriod ? '.' : '';
      pieces.push({ text: chunk, punct }); prev = m.n;
    });
    const last = words.slice(prev).join(' ');
    const dl = Q.decide(last, r);
    pieces.push({ text: last, punct: dl.question ? '?' : ((Q.addPeriod || isEn) ? '.' : '') });
    let out = '';
    let sentenceStart = true;
    pieces.forEach((p, i) => {
      const txt = isEn ? (sentenceStart ? Q.englishCase(p.text) : Q.fixI(p.text)) : p.text;
      out += (i ? ' ' : '') + txt + p.punct;
      sentenceStart = (p.punct === '?' || p.punct === '.');
    });
    return out;
  }
  function showCaption() {
    const display = (finalTranscript + qmPending.join(' ') + ' ' + lastInterim).trim();
    setTimeout(() => renderCaption(display), captionDelay);
  }

  function initRecognition() {
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = lang;

    recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          if (qmActive()) {
            // 물음표 켬: 방금 끝난 말의 말끝 음높이를 잰 뒤 붙여요 (아주 잠깐 늦게 보여요)
            const mk = qmMarks; qmMarks = [];
            const txt = transcript.trim();
            qmPending.push(txt);
            setTimeout(() => {
              qmPending.shift();
              appendFinal(qmFormat(txt, window.HEARQ.judge(), mk));
              showCaption();
            }, 150);
          } else {
            appendFinal(transcript);
          }
        } else {
          interim += transcript;
        }
      }
      lastInterim = interim;
      qmInterimWords = interim.trim() ? interim.trim().split(/\s+/).length : 0;
      showCaption();
    };

    recognition.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        renderCaption(T('hear.deniedMic'));
        stopListening();
      }
    };

    recognition.onend = () => {
      if (listening) {
        // auto-restart to keep captions continuous
        recognition.lang = lang;
        try { recognition.start(); } catch (e) {}
      }
    };
  }

  function startListening() {
    if (!SpeechRecognition) return;
    if (!recognition) initRecognition();
    recognition.lang = lang;
    finalTranscript = '';
    qmPending = []; qmMarks = []; lastInterim = '';
    listening = true;
    qmSync();
    try {
      recognition.start();
      startBtn.classList.add('listening');
      setStatus(true);
      startBtn.textContent = T('hear.stopBtn');
      renderCaption(T('hear.listening'));
    } catch (e) { listening = false; qmSync(); }
  }

  function stopListening() {
    listening = false;
    qmSync();
    startBtn.classList.remove('listening');
    setStatus(false);
    startBtn.textContent = T('hear.startBtn');
    if (recognition) {
      try { recognition.stop(); } catch (e) {}
    }
  }

  startBtn.addEventListener('click', () => {
    if (listening) stopListening(); else startListening();
  });

  // ---- settings ----
  function bindToggleGroup(groupId, onSelect) {
    const group = document.getElementById(groupId);
    group.querySelectorAll('.toggle-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        group.querySelectorAll('.toggle-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        onSelect(btn.dataset.v);
      });
    });
  }

  bindToggleGroup('sizeGroup', (v) => {
    captionBox.classList.remove('size-small', 'size-large');
    if (v === 'small') captionBox.classList.add('size-small');
    if (v === 'large') captionBox.classList.add('size-large');
  });

  bindToggleGroup('contrastGroup', (v) => {
    captionBox.classList.toggle('contrast-high', v === 'high');
  });

  bindToggleGroup('langGroup', (v) => {
    lang = v === 'ko' ? 'ko-KR' : 'en-US';
    if (recognition) recognition.lang = lang;
    qmSync();
    window.HearI18n.setSpeechLang(lang); // explicit choice — overrides the UI-language default from here on
    // A running recognizer keeps its old language until it restarts, so
    // stop it here; onend restarts it automatically with the new lang.
    if (recognition && listening) { try { recognition.stop(); } catch (e) {} }
  });
  syncLangToggle();

  bindToggleGroup('qmGroup', (v) => {
    qmOn = v === 'on';
    qmSync();
  });

  bindToggleGroup('speedGroup', (v) => {
    captionDelay = v === 'slow' ? 500 : v === 'fast' ? 0 : 150;
  });

  // If the UI language changes while idle, refresh status/placeholder/
  // button text to match — but never touch an active caption transcript,
  // since that reflects speech, not the interface language.
  document.addEventListener('hear:langchange', () => {
    setStatus(listening);
    startBtn.textContent = listening ? T('hear.stopBtn') : T('hear.startBtn');
    if (!listening && !finalTranscript) renderCaption('');
    // Only follow the UI language's speech-language default if the
    // person hasn't explicitly picked one on this page before — an
    // explicit choice should stick even after switching UI language.
    if (!window.HearI18n.isSpeechLangOverridden()) {
      lang = window.HearI18n.getSpeechLang();
      if (recognition) recognition.lang = lang;
      syncLangToggle();
    }
  });

  renderCaption('');
  setStatus(false);
})();
