/* HEAR — Firebase project config.

   Fill this in with YOUR OWN Firebase project's config to turn on live
   sign sharing (see js/shared-sync.js). Until you do, HEAR keeps
   working exactly as before: every visitor still sees a static
   snapshot of shared signs (data/shared-dataset*.json), just not a
   live one.

   How to get these values (one-time setup, free tier is enough for a
   small project):
     1. https://console.firebase.google.com → "Add project".
     2. In the project, click the "</>" (web app) icon to register a
        web app — you don't need Hosting, Auth, or anything else.
     3. Firebase gives you a config object; paste its values below.
     4. In the left sidebar, open "Realtime Database" → "Create
        Database" (start in a supported region). This is what actually
        stores shared signs at runtime.
     5. Under the Realtime Database's "Rules" tab, set rules that at
        least validate the shape of what's written — see
        data/README.md for a starting-point example. The default
        "anyone can read/write" test-mode rules are NOT safe to leave
        on for long: they let anyone overwrite or spam the shared
        dataset that every visitor's browser trusts.

   Also make sure sign.html and collect.html load the Firebase SDK
   script tags (see the comments already in those files) BEFORE this
   file and shared-sync.js. */

window.HEAR_FIREBASE_CONFIG = {
  apiKey: '',
  authDomain: '',
  databaseURL: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: ''
};
