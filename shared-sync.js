/* HEAR — live shared-sign sync.

   This is the piece that makes "Contribute to HEAR's shared model" on
   collect.html take effect for every visitor immediately, with no
   export/import step and no maintainer in between: it publishes one
   consented sequence to a small realtime database, and every visitor's
   browser is subscribed to that same data.

   HEAR itself doesn't run a custom backend server — this uses Firebase
   Realtime Database, a hosted, serverless key-value store built for
   exactly this "static site + shared live data" situation. It needs a
   (free-tier) Firebase project; see js/firebase-config.js.

   If no project is configured, every function below degrades to a
   harmless no-op / "not configured" response, and sign-classifier.js
   falls back to a one-time static snapshot file instead (see its
   comments) — the site keeps working, contributions just stay
   personal-only until someone manually exports + merges them, same as
   before this feature existed.

   SECURITY NOTE: with the setup this file assumes, ANYONE who opens
   collect.html can publish a sequence under any label, and it becomes
   visible to every visitor's recognizer immediately — there is no
   review step in this live path (the old export/merge flow in
   collect.html still exists as a separate, reviewed alternative). If
   you deploy this, set Firebase Realtime Database security rules that
   at least: (a) only allow writes matching the expected shape, and
   (b) rate-limit or require some form of App Check / anonymous auth,
   so the shared dataset can't be trivially spammed or vandalized. See
   the README in /data for a starting-point rules snippet. */

window.HearSharedSync = (function () {
  let app = null;
  let db = null;
  let initTried = false;

  function config() {
    return window.HEAR_FIREBASE_CONFIG || null;
  }

  function isConfigured() {
    const c = config();
    return !!(c && c.databaseURL && c.apiKey && c.projectId);
  }

  function ensureInit() {
    if (db) return true;
    if (initTried) return !!db;
    initTried = true;
    if (!isConfigured()) return false;
    if (!window.firebase || !window.firebase.initializeApp) {
      console.warn('HEAR: firebase-config.js is set, but the Firebase SDK script tags are missing — shared signs will stay local-only.');
      return false;
    }
    try {
      app = window.firebase.apps && window.firebase.apps.length
        ? window.firebase.app()
        : window.firebase.initializeApp(config());
      db = window.firebase.database();
      return true;
    } catch (e) {
      console.error('HEAR: Firebase init failed — shared signs will stay local-only.', e);
      return false;
    }
  }

  // Firebase Realtime Database keys can't contain '.', '#', '$', '[', ']',
  // or '/'. Sign labels can (KSL words, "I / ME", etc.), so labels are
  // stored URL-encoded and decoded again on the way out.
  function encodeLabel(label) {
    return encodeURIComponent(label);
  }
  function decodeLabel(key) {
    try { return decodeURIComponent(key); } catch (e) { return key; }
  }

  // Publishes ONE sequence entry under sharedSigns/{lang}/{label}/{pushId}.
  // Resolves true/false; never throws (addSample already treats this as
  // fire-and-forget, see sign-classifier.js).
  function publish(lang, label, entry) {
    if (!ensureInit()) return Promise.resolve(false);
    const ref = db.ref(`sharedSigns/${lang}/${encodeLabel(label)}`);
    return ref.push(entry).then(() => true).catch((e) => {
      console.error('HEAR: failed to publish shared sign', e);
      return false;
    });
  }

  // Subscribes to live updates for one language's whole shared dataset.
  // onChange is called immediately with the current value, then again
  // every time it changes. Returns an unsubscribe function. If Firebase
  // isn't configured, calls onChange({}) once and returns a no-op.
  function subscribe(lang, onChange) {
    if (!ensureInit()) { onChange({}); return () => {}; }
    const ref = db.ref(`sharedSigns/${lang}`);
    const handler = (snap) => {
      const val = snap.val() || {};
      const out = {};
      Object.keys(val).forEach((encodedLabel) => {
        const label = decodeLabel(encodedLabel);
        // val[encodedLabel] is { pushId1: entry, pushId2: entry, ... };
        // flatten to the plain array shape the rest of the app expects.
        out[label] = Object.keys(val[encodedLabel] || {}).map((k) => val[encodedLabel][k]);
      });
      onChange(out);
    };
    ref.on('value', handler, (err) => { console.error('HEAR: shared sign subscription error', err); onChange({}); });
    return () => ref.off('value', handler);
  }

  return { isConfigured, publish, subscribe };
})();
