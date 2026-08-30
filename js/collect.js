(function () {
  const C = window.HearSignClassifier;
  const HT = window.HearHandTracking;
  const T = window.HearI18n.t;
  const COLLECTOR_STORAGE_KEY = 'hear_collector_id';
  const MAX_RECORD_MS = 10000;

  const langSelectGrid = document.getElementById('langSelectGrid');
  const newSignInput = document.getElementById('newSignInput');
  const addSignBtn = document.getElementById('addSignBtn');

  const signSelect = document.getElementById('signSelect');
  const collectorInput = document.getElementById('collectorInput');
  const startBtn = document.getElementById('startCameraBtn');
  const permissionPanel = document.getElementById('permissionPanel');
  const cameraSection = document.getElementById('cameraSection');
  const video = document.getElementById('video');
  const canvas = document.getElementById('overlay');
  const placeholder = document.getElementById('cameraPlaceholder');
  const leftChip = document.getElementById('leftChip');
  const rightChip = document.getElementById('rightChip');

  const startRecordBtn = document.getElementById('startRecordBtn');
  const stopRecordBtn = document.getElementById('stopRecordBtn');
  const saveSequenceBtn = document.getElementById('saveSequenceBtn');
  const retrySequenceBtn = document.getElementById('retrySequenceBtn');
  const idleRecordState = document.getElementById('idleRecordState');
  const activeRecordState = document.getElementById('activeRecordState');
  const reviewRecordState = document.getElementById('reviewRecordState');
  const recordTimer = document.getElementById('recordTimer');
  const sequenceSummary = document.getElementById('sequenceSummary');
  const tooShortNotice = document.getElementById('tooShortNotice');

  const sampleCountEl = document.getElementById('sampleCount');
  const datasetListEl = document.getElementById('datasetList');
  const collectorTableEl = document.getElementById('collectorTable');
  const exportBtn = document.getElementById('exportBtn');
  const importInput = document.getElementById('importInput');
  const clearAllBtn = document.getElementById('clearAllBtn');
  const sharedGateText = document.getElementById('sharedGateText');
  const sharedReadyList = document.getElementById('sharedReadyList');
  const exportSharedBtn = document.getElementById('exportSharedBtn');
  const evalBtn = document.getElementById('evalBtn');
  const accuracyResult = document.getElementById('accuracyResult');
  const confusionResult = document.getElementById('confusionResult');
  const generalizationResult = document.getElementById('generalizationResult');

  let currentLang = C.getLanguage();
  langSelectGrid.querySelectorAll('.lang-card').forEach((card) => {
    card.classList.toggle('active', card.dataset.lang === currentLang);
  });

  function renderSignSelect() {
    const prev = signSelect.value;
    const statusIcon = { core: '', pending: ' \u{1F7E1}', validated: ' \u2705' };
    signSelect.innerHTML = C.getVocab(currentLang).map((v) => {
      const status = C.vocabStatus(v, currentLang);
      return `<option value="${v}">${v}${statusIcon[status] || ''}</option>`;
    }).join('');
    if (C.getVocab(currentLang).includes(prev)) signSelect.value = prev;
  }

  collectorInput.value = localStorage.getItem(COLLECTOR_STORAGE_KEY) || '';
  collectorInput.addEventListener('input', () => {
    localStorage.setItem(COLLECTOR_STORAGE_KEY, collectorInput.value);
  });

  // ---- recording state ----
  let handPresent = false;   // is at least one hand visible right now
  let isRecording = false;
  let recordedFrames = [];   // raw (non-resampled) 126-length vectors
  let maxHandsSeen = 0;
  let recordStart = null;
  let timerInterval = null;
  let autoStopTimeout = null;
  let pendingRecording = null; // { frames, duration, handsDetected } awaiting Save/Retry

  function setRecordUI(state) {
    idleRecordState.style.display = state === 'idle' ? 'block' : 'none';
    activeRecordState.style.display = state === 'active' ? 'block' : 'none';
    reviewRecordState.style.display = state === 'review' ? 'block' : 'none';
    tooShortNotice.style.display = 'none';
  }

  function formatTimer(ms) {
    const totalSec = ms / 1000;
    const mm = String(Math.floor(totalSec / 60)).padStart(2, '0');
    const ss = String(Math.floor(totalSec % 60)).padStart(2, '0');
    return `${mm}:${ss}`;
  }

  function updateTimer() {
    const elapsed = Date.now() - recordStart;
    recordTimer.textContent = formatTimer(Math.min(elapsed, MAX_RECORD_MS));
  }

  function startRecording() {
    isRecording = true;
    recordedFrames = [];
    maxHandsSeen = 0;
    recordStart = Date.now();
    setRecordUI('active');
    updateTimer();
    timerInterval = setInterval(updateTimer, 100);
    autoStopTimeout = setTimeout(stopRecording, MAX_RECORD_MS);
  }

  function renderSequenceSummary(duration) {
    const handsLabel = maxHandsSeen === 2 ? T('collect.summary.bothHands') : maxHandsSeen === 1 ? T('collect.summary.oneHand') : T('collect.summary.noHands');
    sequenceSummary.innerHTML = `
      <div><span>${T('collect.summary.language')}</span><span>${C.LANGUAGES[currentLang].flag} ${C.LANGUAGES[currentLang].name}</span></div>
      <div><span>${T('collect.summary.sign')}</span><span>${signSelect.value}</span></div>
      <div><span>${T('collect.summary.duration')}</span><span>${duration.toFixed(1)} ${T('collect.summary.sec')}</span></div>
      <div><span>${T('collect.summary.frames')}</span><span>${recordedFrames.length}</span></div>
      <div><span>${T('collect.summary.hands')}</span><span>${handsLabel}</span></div>
    `;
  }

  function stopRecording() {
    if (!isRecording) return;
    isRecording = false;
    clearInterval(timerInterval);
    clearTimeout(autoStopTimeout);
    const duration = (Date.now() - recordStart) / 1000;

    if (recordedFrames.length < C.MIN_RAW_FRAMES) {
      setRecordUI('idle');
      tooShortNotice.style.display = 'block';
      return;
    }

    pendingRecording = {
      frames: recordedFrames,
      duration,
      handsDetected: maxHandsSeen
    };
    renderSequenceSummary(duration);
    setRecordUI('review');
  }

  startRecordBtn.addEventListener('click', () => { if (!isRecording) startRecording(); });
  stopRecordBtn.addEventListener('click', stopRecording);

  retrySequenceBtn.addEventListener('click', () => {
    pendingRecording = null;
    setRecordUI('idle');
  });

  saveSequenceBtn.addEventListener('click', () => {
    if (!pendingRecording) return;
    const consentInput = document.querySelector('input[name="shareConsent"]:checked');
    const shared = !!(consentInput && consentInput.value === 'shared');
    const total = C.addSample(signSelect.value, pendingRecording.frames, collectorInput.value, {
      duration: pendingRecording.duration,
      handsDetected: pendingRecording.handsDetected,
      shared
    }, currentLang);
    pendingRecording = null;
    sampleCountEl.textContent = total;
    renderDatasetList();
    // Reset consent choice back to the privacy-respecting default
    // (personal-only) for the next recording, rather than leaving
    // "shared" selected by default.
    const personalRadio = document.querySelector('input[name="shareConsent"][value="personal"]');
    if (personalRadio) personalRadio.checked = true;
    setRecordUI('idle');
  });

  function renderDatasetList() {
    const counts = C.counts(currentLang);
    const statusLabel = { core: T('collect.status.core'), pending: T('collect.status.pending'), validated: T('collect.status.validated') };
    datasetListEl.innerHTML = C.getVocab(currentLang).map((v) => {
      const status = C.vocabStatus(v, currentLang);
      const badge = status === 'core' ? '' : ` <span class="status-badge status-${status}">${statusLabel[status]}</span>`;
      const isOpen = expandedLabels.has(v);
      return `
        <li class="dataset-row">
          <div class="dataset-row-summary" data-label="${encodeURIComponent(v)}" role="button" tabindex="0">
            <span>${escapeHtml(v)}${badge}</span>
            <span>${counts[v]} ${T('collect.sequencesUnit')} <span class="chevron">${isOpen ? '\u25B4' : '\u25BE'}</span></span>
          </div>
          <ul class="sequence-detail-list" data-label="${encodeURIComponent(v)}" style="display:${isOpen ? 'block' : 'none'};"></ul>
        </li>`;
    }).join('');
    sampleCountEl.textContent = counts[signSelect.value] || 0;
    expandedLabels.forEach((label) => { if (C.getVocab(currentLang).includes(label)) populateSequenceDetail(label); });
    renderCollectorTable();
    renderSharedPanel();
  }

  // ---- per-sign sequence list (view/delete individual recordings) ----
  // Which signs currently have their sequence list expanded, so a
  // delete or a language-toggle re-render doesn't collapse everything
  // the person had open.
  const expandedLabels = new Set();

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function populateSequenceDetail(label) {
    const listEl = datasetListEl.querySelector(`.sequence-detail-list[data-label="${encodeURIComponent(label)}"]`);
    if (!listEl) return;
    const entries = C.listSequences(label, currentLang);
    if (!entries.length) {
      listEl.innerHTML = `<li class="sequence-empty">${T('collect.noEntries')}</li>`;
      return;
    }
    listEl.innerHTML = entries.map((entry, i) => {
      const handsLabel = entry.handsDetected === 2 ? T('collect.summary.bothHands') : entry.handsDetected === 1 ? T('collect.summary.oneHand') : T('collect.summary.noHands');
      const durationText = entry.duration != null ? `${entry.duration.toFixed(1)}${T('collect.summary.sec')}` : '—';
      const sharedBadge = entry.shared ? ` <span class="status-badge status-validated">${T('collect.badge.shared')}</span>` : '';
      return `
        <li class="sequence-row">
          <span class="sequence-row-info">${i + 1}. <strong>${escapeHtml(entry.p)}</strong> · ${durationText} · ${handsLabel}${sharedBadge}</span>
          <button class="sequence-delete-btn" data-label="${encodeURIComponent(label)}" data-index="${entry.index}" aria-label="${T('collect.deleteSequence')}" title="${T('collect.deleteSequence')}">\u2715</button>
        </li>`;
    }).join('');
  }

  datasetListEl.addEventListener('click', (e) => {
    const delBtn = e.target.closest('.sequence-delete-btn');
    if (delBtn) {
      const label = decodeURIComponent(delBtn.dataset.label);
      const index = parseInt(delBtn.dataset.index, 10);
      if (!confirm(T('collect.deleteConfirm'))) return;
      C.deleteSequence(label, index, currentLang);
      // The dataset changed underneath any previously-computed accuracy
      // numbers, so those are stale now — clear them rather than show a
      // figure that no longer matches the data.
      clearEvalPanels();
      renderDatasetList();
      return;
    }
    const summary = e.target.closest('.dataset-row-summary');
    if (summary) {
      const label = decodeURIComponent(summary.dataset.label);
      if (expandedLabels.has(label)) expandedLabels.delete(label); else expandedLabels.add(label);
      renderDatasetList();
    }
  });
  datasetListEl.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const summary = e.target.closest('.dataset-row-summary');
    if (!summary) return;
    e.preventDefault();
    summary.click();
  });

  function renderSharedPanel() {
    sharedGateText.textContent = T('collect.sharedPanel.gate', { min: C.MIN_SHARED_SEQUENCES, people: C.MIN_SHARED_PEOPLE });
    const readiness = C.sharedReadiness(currentLang);
    const readyLabels = Object.keys(readiness).filter((l) => readiness[l].ready).sort();
    if (!readyLabels.length) {
      sharedReadyList.innerHTML = `<li style="color:var(--text-faint);">${T('collect.sharedReady.none')}</li>`;
      exportSharedBtn.disabled = true;
    } else {
      sharedReadyList.innerHTML = readyLabels.map((l) => {
        const r = readiness[l];
        return `<li><span>${l}</span><span>${r.total} ${T('collect.sequencesUnit')} · ${r.people}${currentLangKey === 'ko' ? '명' : ' collector(s)'}</span></li>`;
      }).join('');
      exportSharedBtn.disabled = false;
    }
  }
  // small helper so the collector-count suffix above reads naturally
  // in whichever UI language is active
  let currentLangKey = window.HearI18n.getLang();
  document.addEventListener('hear:langchange', () => { currentLangKey = window.HearI18n.getLang(); });

  exportSharedBtn.addEventListener('click', () => {
    const readiness = C.sharedReadiness(currentLang);
    const anyReady = Object.keys(readiness).some((l) => readiness[l].ready);
    if (!anyReady) { alert(T('collect.exportShared.none')); return; }
    const blob = new Blob([C.exportSharedDataset(currentLang)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hear-shared-contribution-${currentLang}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  function renderCollectorTable() {
    const byPerson = C.countsByPerson(currentLang);
    const persons = Object.keys(byPerson).sort();
    if (!persons.length) {
      collectorTableEl.innerHTML = `<p style="font-size:13.5px; color:var(--text-faint);">${T('collect.noSequences')}</p>`;
      return;
    }
    const signsWithData = C.getVocab(currentLang).filter((v) => persons.some((p) => byPerson[p][v]));
    const header = `<tr><th style="text-align:left; padding:6px 10px; font-size:12.5px; color:var(--text-faint);">${T('collect.table.collector')}</th>${signsWithData.map((s) => `<th style="text-align:right; padding:6px 10px; font-size:12.5px; color:var(--text-faint);">${s}</th>`).join('')}<th style="text-align:right; padding:6px 10px; font-size:12.5px; color:var(--text-faint);">${T('collect.table.total')}</th></tr>`;
    const rows = persons.map((p) => {
      const rowTotal = signsWithData.reduce((sum, s) => sum + (byPerson[p][s] || 0), 0);
      const cells = signsWithData.map((s) => `<td style="text-align:right; padding:6px 10px; font-size:14px;">${byPerson[p][s] || 0}</td>`).join('');
      return `<tr><td style="padding:6px 10px; font-size:14px; font-weight:600;">${p}</td>${cells}<td style="text-align:right; padding:6px 10px; font-size:14px; font-weight:600;">${rowTotal}</td></tr>`;
    }).join('');
    collectorTableEl.innerHTML = `<table style="border-collapse:collapse; width:100%; min-width:400px;">${header}${rows}</table>`;
  }

  function clearEvalPanels() {
    accuracyResult.innerHTML = '';
    confusionResult.innerHTML = '';
    generalizationResult.innerHTML = '';
  }

  function switchLanguage(lang) {
    if (lang === currentLang) return;
    currentLang = C.setLanguage(lang);
    langSelectGrid.querySelectorAll('.lang-card').forEach((card) => {
      card.classList.toggle('active', card.dataset.lang === currentLang);
    });
    expandedLabels.clear(); // previous language's expanded rows don't apply to the new dataset
    renderSignSelect();
    renderDatasetList();
    clearEvalPanels();
  }

  langSelectGrid.addEventListener('click', (e) => {
    const card = e.target.closest('.lang-card');
    if (!card) return;
    switchLanguage(card.dataset.lang);
  });

  addSignBtn.addEventListener('click', () => {
    const word = newSignInput.value;
    if (!word || !word.trim()) return;
    C.addVocabWord(word, currentLang);
    newSignInput.value = '';
    renderSignSelect();
    signSelect.value = word.trim();
    renderDatasetList();
  });
  newSignInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addSignBtn.click(); });

  renderSignSelect();
  renderDatasetList();
  signSelect.addEventListener('change', renderDatasetList);

  exportBtn.addEventListener('click', () => {
    const blob = new Blob([C.exportDataset(currentLang)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hear-sign-dataset-${currentLang}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  importInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const merged = C.importDataset(reader.result, currentLang);
      if (merged !== null) { renderDatasetList(); clearEvalPanels(); }
      else alert(T('collect.importFail'));
    };
    reader.readAsText(file);
  });

  clearAllBtn.addEventListener('click', () => {
    if (confirm(T('collect.clearConfirm', { lang: C.LANGUAGES[currentLang].name }))) {
      C.clearAll(currentLang);
      expandedLabels.clear();
      renderDatasetList();
      clearEvalPanels();
    }
  });

  function renderConfusionMatrix(confusion) {
    const labels = Object.keys(confusion).sort();
    if (!labels.length) { confusionResult.innerHTML = ''; return; }
    const header = `<tr><th style="padding:6px 10px; font-size:12px; color:var(--text-faint);">${T('collect.confusion.actualPredicted')}</th>${labels.map((l) => `<th style="padding:6px 8px; font-size:12px; color:var(--text-faint); text-align:right;">${l}</th>`).join('')}</tr>`;
    const rows = labels.map((actual) => {
      const cells = labels.map((predicted) => {
        const count = (confusion[actual] && confusion[actual][predicted]) || 0;
        const isDiagonal = actual === predicted;
        return `<td style="padding:6px 8px; font-size:13.5px; text-align:right; ${isDiagonal ? 'font-weight:700; color:var(--accent);' : count ? 'color:#B34A3D;' : 'color:var(--text-faint);'}">${count}</td>`;
      }).join('');
      return `<tr><td style="padding:6px 10px; font-size:13.5px; font-weight:600;">${actual}</td>${cells}</tr>`;
    }).join('');
    confusionResult.innerHTML = `
      <h3 style="font-size:15px; margin-bottom:8px;">${T('collect.confusion.h3')}</h3>
      <p style="font-size:13px; color:var(--text-faint); margin-bottom:10px;">${T('collect.confusion.p')}</p>
      <div style="overflow-x:auto;"><table style="border-collapse:collapse;">${header}${rows}</table></div>`;
  }

  function renderGeneralization() {
    const result = C.evaluateGeneralization(currentLang);
    if (!result) {
      generalizationResult.innerHTML = `<p style="font-size:14px; color:var(--text-faint);">${T('collect.needTwoCollectors')}</p>`;
      return;
    }
    const rows = Object.keys(result.byPerson).sort().map((person) => {
      const acc = result.byPerson[person];
      const pct = acc === null ? '—' : Math.round(acc * 100) + '%';
      const width = acc === null ? 0 : Math.round(acc * 100);
      return `
        <div class="bar-row" style="grid-template-columns:150px 1fr 44px;">
          <span class="name">${person}</span>
          <div class="track"><div class="fill" style="width:${width}%"></div></div>
          <span class="pct">${pct}</span>
        </div>`;
    }).join('');
    generalizationResult.innerHTML = `
      <div class="metric-card" style="margin-bottom:20px;">
        <div class="label">${T('collect.unseenAccuracy', { people: result.personCount, n: result.sampleCount })}</div>
        <div class="value">${result.overall === null ? '—' : Math.round(result.overall * 100) + '%'}</div>
        <div class="sub">${T('collect.unseenAccuracy.sub')}</div>
      </div>
      <div class="bar-chart">${rows}</div>`;
  }

  evalBtn.addEventListener('click', () => {
    const result = C.evaluateAccuracy(currentLang);
    if (result.overall === null) {
      accuracyResult.innerHTML = `<p>${T('collect.noSequencesYet')}</p>`;
      confusionResult.innerHTML = '';
      generalizationResult.innerHTML = '';
      return;
    }
    const rows = Object.keys(result.byLabel).sort().map((label) => `
      <div class="bar-row" style="grid-template-columns:150px 1fr 44px;">
        <span class="name">${label}</span>
        <div class="track"><div class="fill" style="width:${Math.round(result.byLabel[label] * 100)}%"></div></div>
        <span class="pct">${Math.round(result.byLabel[label] * 100)}%</span>
      </div>`).join('');
    accuracyResult.innerHTML = `
      <div class="metric-card" style="margin-bottom:20px;">
        <div class="label">${T('collect.overallAccuracy', { n: result.sampleCount })}</div>
        <div class="value">${Math.round(result.overall * 100)}%</div>
        <div class="sub">${T('collect.overallAccuracy.sub')}</div>
      </div>
      <div class="bar-chart">${rows}</div>`;
    renderConfusionMatrix(result.confusion);
    renderGeneralization();
  });

  startBtn.addEventListener('click', async () => {
    startBtn.disabled = true;
    startBtn.textContent = T('collect.startingCamera');
    permissionPanel.style.display = 'none';
    cameraSection.style.display = 'block';
    placeholder.style.display = 'flex';
    await HT.start({
      video, canvas,
      onResult: (vector, meta) => {
        handPresent = !!vector;
        placeholder.style.display = vector ? 'none' : 'flex';
        leftChip.classList.toggle('on', !!(meta && meta.leftPresent));
        rightChip.classList.toggle('on', !!(meta && meta.rightPresent));
        startRecordBtn.disabled = !handPresent;

        if (isRecording && vector) {
          recordedFrames.push(vector);
          if (meta && meta.handCount > maxHandsSeen) maxHandsSeen = meta.handCount;
        }
      },
      onError: (err) => {
        placeholder.textContent = '⚠';
        startRecordBtn.disabled = true;
      }
    });
  });

  // Re-render any already-visible dynamic text (dataset list, tables,
  // eval results if present) when the UI language toggle is used.
  document.addEventListener('hear:langchange', () => {
    renderDatasetList();
    if (accuracyResult.innerHTML) evalBtn.click();
  });
})();
