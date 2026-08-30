/* HEAR — Sign classifier, V2: temporal sequence model + multi-language.

   V1 stored one hand-landmark snapshot per sample and classified with
   plain k-nearest-neighbours. V2 instead stores a whole recorded sign
   (a sequence of frames, each frame two hands × 21 landmarks = 126
   features) as one training sample, and classifies by comparing the
   *shape of the motion over time*, not just a single hand pose.

   To keep this tractable fully client-side, every sequence — recorded
   samples and the live query alike — is resampled to a fixed number of
   frames (RESAMPLE_LEN) via linear interpolation ("sequence alignment"),
   then compared with a k-NN over the concatenated per-frame distance.
   That's a lightweight stand-in for a trained temporal model: it still
   looks at the full time course of the sign rather than one snapshot,
   without requiring an offline training step.

   No landmark data or video ever leaves the device — everything here
   runs on the samples already sitting in localStorage.

   Each stored sample is tagged with the collector who recorded it
   (see collect.html's "Collector name" field). That tag isn't used
   at classification time — it exists so evaluateGeneralization() can
   test the model against a collector it never trained on, which is a
   far more honest accuracy number than testing on the same people
   the model was trained on.

   LANGUAGES: ASL and KSL are modeled as fully separate vocabularies
   and fully separate datasets/models — a sign in one language has no
   relationship to the "same" word's sign in the other, so they are
   never mixed for training, classification, or evaluation. Each
   language gets its own localStorage key (see storageKeyFor below).
   The ASL key is kept as the original unsuffixed 'hear_sign_dataset_v2'
   so datasets recorded before multi-language support was added keep
   working without migration.

   NOTE: this dataset format is not compatible with the old single-
   frame V1 format ({v:[...], p:...}). V1 samples don't carry motion
   information and can't be meaningfully resampled into a sequence,
   so they are treated as unreadable rather than silently reused —
   see normalizeEntry(). Old datasets should be re-recorded, not
   imported. */

