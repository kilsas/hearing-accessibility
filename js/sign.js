(function () {
  const C = window.HearSignClassifier;
  const HT = window.HearHandTracking;
  const T = window.HearI18n.t;

  // Live recognition keeps a rolling window of recent frames (a short
  // sliding buffer, not a single snapshot) and classifies that window
  // against the recorded sequences, same as V1's single-frame classify
  // but now comparing motion over the window rather than one pose.
  const WINDOW_MS = 1800;         // how much recent motion we look at
  const MIN_WINDOW_FRAMES = 6;    // don't bother classifying tiny windows
  const CLASSIFY_INTERVAL_MS = 200;

  const startBtn = document.getElementById('startCameraBtn');
  const permissionPanel = document.getElementById('permissionPanel');
  const cameraSection = document.getElementById('cameraSection');
  const video = document.getElementById('video');
  const canvas = document.getElementById('overlay');
  const placeholder = document.getElementById('cameraPlaceholder');
  const leftChip = document.getElementById('leftChip');
  const rightChip = document.getElementById('rightChip');
  const detectedSign = document.getElementById('detectedSign');
  const confidenceEl = document.getElementById('confidenceText');
  const addBtn = document.getElementById('addBtn');
  const clearLiveBtn = document.getElementById('clearLiveBtn');
  const chipsEl = document.getElementById('signChips');
  const suggestedPhraseEl = document.getElementById('suggestedPhrase');
  const undoBtn = document.getElementById('undoBtn');
  const clearSentenceBtn = document.getElementById('clearSentenceBtn');
  const datasetNotice = document.getElementById('datasetNotice');
  const vocabStrip = document.getElementById('vocabStrip');
  const vocabCount = document.getElementById('vocabCount');
  const langSelectGrid = document.getElementById('langSelectGrid');
  const speakBtn = document.getElementById('speakBtn');
  const footerNote = document.getElementById('footerNote');

  const startDiagnosticsBtn = document.getElementById('startDiagnosticsBtn');
  const retryDiagnosticsBtn = document.getElementById('retryDiagnosticsBtn');
  const diagnosticsIdle = document.getElementById('diagnosticsIdle');
  const diagnosticsRunning = document.getElementById('diagnosticsRunning');
  const diagnosticsDone = document.getElementById('diagnosticsDone');
  const diagnosticsPrompt = document.getElementById('diagnosticsPrompt');
  const diagLeftChip = document.getElementById('diagLeftChip');
  const diagRightChip = document.getElementById('diagRightChip');

  // Per-language suggested-phrase templates. A pattern is matched only
  // within its own language's sign sequence — ASL and KSL patterns are
  // never compared against each other. These are sign-language content
  // (like the vocab itself), not UI chrome, so they don't move with the
  // interface language toggle — only with the ASL/KSL sign selection.
  const PHRASE_TEMPLATES = {
    ASL: [
      { pattern: ['HELLO', 'YOU', 'GOOD'], phrase: 'Hello, are you doing well?' },
      { pattern: ['THANK YOU'], phrase: 'Thank you.' },
      { pattern: ['I / ME', 'NEED', 'HELP'], phrase: 'I need help.' },
      { pattern: ['I / ME', 'WANT', 'MORE'], phrase: 'I want more.' },
      { pattern: ['SORRY'], phrase: 'I\u2019m sorry.' },
      { pattern: ['YES'], phrase: 'Yes.' },
      { pattern: ['NO'], phrase: 'No.' },
      { pattern: ['STOP'], phrase: 'Stop.' }
    ],
    KSL: [
      { pattern: ['안녕하세요', '당신', '좋아요'], phrase: '안녕하세요, 잘 지내세요?' },
      { pattern: ['감사합니다'], phrase: '감사합니다.' },
      { pattern: ['저', '필요해요', '도와주세요'], phrase: '도움이 필요해요.' },
      { pattern: ['저', '원해요', '더'], phrase: '더 원해요.' },
      { pattern: ['미안해요'], phrase: '죄송해요.' },
      { pattern: ['네'], phrase: '네.' },
      { pattern: ['아니요'], phrase: '아니요.' },
      { pattern: ['그만'], phrase: '그만.' }
    ]
  };

  const smoother = C.createSmoother(6, 0.6);
  let frameBuffer = []; // { t, vector }
  let lastCommitted = null;
  let lastClassifyAt = 0;
  let sentence = [];
  let currentLang = C.getLanguage(); // sign language (ASL/KSL) — separate from UI language
  let liveStatus = 'default'; // default | noHand | keepSigning | noTraining | holdSteady | detected | error
  let liveStatusExtra = null; // extra info for 'detected' (confidence/stability) or 'error' (message)

  langSelectGrid.querySelectorAll('.lang-card').forEach((card) => {
    card.classList.toggle('active', card.dataset.lang === currentLang);
  });

  function renderVocabStrip() {
    const statusIcon = { core: '', pending: ' \u{1F7E1}', validated: ' \u2705' };
    vocabStrip.innerHTML = C.getVocab(currentLang).map((v) => {
      const status = C.vocabStatus(v, currentLang);
      return `<span class="vocab-tag">${v}${statusIcon[status] || ''}</span>`;
    }).join('');
    vocabCount.textContent = T('sign.vocabCount', { n: C.getVocab(currentLang).length, name: C.LANGUAGES[currentLang].name });
  }

  function renderDatasetNotice() {
    // Counts here include HEAR's bundled shared dataset, not just
    // whatever this browser has personally recorded — a visitor who's
    // never opened collect.html can still be fully covered by signs
    // other people already contributed, so the "not enough data yet"
    // notice should reflect what recognition can actually draw on, not
    // just this one browser's own recordings.
    const counts = C.mergedCounts(currentLang);
    const totalSamples = Object.values(counts).reduce((a, b) => a + b, 0);
    if (totalSamples < 15) {
      datasetNotice.style.display = 'block';
      const langName = C.LANGUAGES[currentLang].name;
      const link = `<a href="collect.html">${T('sign.collectLinkText')}</a>`;
      datasetNotice.innerHTML = `<strong>${langName}</strong> — ${T('sign.datasetNotice', { link })}`;
    } else {
      datasetNotice.style.display = 'none';
    }
  }

  function renderFooterNote() {
    footerNote.innerHTML = T('sign.footerNote', {
      collectLink: `<a href="collect.html">${T('sign.collectLinkText')}</a>`,
      accuracyLink: `<a href="collect.html#accuracy">${T('sign.accuracyLinkText')}</a>`
    });
  }

  function renderChips() {
    chipsEl.innerHTML = sentence.length
      ? sentence.map((w) => `<span class="sign-chip">${w}</span>`).join('')
      : `<span style="color:var(--text-faint); font-size:14px;">${T('sign.recognized.empty')}</span>`;
    speakBtn.disabled = !sentence.length;
    renderSuggestion();
  }

  let currentOutputText = '';

  function renderSuggestion() {
    if (!sentence.length) { suggestedPhraseEl.style.display = 'none'; currentOutputText = ''; return; }
    const templates = PHRASE_TEMPLATES[currentLang] || [];
    const match = templates.find((t) => t.pattern.length === sentence.length && t.pattern.every((w, i) => w === sentence[i]));
    const text = match ? match.phrase : (currentLang === 'ASL'
      ? sentence.map((w) => w.charAt(0) + w.slice(1).toLowerCase()).join(' ') + '.'
      : sentence.join(' ') + '.');
    currentOutputText = text;
    suggestedPhraseEl.style.display = 'block';
    suggestedPhraseEl.innerHTML = `<div style="font-size:12px; text-transform:uppercase; letter-spacing:.05em; color:var(--text-faint); margin-bottom:4px; font-weight:700;">${T('sign.suggestedLabel')}</div>${text}`;
  }

  speakBtn.addEventListener('click', () => {
    if (!currentOutputText || !window.speechSynthesis) return;
    const utter = new SpeechSynthesisUtterance(currentOutputText);
    utter.lang = currentLang === 'KSL' ? 'ko-KR' : 'en-US';
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
  });

  // ---- live status line (confidence text) ----
  // Centralized so both onLandmarks() and a UI-language change can
  // render the same status consistently without duplicating strings.
  function setLiveStatus(status, extra) {
    liveStatus = status;
    liveStatusExtra = extra || null;
    renderLiveStatus();
  }

  function renderLiveStatus() {
    switch (liveStatus) {
      case 'noHand': confidenceEl.textContent = T('sign.noHand'); break;
      case 'keepSigning': confidenceEl.textContent = T('sign.keepSigning'); break;
      case 'noTraining': confidenceEl.textContent = T('sign.noTraining'); break;
      case 'holdSteady': confidenceEl.textContent = T('sign.holdSteady'); break;
      case 'detected':
        confidenceEl.textContent = `${liveStatusExtra.confLabel}: ${liveStatusExtra.conf}% · ${liveStatusExtra.stabLabel}: ${liveStatusExtra.stab}%`;
        break;
      case 'error':
        confidenceEl.textContent = liveStatusExtra || T('sign.cameraUnavailable');
        break;
      default: confidenceEl.textContent = T('sign.confidenceDefault');
    }
  }

  function resetLiveState() {
    smoother.reset();
    frameBuffer = [];
    lastCommitted = null;
    detectedSign.textContent = '—';
    setLiveStatus('default');
    addBtn.disabled = true;
  }

  function switchSignLanguage(lang) {
    if (lang === currentLang) return;
    currentLang = C.setLanguage(lang);
    langSelectGrid.querySelectorAll('.lang-card').forEach((card) => {
      card.classList.toggle('active', card.dataset.lang === currentLang);
    });
    renderVocabStrip();
    renderDatasetNotice();
    // A sign or in-progress sentence in one language has no meaning in
    // the other, so switching languages clears the live buffer and the
    // sentence being built rather than carrying either one over.
    sentence = [];
    resetLiveState();
    renderChips();
  }

  langSelectGrid.addEventListener('click', (e) => {
    const card = e.target.closest('.lang-card');
    if (!card) return;
    switchSignLanguage(card.dataset.lang);
  });

  // ---- hand detection diagnostics ----
  // A quick self-check that lets someone confirm the camera reports
  // their left/right hand the way they expect, before trusting live
  // recognition. Purely a UI-level confirmation of the handedness
  // classification hand-tracking.js already provides — it doesn't
  // change how landmarks are read.
  const DIAG_HOLD_MS = 700; // how long a hand must stay visible to count
  let diagState = 'idle'; // idle | awaiting-left | awaiting-right | done
  let diagHoldStart = null;

  function diagReset() {
    diagState = 'idle';
    diagHoldStart = null;
    diagnosticsIdle.style.display = 'block';
    diagnosticsRunning.style.display = 'none';
    diagnosticsDone.style.display = 'none';
    diagLeftChip.classList.remove('on');
    diagRightChip.classList.remove('on');
  }

  function diagStart() {
    diagState = 'awaiting-left';
    diagHoldStart = null;
    diagnosticsIdle.style.display = 'none';
    diagnosticsDone.style.display = 'none';
    diagnosticsRunning.style.display = 'block';
    diagnosticsPrompt.textContent = T('sign.diag.promptLeft');
    diagLeftChip.classList.remove('on');
    diagRightChip.classList.remove('on');
  }

  function diagOnLandmarks(meta) {
    diagLeftChip.classList.toggle('on', !!(meta && meta.leftPresent));
    diagRightChip.classList.toggle('on', !!(meta && meta.rightPresent));
    if (diagState !== 'awaiting-left' && diagState !== 'awaiting-right') return;

    const present = diagState === 'awaiting-left' ? !!(meta && meta.leftPresent) : !!(meta && meta.rightPresent);
    const now = Date.now();
    if (!present) { diagHoldStart = null; return; }
    if (!diagHoldStart) { diagHoldStart = now; return; }
    if (now - diagHoldStart < DIAG_HOLD_MS) return;

    if (diagState === 'awaiting-left') {
      diagState = 'awaiting-right';
      diagHoldStart = null;
      diagnosticsPrompt.textContent = T('sign.diag.promptRight');
    } else {
      diagState = 'done';
      diagnosticsRunning.style.display = 'none';
      diagnosticsDone.style.display = 'block';
    }
  }

  startDiagnosticsBtn.addEventListener('click', diagStart);
  retryDiagnosticsBtn.addEventListener('click', diagStart);
  diagReset();

  renderVocabStrip();
  renderDatasetNotice();
  renderFooterNote();
  renderChips();

  // The shared dataset streams in live in the background (see
  // sign-classifier.js / shared-sync.js) — every time it changes,
  // whether that's the initial load or someone else contributing a
  // sign in real time, refresh anything whose numbers depend on it.
  // Recognition itself (classify()) already reads the latest merged
  // dataset on every frame, so no page reload is ever needed.
  document.addEventListener('hear:shared-dataset-updated', () => {
    renderVocabStrip();
    renderDatasetNotice();
  });

  addBtn.addEventListener('click', () => {
    if (lastCommitted) {
      sentence.push(lastCommitted);
      renderChips();
    }
  });
  undoBtn.addEventListener('click', () => { sentence.pop(); renderChips(); });
  clearSentenceBtn.addEventListener('click', () => { sentence.length = 0; renderChips(); });
  clearLiveBtn.addEventListener('click', resetLiveState);

  function pruneBuffer(now) {
    while (frameBuffer.length && now - frameBuffer[0].t > WINDOW_MS) frameBuffer.shift();
  }

  function onLandmarks(vector, meta) {
    const now = Date.now();

    leftChip.classList.toggle('on', !!(meta && meta.leftPresent));
    rightChip.classList.toggle('on', !!(meta && meta.rightPresent));

    if (!vector) {
      // No hands visible — let the existing window finish being
      // evaluated for a moment, but start showing "no hand" feedback.
      if (!frameBuffer.length) {
        detectedSign.textContent = '—';
        setLiveStatus('noHand');
        addBtn.disabled = true;
      }
      return;
    }

    frameBuffer.push({ t: now, vector });
    pruneBuffer(now);

    if (frameBuffer.length < MIN_WINDOW_FRAMES) {
      detectedSign.textContent = '…';
      setLiveStatus('keepSigning');
      addBtn.disabled = true;
      return;
    }

    if (now - lastClassifyAt < CLASSIFY_INTERVAL_MS) return;
    lastClassifyAt = now;

    const rawFrames = frameBuffer.map((f) => f.vector);
    const raw = C.classify(rawFrames, -1, null, currentLang);
    if (!raw) {
      detectedSign.textContent = '—';
      setLiveStatus('noTraining');
      addBtn.disabled = true;
      return;
    }

    const smoothed = smoother.push(raw.label);
    if (smoothed.label) {
      detectedSign.textContent = smoothed.label;
      setLiveStatus('detected', {
        confLabel: T('sign.confidenceLabel'),
        conf: Math.round(raw.confidence * 100),
        stabLabel: T('sign.stabilityLabel'),
        stab: Math.round(smoothed.ratio * 100)
      });
      lastCommitted = smoothed.label;
      addBtn.disabled = false;
    } else {
      detectedSign.textContent = '…';
      setLiveStatus('holdSteady');
      addBtn.disabled = true;
    }
  }

  startBtn.addEventListener('click', async () => {
    startBtn.disabled = true;
    startBtn.textContent = window.HearI18n.getLang() === 'ko' ? '카메라 시작 중…' : 'Starting camera…';
    permissionPanel.style.display = 'none';
    cameraSection.style.display = 'block';
    placeholder.style.display = 'flex';
    await HT.start({
      video, canvas,
      onResult: (vector, meta) => { placeholder.style.display = vector ? 'none' : 'flex'; diagOnLandmarks(meta); onLandmarks(vector, meta); },
      onError: (err) => {
        placeholder.textContent = '⚠';
        detectedSign.textContent = T('sign.cameraUnavailable');
        setLiveStatus('error', err.message || (window.HearI18n.getLang() === 'ko' ? '카메라 접근을 허용한 뒤 새로고침해 주세요.' : 'Please allow camera access and reload.'));
      }
    });
  });

  // Re-render every UI-language-dependent piece when the toggle is
  // used, without touching the ASL/KSL sign-language selection, the
  // recognized-sentence content, or the live camera state.
  document.addEventListener('hear:langchange', () => {
    renderDatasetNotice();
    renderFooterNote();
    renderChips();
    renderVocabStrip();
    if (diagState === 'awaiting-left') diagnosticsPrompt.textContent = T('sign.diag.promptLeft');
    if (diagState === 'awaiting-right') diagnosticsPrompt.textContent = T('sign.diag.promptRight');
    renderLiveStatus();
  });
})();
