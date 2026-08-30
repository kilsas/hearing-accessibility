(function () {
  const T = window.HearI18n.t;
  const profileRaw = localStorage.getItem('hear_profile');
  const emptyState = document.getElementById('emptyState');
  const profileContent = document.getElementById('profileContent');

  if (!profileRaw) {
    emptyState.style.display = 'block';
    profileContent.style.display = 'none';
    return;
  }
  emptyState.style.display = 'none';
  profileContent.style.display = 'block';

  const p = JSON.parse(profileRaw);

  function metricCard(labelKey, value, subText) {
    const v = value === null ? '—' : value + '%';
    const width = value === null ? 0 : value;
    return `
      <div class="metric-card">
        <div class="label">${T(labelKey)}</div>
        <div class="value">${v}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${width}%"></div></div>
        <div class="sub">${subText}</div>
      </div>`;
  }

  function renderMetrics() {
    document.getElementById('metricsGrid').innerHTML = [
      metricCard('metric.detectionLeft', p.detectionLeft, T('metric.tonesSub', { n: p.detectionLeft !== null ? Math.round(p.detectionLeft / 20) : 0 })),
      metricCard('metric.detectionRight', p.detectionRight, T('metric.tonesSub', { n: p.detectionRight !== null ? Math.round(p.detectionRight / 20) : 0 })),
      metricCard('metric.localization', p.localization, T('metric.localizationSub')),
      metricCard('metric.speechQuiet', p.speechQuiet, T('metric.speechSub')),
      metricCard('metric.speechNoise', p.speechNoise, T('metric.speechSub'))
    ].join('');
  }

  // ---- narrative insights ----
  const scoreKeys = [
    { key: 'detectionLeft', value: p.detectionLeft },
    { key: 'detectionRight', value: p.detectionRight },
    { key: 'localization', value: p.localization },
    { key: 'speechQuiet', value: p.speechQuiet },
    { key: 'speechNoise', value: p.speechNoise }
  ].filter((s) => s.value !== null);

  function joinList(items) {
    if (items.length <= 1) return items[0] || '';
    return items.slice(0, -1).join(', ') + ' ' + T('profile.accessSummary.and') + ' ' + items[items.length - 1];
  }

  function renderNarrative() {
    const sorted = [...scoreKeys].sort((a, b) => b.value - a.value);
    const strongest = sorted.slice(0, 2);
    const weakest = sorted.slice(-2).reverse();

    document.getElementById('strongestText').textContent =
      T('profile.strongestText', { list: joinList(strongest.map((s) => T('score.' + s.key))) });
    document.getElementById('challengeText').textContent =
      T('profile.challengeText', { list: joinList(weakest.map((s) => T('score.' + s.key))) });

    return weakest;
  }

  // ---- recommendations, chosen based on lowest scores ----
  const allRecs = {
    speechNoise: { icon: '🔇', titleKey: 'rec.speechNoise.title', bodyKey: 'rec.speechNoise.body' },
    detectionRight: { icon: '🪑', titleKey: 'rec.detection.title', bodyKey: 'rec.detection.body' },
    detectionLeft: { icon: '🪑', titleKey: 'rec.detection.title', bodyKey: 'rec.detection.body' },
    localization: { icon: '👀', titleKey: 'rec.localization.title', bodyKey: 'rec.localization.body' },
    speechQuiet: { icon: '📝', titleKey: 'rec.speechQuiet.title', bodyKey: 'rec.speechQuiet.body' },
    default: { icon: '📝', titleKey: 'rec.default.title', bodyKey: 'rec.default.body' }
  };

  function renderRecs(weakest) {
    const recKeys = weakest.map((s) => s.key);
    if (!recKeys.length) recKeys.push('default');
    const recSet = new Set(recKeys.map((k) => allRecs[k] || allRecs.default));
    recSet.add(allRecs.default);
    document.getElementById('recsGrid').innerHTML = [...recSet].slice(0, 4).map((r) => `
      <div class="rec-card">
        <span class="icon">${r.icon}</span>
        <div><h4>${T(r.titleKey)}</h4><p>${T(r.bodyKey)}</p></div>
      </div>
    `).join('');
  }

  // ---- My Profile questionnaire ----
  // Stable IDs are stored in localStorage; only the displayed label is
  // translated, so the saved profile doesn't depend on which UI
  // language was active when it was checked.
  const situationIds = ['classroom', 'restaurant', 'group', 'calls', 'transit', 'meetings', 'outdoor'];
  const helpsIds = ['captions', 'facing', 'quiet', 'written', 'repetition', 'seating'];

  function renderCheckGroup(el, ids, prefix, storeKey) {
    const saved = JSON.parse(localStorage.getItem(storeKey) || '[]');
    el.innerHTML = ids.map((id) => `
      <li data-item="${id}" class="${saved.includes(id) ? 'checked' : ''}" style="cursor:pointer;">
        ${T(prefix + '.' + id)}
      </li>`).join('');
    el.querySelectorAll('li').forEach((li) => {
      li.addEventListener('click', () => {
        li.classList.toggle('checked');
        const current = [...el.querySelectorAll('li.checked')].map((x) => x.dataset.item);
        localStorage.setItem(storeKey, JSON.stringify(current));
        renderAccessibilitySummary();
      });
    });
  }

  const situationsEl = document.getElementById('situationsList');
  const helpsEl = document.getElementById('helpsList');

  function renderCheckGroups() {
    renderCheckGroup(situationsEl, situationIds, 'situation', 'hear_situations');
    renderCheckGroup(helpsEl, helpsIds, 'helps', 'hear_helps');
  }

  function renderAccessibilitySummary() {
    const sits = JSON.parse(localStorage.getItem('hear_situations') || '[]');
    const summaryEl = document.getElementById('accessSummary');
    if (!sits.length) {
      summaryEl.textContent = T('profile.accessSummary.empty');
      return;
    }
    const labels = sits.map((id) => T('situation.' + id).toLowerCase());
    const verb = sits.length > 1 ? T('profile.accessSummary.are') : T('profile.accessSummary.is');
    summaryEl.textContent = T('profile.accessSummary.text', { list: joinList(labels), verb: verb });
  }

  function renderAll() {
    renderMetrics();
    const weakest = renderNarrative();
    renderRecs(weakest);
    renderCheckGroups();
    renderAccessibilitySummary();
  }

  renderAll();
  document.addEventListener('hear:langchange', renderAll);
})();
