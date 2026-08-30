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

  function renderCaption(text) {
    captionBox.textContent = text || T('hear.captionPlaceholder');
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
          finalTranscript += transcript + ' ';
        } else {
          interim += transcript;
        }
      }
      const display = (finalTranscript + interim).trim();
      const words = display.split(/\s+/);
      const windowed = words.slice(Math.max(0, words.length - 40)).join(' ');
      setTimeout(() => renderCaption(windowed), captionDelay);
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
        try { recognition.start(); } catch (e) {}
      }
    };
  }

  function startListening() {
    if (!SpeechRecognition) return;
    if (!recognition) initRecognition();
    recognition.lang = lang;
    finalTranscript = '';
    try {
      recognition.start();
      listening = true;
      setStatus(true);
      startBtn.textContent = T('hear.stopBtn');
      renderCaption(T('hear.listening'));
    } catch (e) {}
  }

  function stopListening() {
    listening = false;
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
    window.HearI18n.setSpeechLang(lang); // explicit choice — overrides the UI-language default from here on
  });
  syncLangToggle();

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
