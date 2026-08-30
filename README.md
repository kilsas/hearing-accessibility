# Shared sign data — live sync

Checking **"Contribute to HEAR's shared model"** on `collect.html` and
saving a sequence now publishes it live: every visitor's browser
recognizes it immediately, with no export file, no waiting for a
maintainer, and no per-visitor import step. This is powered by
Firebase Realtime Database — see `js/shared-sync.js` for the client
code and `js/firebase-config.js` for where you plug in your project.

## One-time setup (required for the "everyone, immediately" behavior)

HEAR is a static site with no backend of its own, so *some* place
reachable by every visitor has to hold the shared data. Firebase
Realtime Database is a free-tier-friendly, serverless option that
needs no custom backend code — just a project and a config object.

1. Create a project at https://console.firebase.google.com.
2. Register a web app in it (the "</>" icon) — you don't need
   Hosting, Auth, or anything beyond the Realtime Database.
3. Enable **Realtime Database** for the project.
4. Copy the web app's config values into `js/firebase-config.js`
   (`apiKey`, `authDomain`, `databaseURL`, `projectId`, etc.).
5. Set Realtime Database **security rules** — do not leave the
   default "anyone can read/write, expires in 30 days" test-mode rules
   on. A minimal shape-validating starting point:

   ```json
   {
     "rules": {
       "sharedSigns": {
         "$lang": {
           "$label": {
             ".read": true,
             "$pushId": {
               ".write": true,
               ".validate": "newData.hasChildren(['seq','p','shared']) && newData.child('seq').val().length > 0"
             }
           }
         }
       }
     }
   }
   ```

   This only checks *shape*, not *content* — it won't stop someone
   from publishing a low-quality or mislabeled sequence, only from
   writing something structurally broken. Since this live path has no
   human review step, treat it like any other open community
   contribution channel: consider adding Firebase App Check and/or
   moderation tooling (e.g. a way to delete a bad entry from the
   Firebase console) if this goes to real users.

Once configured, `js/shared-sync.js` detects the config automatically
— no other code changes needed. Nothing about a visitor's own camera
feed is ever uploaded; this only ever transmits the 126-number-per-frame
landmark sequence + label + collector name for entries someone
explicitly marked "shared."

## If you don't set this up

`js/firebase-config.js` ships with empty placeholder values. With
those left blank, `isSharedSyncLive()` returns `false` everywhere, and
the site falls back to the previous behavior automatically:

- "Contribute to HEAR's shared model" still records locally (personal
  dataset), it just doesn't publish anywhere live.
- Every visitor's browser instead fetches a one-time static snapshot —
  `shared-dataset.json` (ASL) / `shared-dataset_KSL.json` (KSL) — the
  same two files as before. A maintainer updates these manually from
  merged "Export shared contribution" files (still available on
  collect.html as a manual backup path) and redeploys; visitors then
  pick up the new snapshot on their next visit, not live.

Both files currently ship empty (`{}`).
