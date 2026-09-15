(function () {
  const captionBox = document.getElementById('captionBox');
  const startBtn = document.getElementById('startBtn');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const unsupportedNotice = document.getElementById('unsupportedNotice');
  const noiseBadge = document.getElementById('noiseBadge'); // NEW: add this element to hear.html (see below)
  const T = window.HearI18n.t;

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let listening = false;
  let finalTranscript = '';
  let lang = window.HearI18n.getSpeechLang();
  let captionDelay = 0; // ms, controlled by caption speed setting

  // ---- NEW: noise-adaptive state ----
  // Grounded in Kim (2026): as noise increases, WER and latency both rise.
  // We cannot fix accuracy directly (see js/noise-adaptive.js header comment
  // for why the study's closed-vocabulary filter does not generalize here),
  // but we can (a) tell the user when accuracy is likely degraded, and
  // (b) apply generic, sentence-independent cleanup under high noise.
  let currentNoiseTier = 'clean';

  const NOISE_LABELS = {
    clean: { en: 'Quiet', ko: '조용함' },
    low: { en: 'Some noise', ko: '약한 소음' },
    moderate: { en: 'Noisy', ko: '소음 있음' },
    high: { en: 'Very noisy — captions may be less accurate', ko: '소음 심함 — 자막 정확도가 낮아질 수 있어요' },
  };

  function updateNoiseBadge(tier) {
    currentNoiseTier = tier;
    if (!noiseBadge) return;
    const uiLang = (window.HearI18n.getUiLang && window.HearI18n.getUiLang()) === 'ko' ? 'ko' : 'en';
    noiseBadge.textContent = NOISE_LABELS[tier][uiLang];
    noiseBadge.className = 'noise-badge noise-' + tier;
  }

  document.addEventListener('hear:noiselevel', (e) => updateNoiseBadge(e.detail.tier));

  // Generic, sentence-independent cleanup: collapses immediate consecutive
  // duplicate words (case-insensitive), a common artifact of noisy ASR
  // output. Unlike the paper's closed-vocabulary filter, this makes no
  // assumption about what the "correct" sentence is, so it generalizes to
  // arbitrary open-vocabulary speech.
  function cleanupUnderNoise(text) {
    const words = text.split(/\s+/);
    const out = [];
    for (const w of words) {
      const prev = out[out.length - 1];
      if (prev && prev.toLowerCase() === w.toLowerCase()) continue; // drop immediate repeat
      out.push(w);
    }
    return out.join(' ');
  }

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
      let display = (finalTranscript + interim).trim();
      // NEW: apply generic cleanup only when noise is elevated -- this
      // keeps clean-condition captions exactly as before (no behavior
      // change when it isn't needed), consistent with the paper's finding
      // that clean-condition WER was already very low.
      if (currentNoiseTier === 'moderate' || currentNoiseTier === 'high') {
        display = cleanupUnderNoise(display);
      }
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
      window.HearNoise && window.HearNoise.start(); // NEW: start noise monitoring alongside captions
    } catch (e) {}
  }

  function stopListening() {
    listening = false;
    setStatus(false);
    startBtn.textContent = T('hear.startBtn');
    if (recognition) {
      try { recognition.stop(); } catch (e) {}
    }
    window.HearNoise && window.HearNoise.stop(); // NEW
    updateNoiseBadge('clean');
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
    window.HearI18n.setSpeechLang(lang);
  });
  syncLangToggle();

  bindToggleGroup('speedGroup', (v) => {
    captionDelay = v === 'slow' ? 500 : v === 'fast' ? 0 : 150;
  });

  document.addEventListener('hear:langchange', () => {
    setStatus(listening);
    startBtn.textContent = listening ? T('hear.stopBtn') : T('hear.startBtn');
    if (!listening && !finalTranscript) renderCaption('');
    if (!window.HearI18n.isSpeechLangOverridden()) {
      lang = window.HearI18n.getSpeechLang();
      if (recognition) recognition.lang = lang;
      syncLangToggle();
    }
  });

  renderCaption('');
  setStatus(false);
})();
