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

  // ---- question marks (beta, Korean only) ----
  // 말끝 음높이가 올라가면 ?를 붙이는 시험 기능이에요. 기본은 꺼짐입니다.
  let qmOn = false;
  let qmMarks = [];
  let qmPending = [];
  let qmInterimWords = 0;
  let lastInterim = '';
  function qmActive() { return qmOn && lang === 'ko-KR' && !!window.HEARQ; }
  function qmSync() {
    const Q = window.HEARQ;
    if (!Q) return;
    const want = qmActive() && listening;
    const note = document.getElementById('qmNote');
    if (note) note.style.opacity = lang === 'ko-KR' ? '1' : '0.6';
    if (want) {
      Q.lang = 'ko-KR';
      Q.addPeriod = false;
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
  // 한 문장(또는 쉬며 이어 말한 여러 문장)에 ?를 끼워 넣어 글자로 돌려줘요.
  function qmFormat(text, r, mk) {
    const Q = window.HEARQ;
    const words = text.split(/\s+/).filter(Boolean);
    if (!words.length) return text;
    const marks = (mk || []).slice();
    Q.midQuestionIndexes(words).forEach((n) => { if (!marks.some((m) => Math.abs(m.n - n) <= 1)) marks.push({ n, r: null }); });
    const sorted = marks.filter((m) => m.n > 0 && m.n < words.length).sort((a, b) => a.n - b.n);
    const out = [];
    let prev = 0;
    sorted.forEach((m) => {
      if (m.n <= prev) return;
      const chunk = words.slice(prev, m.n).join(' ');
      if (Q.pauseType(chunk) !== 'final') return; // 조사·연결 어미에서 쉰 건 문장 중간
      out.push(chunk + (Q.decide(chunk, m.r).question ? '?' : ''));
      prev = m.n;
    });
    const last = words.slice(prev).join(' ');
    out.push(last + (Q.decide(last, r).question ? '?' : ''));
    return out.join(' ');
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