window.HearSignClassifier = (function () {
  const STORAGE_KEY = 'hear_sign_dataset_v2';
  const K = 5;
  const DEFAULT_PERSON = 'unspecified';
  const FEATURES_PER_FRAME = 126; // 63 per hand x 2 hands
  const RESAMPLE_LEN = 30;        // every sequence is aligned to this many frames
  const MIN_RAW_FRAMES = 5;       // shorter recordings are rejected by the UI

  // ---- languages ----
  // Each language has its own vocab and its own dataset. Labels for one
  // language carry no meaning in the other — 'HELLO' in ASL and
  // '안녕하세요' in KSL are unrelated training classes, not translations
  // of the same class.
  const LANGUAGES = {
    ASL: {
      code: 'ASL',
      name: 'English / ASL',
      flag: '🇺🇸',
      vocab: [
        'HELLO', 'THANK YOU', 'PLEASE', 'YES', 'NO', 'HELP', 'STOP', 'MORE',
        'GOOD', 'BAD', 'SORRY', 'I / ME', 'YOU', 'WANT', 'NEED'
      ]
    },
    KSL: {
      code: 'KSL',
      name: '한국어 / KSL',
      flag: '🇰🇷',
      vocab: [
        '안녕하세요', '감사합니다', '부탁해요', '네', '아니요', '도와주세요', '그만', '더',
        '좋아요', '나빠요', '미안해요', '저', '당신', '원해요', '필요해요'
      ]
    }
  };
  const DEFAULT_LANGUAGE = 'ASL';
  const LANG_STORAGE_KEY = 'hear_sign_language';

  // ---- core vs. community vocabulary ----
  // The words baked into LANGUAGES above are HEAR's own curated "core"
  // vocabulary — no fixed limit on how many, just what's been recorded
  // against real reference material so far (see addVocabWord's own
  // comment about not inventing signs from a dictionary gloss). Any
  // word added later via addVocabWord() is "community" vocabulary:
  // persisted separately per language so it survives a reload, and
  // tracked so the UI can show it as pending/validated rather than
  // silently mixing it in as if HEAR had shipped it.
  const COMMUNITY_VOCAB_PREFIX = 'hear_sign_vocab_community_';
  const communityWords = {}; // { ASL: Set, KSL: Set }

  function communityVocabKey(lang) { return COMMUNITY_VOCAB_PREFIX + lang; }

  function loadCommunityVocab(lang) {
    try {
      const raw = JSON.parse(localStorage.getItem(communityVocabKey(lang)) || '[]');
      return Array.isArray(raw) ? raw : [];
    } catch (e) { return []; }
  }

  function saveCommunityVocab(lang) {
    try {
      localStorage.setItem(communityVocabKey(lang), JSON.stringify([...(communityWords[lang] || [])]));
    } catch (e) {}
  }

  // Merge any previously-added community words into each language's
  // live vocab list at module load, so a page reload doesn't lose them.
  Object.keys(LANGUAGES).forEach((lang) => {
    communityWords[lang] = new Set(loadCommunityVocab(lang));
    communityWords[lang].forEach((word) => {
      if (!LANGUAGES[lang].vocab.includes(word)) LANGUAGES[lang].vocab.push(word);
    });
  });

  // Whatever's saved under LANG_STORAGE_KEY IS an explicit override —
  // setLanguage() below only ever runs from a person clicking ASL/KSL
  // on screen, never automatically. So "nothing saved yet" is exactly
  // the signal to fall back to HEAR's site-wide default for the
  // current UI language (see i18n.js) rather than always ASL.
  let currentLang = (function () {
    try {
      const saved = localStorage.getItem(LANG_STORAGE_KEY);
      if (LANGUAGES[saved]) return saved;
    } catch (e) {}
    try {
      if (window.HearI18n && typeof window.HearI18n.getSignLangDefault === 'function') {
        return window.HearI18n.getSignLangDefault();
      }
    } catch (e) {}
    return DEFAULT_LANGUAGE;
  })();

  function isValidLang(lang) {
    return !!LANGUAGES[lang];
  }

  function getLanguage() {
    return currentLang;
  }

  function setLanguage(lang) {
    if (!isValidLang(lang)) return currentLang;
    currentLang = lang;
    try { localStorage.setItem(LANG_STORAGE_KEY, lang); } catch (e) {}
    return currentLang;
  }

  function getVocab(lang) {
    return LANGUAGES[isValidLang(lang) ? lang : currentLang].vocab;
  }

  function languageList() {
    return Object.keys(LANGUAGES).map((code) => ({ ...LANGUAGES[code] }));
  }

  // ASL keeps the original, unsuffixed storage key so existing datasets
  // recorded before multi-language support don't need migrating. Every
  // other language gets its own suffixed key.
  function storageKeyFor(lang) {
    const l = isValidLang(lang) ? lang : currentLang;
    return l === DEFAULT_LANGUAGE ? STORAGE_KEY : `${STORAGE_KEY}_${l}`;
  }

  function loadDataset(lang) {
    try {
      return JSON.parse(localStorage.getItem(storageKeyFor(lang)) || '{}');
    } catch (e) {
      return {};
    }
  }

  function saveDataset(ds, lang) {
    localStorage.setItem(storageKeyFor(lang), JSON.stringify(ds));
  }

  // Each entry is stored as:
  //   { seq: [[126 floats], [126 floats], ...] (length RESAMPLE_LEN),
  //     p: "collectorName", duration, frameCount, handsDetected,
  //     shared: bool — did the collector consent to this sequence
  //       being included in a shared-contribution export? }
  // Anything that doesn't look like a resampled sequence (e.g. a V1
  // single-frame entry) is treated as unreadable and skipped.
  function normalizeEntry(entry) {
    if (entry && Array.isArray(entry.seq) && Array.isArray(entry.seq[0])) {
      return {
        seq: entry.seq,
        p: entry.p || DEFAULT_PERSON,
        duration: entry.duration || null,
        frameCount: entry.frameCount || entry.seq.length,
        handsDetected: entry.handsDetected || null,
        shared: !!entry.shared
      };
    }
    return null;
  }

  // ---- resampling ("sequence alignment") ----
  // Linearly interpolates a variable-length list of frame vectors to
  // exactly `len` frames, so every sample — regardless of how long the
  // recording was — becomes directly comparable.
  function resampleSequence(frames, len = RESAMPLE_LEN) {
    if (!frames.length) return null;
    if (frames.length === 1) return new Array(len).fill(frames[0]);
    const out = [];
    for (let i = 0; i < len; i++) {
      const t = (i / (len - 1)) * (frames.length - 1);
      const lo = Math.floor(t);
      const hi = Math.min(lo + 1, frames.length - 1);
      const frac = t - lo;
      const a = frames[lo];
      const b = frames[hi];
      const frame = new Array(FEATURES_PER_FRAME);
      for (let f = 0; f < FEATURES_PER_FRAME; f++) {
        frame[f] = a[f] + (b[f] - a[f]) * frac;
      }
      out.push(frame);
    }
    return out;
  }

  function addSample(label, rawFrames, person, meta = {}, lang) {
    const seq = resampleSequence(rawFrames, RESAMPLE_LEN);
    if (!seq) return null;
    const ds = loadDataset(lang);
    if (!ds[label]) ds[label] = [];
    ds[label].push({
      seq,
      p: (person && person.trim()) || DEFAULT_PERSON,
      duration: meta.duration || null,
      frameCount: rawFrames.length,
      handsDetected: meta.handsDetected || null,
      shared: !!meta.shared
    });
    saveDataset(ds, lang);
    return ds[label].length;
  }

  // ---- shared-model contribution (V1: manual export/merge, not a
  // live server — see collect.html's explanatory note) ----
  // A sign is "ready to contribute" once it has at least MIN_SHARED
  // consented sequences from at least MIN_SHARED_PEOPLE distinct
  // collectors — a lightweight stand-in for the quality gate described
  // in the design notes (real review still has to happen by whoever
  // merges contributions in, this just avoids a single low-effort
  // recording qualifying on its own).
  const MIN_SHARED_SEQUENCES = 3;
  const MIN_SHARED_PEOPLE = 1;

  // { label: { total, people: Set-like count } } for shared:true entries only
  function sharedReadiness(lang) {
    const ds = loadDataset(lang);
    const out = {};
    Object.keys(ds).forEach((label) => {
      const shared = ds[label].map(normalizeEntry).filter((e) => e && e.shared);
      if (!shared.length) return;
      const people = new Set(shared.map((e) => e.p));
      out[label] = {
        total: shared.length,
        people: people.size,
        ready: shared.length >= MIN_SHARED_SEQUENCES && people.size >= MIN_SHARED_PEOPLE
      };
    });
    return out;
  }

  // Exports ONLY sequences that (a) were marked shared at record time
  // and (b) belong to a label that has cleared the readiness gate
  // above. Everything else — personal-only sequences, and shared
  // sequences for a label that hasn't hit the threshold yet — is
  // left out of this file.
  function exportSharedDataset(lang) {
    const ds = loadDataset(lang);
    const readiness = sharedReadiness(lang);
    const out = {};
    Object.keys(readiness).forEach((label) => {
      if (!readiness[label].ready) return;
      out[label] = ds[label].map(normalizeEntry).filter((e) => e && e.shared);
    });
    return JSON.stringify({
      language: isValidLang(lang) ? lang : currentLang,
      contribution: true,
      exportedAt: new Date().toISOString(),
      data: out
    });
  }

  function counts(lang) {
    const ds = loadDataset(lang);
    const out = {};
    getVocab(lang).forEach((v) => { out[v] = (ds[v] || []).length; });
    return out;
  }

  // { personName: { label: count, ... }, ... }
  function countsByPerson(lang) {
    const ds = loadDataset(lang);
    const out = {};
    Object.keys(ds).forEach((label) => {
      ds[label].forEach((raw) => {
        const norm = normalizeEntry(raw);
        if (!norm) return;
        if (!out[norm.p]) out[norm.p] = {};
        out[norm.p][label] = (out[norm.p][label] || 0) + 1;
      });
    });
    return out;
  }

  function personsList(lang) {
    return Object.keys(countsByPerson(lang)).sort();
  }

  function clearAll(lang) {
    localStorage.removeItem(storageKeyFor(lang));
  }

  function clearLabel(label, lang) {
    const ds = loadDataset(lang);
    delete ds[label];
    saveDataset(ds, lang);
  }

  // Adds a brand-new sign to a language's vocab (e.g. "Add New Sign").
  // This only registers the label — real training data still has to be
  // recorded by a person performing the sign on camera; nothing here
  // fabricates motion data for the new label. Real KSL/ASL vocabulary
  // should be based on an actual reference (a fluent signer, a
  // dictionary of recorded video, etc.) — not a guessed hand shape for
  // whatever the Korean/English word happens to mean.
  //
  // There is no cap on vocabulary size: HEAR's shared sign library is
  // meant to keep growing. Words added this way are tracked as
  // "community" vocabulary (see vocabStatus/vocabSource below) and
  // persisted per language so they survive a reload.
  function addVocabWord(word, lang) {
    const l = isValidLang(lang) ? lang : currentLang;
    const trimmed = (word || '').trim();
    if (!trimmed) return getVocab(l);
    if (!LANGUAGES[l].vocab.includes(trimmed)) {
      LANGUAGES[l].vocab.push(trimmed);
      communityWords[l].add(trimmed);
      saveCommunityVocab(l);
    }
    return getVocab(l);
  }

  // 'core' — shipped with HEAR (LANGUAGES above), not community-added.
  // 'validated' — a community word whose shared, consented sequences
  //   have cleared the same readiness gate used for export (see
  //   sharedReadiness below): enough sequences from enough distinct
  //   collectors that it's reasonable to treat it as reliable.
  // 'pending' — a community word that hasn't cleared that gate yet.
  function vocabSource(word, lang) {
    const l = isValidLang(lang) ? lang : currentLang;
    return communityWords[l] && communityWords[l].has(word) ? 'COMMUNITY' : 'HEAR_CORE';
  }

  function vocabStatus(word, lang) {
    const l = isValidLang(lang) ? lang : currentLang;
    if (vocabSource(word, l) === 'HEAR_CORE') return 'core';
    const readiness = sharedReadiness(l);
    return (readiness[word] && readiness[word].ready) ? 'validated' : 'pending';
  }

  function exportDataset(lang) {
    return JSON.stringify({ language: isValidLang(lang) ? lang : currentLang, data: loadDataset(lang) });
  }

  // Merges an imported dataset into whatever's already stored for that
  // language, rather than replacing it — importing a shared-contribution
  // file from someone else should never wipe out your own recordings.
  // Returns the number of sequences merged in, or null if the file
  // couldn't be read.
  function importDataset(json, lang) {
    try {
      const parsed = JSON.parse(json);
      // Accept both the new wrapped format ({language, data}) and a bare
      // dataset object (the old export format, always ASL-era data).
      const incoming = (parsed && parsed.data && typeof parsed.data === 'object') ? parsed.data : parsed;
      const targetLang = (parsed && isValidLang(parsed.language)) ? parsed.language : lang;
      const ds = loadDataset(targetLang);
      let merged = 0;
      Object.keys(incoming).forEach((label) => {
        if (!Array.isArray(incoming[label])) return;
        if (!ds[label]) ds[label] = [];
        incoming[label].forEach((raw) => {
          const norm = normalizeEntry(raw);
          if (!norm) return;
          ds[label].push(norm);
          merged++;
        });
      });
      saveDataset(ds, targetLang);
      return merged;
    } catch (e) {
      return null;
    }
  }

  // Distance between two equal-length resampled sequences: sum of the
  // per-frame Euclidean distance. Because both sequences were aligned
  // to the same RESAMPLE_LEN via resampleSequence(), this compares the
  // full time course frame-by-frame rather than a single hand pose.
  function sequenceDist(seqA, seqB) {
    let sum = 0;
    for (let i = 0; i < seqA.length; i++) {
      const a = seqA[i], b = seqB[i];
      let d = 0;
      for (let f = 0; f < a.length; f++) {
        const diff = a[f] - b[f];
        d += diff * diff;
      }
      sum += Math.sqrt(d);
    }
    return sum / seqA.length;
  }

  // Flatten dataset into {label, seq, person} entries for kNN search.
  function flatten(ds) {
    const flat = [];
    Object.keys(ds).forEach((label) => {
      ds[label].forEach((raw) => {
        const norm = normalizeEntry(raw);
        if (!norm) return;
        flat.push({ label, seq: norm.seq, person: norm.p });
      });
    });
    return flat;
  }

  // Classifies a raw (not-yet-resampled) list of frame vectors.
  // Returns { label, confidence } or null if the dataset is empty.
  // `lang` selects which language's dataset to classify against —
  // defaults to the currently active language, never mixes languages.
  function classify(rawFrames, excludeIndex = -1, dataset = null, lang) {
    if (!rawFrames || !rawFrames.length) return null;
    const querySeq = resampleSequence(rawFrames, RESAMPLE_LEN);
    return classifyResampled(querySeq, excludeIndex, dataset, lang);
  }

  // Classifies an already-resampled sequence directly — used internally
  // by evaluateAccuracy/evaluateGeneralization, which already have
  // resampled sequences on hand and shouldn't resample twice.
  function classifyResampled(querySeq, excludeIndex = -1, dataset = null, lang) {
    const ds = dataset || loadDataset(lang);
    const flat = flatten(ds);
    if (!flat.length) return null;
    const distances = flat
      .map((item, idx) => ({ ...item, idx, d: sequenceDist(querySeq, item.seq) }))
      .filter((item) => item.idx !== excludeIndex)
      .sort((a, b) => a.d - b.d)
      .slice(0, Math.min(K, flat.length));

    const weights = {};
    let totalWeight = 0;
    distances.forEach((item) => {
      const w = 1 / (item.d + 1e-6);
      weights[item.label] = (weights[item.label] || 0) + w;
      totalWeight += w;
    });
    let bestLabel = null, bestWeight = -1;
    Object.keys(weights).forEach((label) => {
      if (weights[label] > bestWeight) { bestWeight = weights[label]; bestLabel = label; }
    });
    return { label: bestLabel, confidence: totalWeight ? bestWeight / totalWeight : 0 };
  }

  // Temporal smoothing across successive live *predictions* (not to be
  // confused with the per-sample sequence alignment above): keeps the
  // last N predicted labels and reports the majority once it crosses a
  // stability threshold, so a single noisy window doesn't flicker the
  // display.
  function createSmoother(windowSize = 6, threshold = 0.6) {
    let buffer = [];
    return {
      push(label) {
        buffer.push(label);
        if (buffer.length > windowSize) buffer.shift();
        const counts = {};
        buffer.forEach((l) => { if (l) counts[l] = (counts[l] || 0) + 1; });
        let best = null, bestCount = 0;
        Object.keys(counts).forEach((l) => { if (counts[l] > bestCount) { bestCount = counts[l]; best = l; } });
        const ratio = buffer.length ? bestCount / buffer.length : 0;
        return ratio >= threshold ? { label: best, ratio } : { label: null, ratio };
      },
      reset() { buffer = []; }
    };
  }

  // Leave-one-out cross-validation over the collected dataset. Also
  // returns a confusion matrix so you can see *which* signs get mixed
  // up, not just an overall percentage.
  function evaluateAccuracy(lang) {
    const ds = loadDataset(lang);
    const flat = flatten(ds);
    const perLabel = {};
    const confusion = {};
    let correct = 0;
    flat.forEach((item, idx) => {
      const pred = classifyResampled(item.seq, idx, ds, lang);
      const predLabel = pred ? pred.label : null;
      const isCorrect = predLabel === item.label;
      if (isCorrect) correct++;
      if (!perLabel[item.label]) perLabel[item.label] = { correct: 0, total: 0 };
      perLabel[item.label].total++;
      if (isCorrect) perLabel[item.label].correct++;
      if (!confusion[item.label]) confusion[item.label] = {};
      if (predLabel) confusion[item.label][predLabel] = (confusion[item.label][predLabel] || 0) + 1;
    });
    const overall = flat.length ? correct / flat.length : null;
    const byLabel = {};
    Object.keys(perLabel).forEach((label) => {
      byLabel[label] = perLabel[label].correct / perLabel[label].total;
    });
    return { overall, byLabel, sampleCount: flat.length, confusion };
  }

  // Leave-one-collector-out cross-validation: for each collector, train
  // on everyone else's sequences and test only on theirs — the
  // "unseen-participant" accuracy. Returns null when fewer than two
  // collectors have contributed data.
  function evaluateGeneralization(lang) {
    const ds = loadDataset(lang);
    const flat = flatten(ds);
    const persons = [...new Set(flat.map((f) => f.person))];
    if (persons.length < 2) return null;

    const byPerson = {};
    let correct = 0;
    let total = 0;
    persons.forEach((heldOut) => {
      const trainSet = {};
      flat.forEach((item) => {
        if (item.person === heldOut) return;
        if (!trainSet[item.label]) trainSet[item.label] = [];
        trainSet[item.label].push({ seq: item.seq, p: item.person });
      });
      let pCorrect = 0;
      let pTotal = 0;
      flat.filter((f) => f.person === heldOut).forEach((item) => {
        const pred = classifyResampled(item.seq, -1, trainSet, lang);
        pTotal++;
        if (pred && pred.label === item.label) pCorrect++;
      });
      byPerson[heldOut] = pTotal ? pCorrect / pTotal : null;
      correct += pCorrect;
      total += pTotal;
    });

    return { overall: total ? correct / total : null, byPerson, personCount: persons.length, sampleCount: total };
  }

  return {
    // language config/state
    LANGUAGES, languageList, getLanguage, setLanguage, getVocab, addVocabWord,
    // legacy: VOCAB reflected the ASL list before multi-language support.
    // Kept as a static snapshot for any code that hasn't switched to
    // getVocab() yet; prefer getVocab() since this won't update on
    // language switch.
    VOCAB: LANGUAGES.ASL.vocab,
    RESAMPLE_LEN, FEATURES_PER_FRAME, MIN_RAW_FRAMES,
    addSample, counts, countsByPerson, personsList, clearAll, clearLabel,
    exportDataset, importDataset, classify, createSmoother,
    evaluateAccuracy, evaluateGeneralization, loadDataset, resampleSequence,
    sharedReadiness, exportSharedDataset, MIN_SHARED_SEQUENCES, MIN_SHARED_PEOPLE,
    vocabSource, vocabStatus
  };
})();
