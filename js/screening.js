/* HEAR — Listening Experience Screening
   Runs entirely client-side using the Web Audio API for tones/noise
   and the Web Speech API for the speech-recognition style stages.
   Not a medical device. Produces a self-report style profile only. */

(function () {
  const T = window.HearI18n.t;
  const stageEl = document.getElementById('stage');
  const progressFill = document.getElementById('progressFill');
  const stageCounter = document.getElementById('stageCounter');

  let audioCtx = null;
  function getCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
  }

  // ---- results storage ----
  const results = {
    detection: { left: [], right: [] },      // booleans: heard or not
    localization: [],                         // booleans: correct or not
    speechQuiet: [],                          // 0-1 accuracy per sentence
    speechNoise: []                           // 0-1 accuracy per sentence
  };

  // ---- overall flow ----
  const DETECTION_TRIALS_PER_SIDE = 5;
  const LOCALIZATION_TRIALS = 6;
  const SENTENCES_PER_MODE = 2; // how many quiet/noise sentences exist, in every language

  // Screening sentences follow the current UI language — this is what's
  // actually being tested (can you make out this spoken sentence), so a
  // Korean-language screening needs Korean sentences and Korean
  // text-to-speech, not English content behind Korean labels. Looked up
  // live (not cached) via T() so a language switch mid-flow — handled by
  // the hear:langchange listener at the bottom of this file — picks up
  // the new language's sentences on the next render, same as every other
  // piece of on-screen text.
  function sentenceFor(mode, n) {
    return T('screen.' + mode + '.' + n);
  }

  let flow = [];
  let flowIndex = 0;

  function buildFlow() {
    flow.push({ type: 'intro' });
    for (let i = 0; i < DETECTION_TRIALS_PER_SIDE; i++) flow.push({ type: 'detection', side: 'left', n: i });
    for (let i = 0; i < DETECTION_TRIALS_PER_SIDE; i++) flow.push({ type: 'detection', side: 'right', n: i });
    for (let i = 0; i < LOCALIZATION_TRIALS; i++) flow.push({ type: 'localization', n: i });
    for (let i = 0; i < SENTENCES_PER_MODE; i++) flow.push({ type: 'speech', mode: 'quiet', n: i });
    for (let i = 0; i < SENTENCES_PER_MODE; i++) flow.push({ type: 'speech', mode: 'noise', n: i });
    flow.push({ type: 'done' });
  }

  function updateProgress() {
    const pct = Math.round((flowIndex / (flow.length - 1)) * 100);
    progressFill.style.width = pct + '%';
    const step = flow[flowIndex];
    const labels = {
      intro: T('screen.stage.gettingReady'),
      detection: T('screen.stage.detection'),
      localization: T('screen.stage.localization'),
      speech: step && step.mode === 'quiet' ? T('screen.stage.speechQuiet') : T('screen.stage.speechNoise'),
      done: T('screen.stage.complete')
    };
    stageCounter.textContent = labels[step.type] || '';
  }

  function next() {
    flowIndex++;
    render();
  }

  // ---- audio helpers ----
  function playTone({ pan = 0, duration = 0.5, freq = 700 } = {}) {
    return new Promise((resolve) => {
      const ctx = getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      osc.frequency.value = freq;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.5, ctx.currentTime + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
      osc.connect(gain);
      if (panner) {
        panner.pan.value = pan;
        gain.connect(panner);
        panner.connect(ctx.destination);
      } else {
        gain.connect(ctx.destination);
      }
      osc.start();
      osc.stop(ctx.currentTime + duration + 0.05);
      osc.onended = resolve;
    });
  }

  function playNoise(duration = 3) {
    const ctx = getCtx();
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * 0.18;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    src.start();
    return src;
  }

  function speak(text) {
    return new Promise((resolve) => {
      if (!window.speechSynthesis) { resolve(); return; }
      const utter = new SpeechSynthesisUtterance(text);
      // Match the voice to the sentence's own language (== the current
      // UI language, since sentenceFor() pulls from the same T()), not a
      // fixed 'en-US' — a Korean sentence read in an English voice
      // wouldn't sound right and may not even be pronounced correctly.
      utter.lang = window.HearI18n.getLang() === 'ko' ? 'ko-KR' : 'en-US';
      utter.rate = 0.95;
      utter.onend = resolve;
      utter.onerror = resolve;
      window.speechSynthesis.speak(utter);
    });
  }

  function wordAccuracy(target, attempt) {
    // \p{L}/\p{N} (Unicode letter/number categories) rather than a-z0-9,
    // so this strips punctuation without also stripping every non-Latin
    // character — the old a-z0-9-only version silently zeroed out any
    // Korean (or other non-Latin) response, scoring it as 0% no matter
    // what was typed.
    const norm = (s) => s.toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}\s]/gu, '').split(/\s+/).filter(Boolean);
    const t = norm(target);
    const a = new Set(norm(attempt));
    if (t.length === 0) return 0;
    const hits = t.filter((w) => a.has(w)).length;
    return hits / t.length;
  }

  // ---- renderers ----
  function render() {
    const step = flow[flowIndex];
    updateProgress();
    if (step.type === 'intro') return renderIntro();
    if (step.type === 'detection') return renderDetection(step);
    if (step.type === 'localization') return renderLocalization(step);
    if (step.type === 'speech') return renderSpeech(step);
    if (step.type === 'done') return renderDone();
  }

  function renderIntro() {
    stageEl.innerHTML = `
      <div class="stage-label">${T('screen.intro.label')}</div>
      <h2>${T('screen.intro.h2')}</h2>
      <p class="instructions">${T('screen.intro.p')}</p>
      <div class="notice" role="note">
        <strong>${T('screen.intro.notice')}</strong>
      </div>
      <ul class="checklist" style="text-align:left; max-width:420px; margin:24px auto;">
        <li>${T('screen.intro.li1')}</li>
        <li>${T('screen.intro.li2')}</li>
        <li>${T('screen.intro.li3')}</li>
        <li>${T('screen.intro.li4')}</li>
      </ul>
      <button class="btn-primary" id="beginBtn">${T('screen.intro.begin')}</button>
    `;
    document.getElementById('beginBtn').addEventListener('click', next);
  }

  function renderDetection(step) {
    const sideLabel = step.side === 'left' ? T('screen.detection.left') : T('screen.detection.right');
    stageEl.innerHTML = `
      <div class="stage-label">${T('screen.detection.label', { side: sideLabel })}</div>
      <h2>${T('screen.detection.h2')}</h2>
      <p class="instructions">${T('screen.detection.p')}</p>
      <button class="speaker-btn" id="playBtn" aria-label="Play sound">🔊</button>
      <div class="choice-row" id="choiceRow" style="visibility:hidden;">
        <button class="choice-btn" data-v="yes">${T('screen.yes')}</button>
        <button class="choice-btn" data-v="no">${T('screen.no')}</button>
      </div>
      <div class="stage-meta">${T('screen.trial', { n: step.n + 1, total: DETECTION_TRIALS_PER_SIDE })}</div>
    `;
    const playBtn = document.getElementById('playBtn');
    const choiceRow = document.getElementById('choiceRow');
    playBtn.addEventListener('click', async () => {
      playBtn.classList.add('playing');
      playBtn.disabled = true;
      const pan = step.side === 'left' ? -0.9 : 0.9;
      // small chance of silent trial to keep responses honest, kept low so UX stays smooth
      await playTone({ pan, freq: 600 + Math.random() * 300 });
      playBtn.classList.remove('playing');
      choiceRow.style.visibility = 'visible';
    });
    choiceRow.addEventListener('click', (e) => {
      const btn = e.target.closest('.choice-btn');
      if (!btn) return;
      results.detection[step.side].push(btn.dataset.v === 'yes');
      next();
    });
  }

  function renderLocalization(step) {
    const pans = [-0.9, 0, 0.9];
    const labels = ['left', 'center', 'right'];
    const pick = Math.floor(Math.random() * 3);
    stageEl.innerHTML = `
      <div class="stage-label">${T('screen.local.label')}</div>
      <h2>${T('screen.local.h2')}</h2>
      <p class="instructions">${T('screen.local.p')}</p>
      <button class="speaker-btn" id="playBtn" aria-label="Play sound">🔊</button>
      <div class="choice-row" id="choiceRow" style="visibility:hidden;">
        <button class="choice-btn" data-v="left">${T('screen.local.left')}</button>
        <button class="choice-btn" data-v="center">${T('screen.local.center')}</button>
        <button class="choice-btn" data-v="right">${T('screen.local.right')}</button>
      </div>
      <div class="stage-meta">${T('screen.trial', { n: step.n + 1, total: LOCALIZATION_TRIALS })}</div>
    `;
    const playBtn = document.getElementById('playBtn');
    const choiceRow = document.getElementById('choiceRow');
    playBtn.addEventListener('click', async () => {
      playBtn.classList.add('playing');
      playBtn.disabled = true;
      await playTone({ pan: pans[pick], freq: 500 });
      playBtn.classList.remove('playing');
      choiceRow.style.visibility = 'visible';
    });
    choiceRow.addEventListener('click', (e) => {
      const btn = e.target.closest('.choice-btn');
      if (!btn) return;
      results.localization.push(btn.dataset.v === labels[pick]);
      next();
    });
  }

  function renderSpeech(step) {
    const isNoise = step.mode === 'noise';
    // Resolved fresh from the current UI language on every render (not
    // stored on the step), so if the person switches language mid-stage
    // — handled by the hear:langchange listener below — the sentence
    // they see/hear/are scored against updates too instead of staying
    // stuck in whatever language the flow was originally built in.
    const sentenceText = sentenceFor(step.mode, step.n);
    stageEl.innerHTML = `
      <div class="stage-label">${isNoise ? T('screen.speech.labelNoise') : T('screen.speech.labelQuiet')}</div>
      <h2>${T('screen.speech.h2')}</h2>
      <p class="instructions">${T('screen.speech.p', { noiseNote: isNoise ? T('screen.speech.noiseNote') : '' })}</p>
      <button class="speaker-btn" id="playBtn" aria-label="Play sentence">🔊</button>
      <div class="text-input-row" id="inputRow" style="visibility:hidden;">
        <input type="text" id="answerInput" placeholder="${T('screen.speech.placeholder')}">
        <button class="btn-primary" id="submitBtn">${T('screen.speech.submit')}</button>
      </div>
      <div class="stage-meta">${T('screen.sentence', { n: step.n + 1, total: SENTENCES_PER_MODE })}</div>
    `;
    const playBtn = document.getElementById('playBtn');
    const inputRow = document.getElementById('inputRow');
    const answerInput = document.getElementById('answerInput');
    const submitBtn = document.getElementById('submitBtn');

    playBtn.addEventListener('click', async () => {
      playBtn.classList.add('playing');
      playBtn.disabled = true;
      let noiseSrc = null;
      if (isNoise) noiseSrc = playNoise(4);
      await speak(sentenceText);
      if (noiseSrc) setTimeout(() => { try { noiseSrc.stop(); } catch (e) {} }, 400);
      playBtn.classList.remove('playing');
      inputRow.style.visibility = 'visible';
      answerInput.focus();
    });

    function submit() {
      const acc = wordAccuracy(sentenceText, answerInput.value || '');
      (isNoise ? results.speechNoise : results.speechQuiet).push(acc);
      next();
    }
    submitBtn.addEventListener('click', submit);
    answerInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  }

  function renderDone() {
    stageEl.innerHTML = `
      <div class="stage-label">${T('screen.done.label')}</div>
      <h2>${T('screen.done.h2')}</h2>
      <p class="instructions">${T('screen.done.p')}</p>
      <button class="btn-primary" id="seeResults">${T('screen.done.cta')}</button>
    `;
    document.getElementById('seeResults').addEventListener('click', () => {
      const pct = (arr) => arr.length ? Math.round((arr.filter(Boolean).length / arr.length) * 100) : null;
      const pctAvg = (arr) => arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 100) : null;
      const profile = {
        detectionLeft: pct(results.detection.left),
        detectionRight: pct(results.detection.right),
        localization: pct(results.localization),
        speechQuiet: pctAvg(results.speechQuiet),
        speechNoise: pctAvg(results.speechNoise),
        completedAt: new Date().toISOString()
      };
      localStorage.setItem('hear_profile', JSON.stringify(profile));
      window.location.href = 'profile.html';
    });
  }

  buildFlow();
  render();

  // Re-render the current stage in the new UI language. Any answer the
  // person is mid-typing on the speech stage is lost on switch, same as
  // any other stage's transient UI state — acceptable for a rare action.
  document.addEventListener('hear:langchange', render);
})();
