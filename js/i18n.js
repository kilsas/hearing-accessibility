/* HEAR — UI language switcher (English / Korean).

   This is the SITE's interface language (menus, headings, buttons).
   uiLanguage, speechLanguage (Live Hear's recognition language), and
   signLanguage (ASL/KSL on Sign to Text) are three related but not
   identical settings — a person could reasonably want a Korean
   interface while signing ASL, for instance. So:

     - Choosing a UI language sets the *default* speech and sign
       language to match (en → en-US/ASL, ko → ko-KR/KSL), on the
       theory that most people want all three to move together.
     - Explicitly choosing a speech language (Live Hear's toggle) or
       sign language (the ASL/KSL picker) overrides that default and
       is remembered from then on — switching the UI language again
       will not silently override an explicit choice.

   speechLanguage's override is tracked here (getSpeechLang/
   setSpeechLang). signLanguage's own persistence already lives in
   sign-classifier.js (whatever's saved under hear_sign_language IS
   the override — see its comments), so this file only supplies the
   *default* sign language for when nothing has been saved yet. */

window.HearI18n = (function () {
  const STORAGE_KEY = 'hear_ui_lang';
  const DEFAULT_LANG = 'en';
  const SPEECH_STORAGE_KEY = 'hear_speech_lang';
  const SPEECH_OVERRIDE_KEY = 'hear_speech_lang_override';

  const dict = {
    en: {
      // ---- shared chrome ----
      'nav.screening': 'Check My Experience',
      'nav.hear': 'Live Hear',
      'nav.sign': 'Sign to Text',
      'nav.accessibility': 'Accessibility Guide',
      'nav.experience': 'Experience',
      'nav.insights': 'Insights',
      'nav.about': 'About',
      'footer.tagline': 'HEAR — a web-based accessibility platform for everyday communication.',
      'footer.notice': 'Not a medical device. Does not diagnose hearing loss.',

      // ---- index.html ----
      'index.title': 'HEAR — Making everyday communication more accessible.',
      'index.eyebrow': 'Accessibility platform',
      'index.h1': 'HEAR',
      'index.lede': "Hearing doesn't work the same way for everyone.",
      'index.sub': 'HEAR helps you understand your listening experience and discover tools that can make everyday communication easier — for you, and for the people around you.',
      'index.cta1': 'Check My Listening Experience →',
      'index.cta2': 'Explore HEAR',
      'index.problem.kicker': 'The problem',
      'index.problem.h2': 'Hearing loss is more than "not hearing."',
      'index.problem.c1.h3': 'Communication',
      'index.problem.c1.p': 'Following conversations, especially in groups where more than one voice competes for attention.',
      'index.problem.c2.h3': 'Environment',
      'index.problem.c2.p': 'Classrooms, restaurants, meetings, and public spaces each present a different kind of listening challenge.',
      'index.problem.c3.h3': 'Sound',
      'index.problem.c3.p': 'Locating and recognizing sounds around you — not just whether you can hear them at all.',
      'index.statement': 'Accessibility should adapt to people — not the other way around.',
      'index.how.kicker': 'How HEAR works',
      'index.how.h2': 'From your listening experience to tools you can use today.',
      'index.how.c1.h3': '1. Check your experience',
      'index.how.c1.p': 'A short interactive screening explores how you respond to different sounds and listening conditions.',
      'index.how.c2.h3': '2. See your profile',
      'index.how.c2.p': 'Get a personalized listening profile with the situations that may be more challenging for you.',
      'index.how.c3.h3': '3. Use Live Hear',
      'index.how.c3.p': 'Turn speech into live captions for real conversations, right from your phone or laptop.',

      // ---- about.html ----
      'about.title': 'About — HEAR',
      'about.kicker': 'Why I built HEAR',
      'about.h1': 'Why I built HEAR',
      'about.p1.kicker': 'Experience',
      'about.p1': '[I experienced] — Start with a specific, concrete moment from your own listening experience: a place, a conversation, a situation where communication broke down in a way that stayed with you.',
      'about.p2.kicker': 'Noticing',
      'about.p2': '[I noticed] — Describe the pattern you started to see once you paid attention: how much everyday communication depends on assumptions about how people hear, and how invisible that can be to everyone else in the room.',
      'about.p3.kicker': 'Question',
      'about.p3': '[I questioned] — What question did that pattern leave you with? Was it about why accessibility tools exist the way they do, or why so much of the burden falls on the person with hearing loss to adapt?',
      'about.p4.kicker': 'Research',
      'about.p4': '[I researched] — What did you look into to understand the problem better — conversations with other people who are hard of hearing, research on communication access, existing tools you tried and what they got wrong?',
      'about.p5.kicker': 'Building',
      'about.p5': '[I built] — HEAR is the result: a platform that goes beyond explaining hearing loss, toward something that helps people navigate communication itself — understanding their own listening experience, finding strategies that fit them, and using tools like Live Hear in the moment.',
      'about.statement': 'Don\u2019t just ask, "How well can you hear?" Ask, "How well can the world communicate with you?"',
      'about.what.kicker': 'What HEAR is',
      'about.what.h2': 'A platform, not a diagnosis',
      'about.what.p': 'HEAR is a web-based accessibility platform inspired by real experiences of hearing loss. Rather than treating hearing loss as a single medical condition, HEAR is designed around the everyday communication environments in which people experience barriers — classrooms, restaurants, meetings, and conversations with the people closest to them. The platform combines an interactive listening assessment, personalized accessibility recommendations, real-time captions, and anonymous user insights.',
      'about.notice': 'HEAR is not a medical device and does not diagnose hearing loss. If you have concerns about your hearing, consider consulting a qualified hearing professional.',

      // ---- accessibility.html ----
      'access.title': 'Make It Accessible — HEAR',
      'access.kicker': 'For the people around you',
      'access.h1': 'Make communication more accessible.',
      'access.sub': 'Small changes can make conversations easier for everyone.',
      'access.tab.teachers': '👩\u200d🏫 For Teachers',
      'access.tab.families': '👨\u200d👩\u200d👧 For Families',
      'access.tab.friends': '🧑 For Friends & Classmates',
      'access.teachers.before.h3': 'Before speaking',
      'access.teachers.before.li1': "Get the student's attention first",
      'access.teachers.before.li2': 'Face the student directly',
      'access.teachers.before.li3': 'Make important information available visually',
      'access.teachers.during.h3': 'During class',
      'access.teachers.during.li1': 'Avoid speaking while facing away from the class',
      'access.teachers.during.li2': 'Reduce unnecessary background noise',
      'access.teachers.during.li3': 'Repeat or rephrase important information when needed',
      'access.teachers.group.h3': 'Group discussion',
      'access.teachers.group.li1': 'Encourage one person to speak at a time',
      'access.teachers.group.li2': 'Identify who is speaking before they begin',
      'access.teachers.group.li3': 'Provide written instructions alongside verbal ones',
      'access.families.home.h3': 'At home',
      'access.families.home.li1': 'Get their attention before starting a conversation',
      'access.families.home.li2': 'Keep the TV or music down during conversations',
      'access.families.home.li3': 'Face them when speaking, especially across a room',
      'access.families.gath.h3': 'Family gatherings',
      'access.families.gath.li1': 'Choose quieter seating away from kitchens or speakers',
      'access.families.gath.li2': 'Let one person speak at a time when possible',
      'access.families.gath.li3': 'Check in privately if something was missed, without singling them out',
      'access.friends.conv.h3': 'In conversation',
      'access.friends.conv.li1': 'Face them when you talk, even in passing',
      'access.friends.conv.li2': 'Rephrase instead of just repeating louder',
      'access.friends.conv.li3': 'Suggest quieter spots for important conversations',
      'access.friends.groups.h3': 'In groups',
      'access.friends.groups.li1': 'Avoid talking over each other',
      'access.friends.groups.li2': 'Recap key points if the topic changes quickly',
      'access.friends.groups.li3': 'Ask what helps rather than assuming',
      'access.statement': 'Don\u2019t just ask, "How well can you hear?" Ask, "How well can the world communicate with you?"',

      // ---- experience.html ----
      'exp.title': 'Experience — HEAR',
      'exp.kicker': 'Try it yourself',
      'exp.h1': 'Experience a challenging listening environment.',
      'exp.notice': 'This is an educational simulation. It does not reproduce every person\u2019s experience of hearing loss, and different people experience hearing loss differently.',
      'exp.classroom.h3': 'Classroom',
      'exp.classroom.p': 'Hear a lesson the way it might sound with reduced clarity and classroom chatter.',
      'exp.restaurant.h3': 'Restaurant',
      'exp.restaurant.p': 'Try following a conversation over clattering dishes and nearby tables.',
      'exp.group.h3': 'Group conversation',
      'exp.group.p': 'Multiple voices overlap as a group conversation moves quickly.',
      'exp.sim.label': 'Simulation',
      'exp.sim.question': 'How much information could you follow?',
      'exp.sim.most': 'Most of it',
      'exp.sim.some': 'Some of it',
      'exp.sim.little': 'Very little',
      'exp.sim.resultText': 'Thanks for trying the simulation. This is closer to what many people with hearing loss experience in noisy, fast-moving conversations — every day.',
      'exp.sim.resultCta': 'See what can help →',

      // ---- insights.html ----
      'insights.title': 'Insights — HEAR',
      'insights.kicker': 'Community data',
      'insights.h1': 'What HEAR users are telling us.',
      'insights.sub': 'Based on anonymous responses from HEAR users. No names, emails, or medical information are collected.',
      'insights.envs.h3': 'Most challenging environments',
      'insights.strats.h3': 'Most helpful strategies',
      'insights.env.restaurant': 'Restaurant',
      'insights.env.group': 'Group conversation',
      'insights.env.classroom': 'Classroom',
      'insights.env.meetings': 'Meetings',
      'insights.env.calls': 'Phone calls',
      'insights.strat.captions': 'Captions',
      'insights.strat.facing': 'Facing the speaker',
      'insights.strat.quiet': 'Quiet environment',
      'insights.strat.written': 'Written instructions',
      'insights.strat.seating': 'Seating position',
      'insights.notice': 'These figures are illustrative sample data for the current version of HEAR. As more users complete the screening and accessibility profile, this page will reflect real, anonymized aggregate results — never individual responses.',

      // ---- hear.html ----
      'hear.title': 'Live Hear — HEAR',
      'hear.kicker': 'Live captions',
      'hear.h1': 'Live Hear',
      'hear.sub': "Turn speech into accessible text, in real time, right in your browser.",
      'hear.unsupported': "Live captions aren't supported in this browser. Try Chrome or Edge on desktop or Android for the best experience.",
      'hear.captionPlaceholder': 'Press "Start Listening" and begin speaking.',
      'hear.startBtn': '🎙 Start Listening',
      'hear.stopBtn': '⏹ Stop Listening',
      'hear.statusLive': 'Listening',
      'hear.statusOff': 'Not listening',
      'hear.notice': "Live Hear uses your device's microphone and browser speech recognition. Audio is processed by your browser and is not stored by HEAR.",
      'hear.size': 'Text size',
      'hear.size.small': 'Small', 'hear.size.medium': 'Medium', 'hear.size.large': 'Large',
      'hear.contrast': 'Contrast',
      'hear.contrast.normal': 'Normal', 'hear.contrast.high': 'High',
      'hear.language': 'Language',
      'hear.language.en': 'English', 'hear.language.ko': 'Korean',
      'hear.speed': 'Caption speed',
      'hear.speed.slow': 'Slow', 'hear.speed.normal': 'Normal', 'hear.speed.fast': 'Fast',
      'hear.deniedMic': 'Microphone access was denied. Please allow microphone access to use Live Hear.',
      'hear.listening': 'Listening…',

      // ---- profile.html / profile.js ----
      'profile.title': 'Your Listening Profile — HEAR',
      'profile.empty.h2': 'No listening profile yet',
      'profile.empty.p': 'Take the screening first to see your personalized results.',
      'profile.empty.cta': 'Check My Listening Experience →',
      'profile.results.kicker': 'Your results',
      'profile.results.h2': 'Your Listening Profile',
      'profile.results.p': 'These results describe your performance during this screening and should not be interpreted as an audiogram or medical diagnosis.',
      'profile.strongest.kicker': 'Your strongest areas',
      'profile.challenge.kicker': 'Areas that may be more challenging',
      'profile.recs.kicker': 'Recommendations',
      'profile.recs.h2': 'What might help?',
      'profile.myprofile.kicker': 'My Profile',
      'profile.myprofile.h2': 'Tell us more about your experience',
      'profile.myprofile.p': 'Combine your screening results with your own experience for a fuller picture.',
      'profile.situations.h3': 'Which situations are difficult for you?',
      'profile.helps.h3': 'What helps you most?',
      'profile.access.kicker': 'Your Accessibility Profile',
      'profile.cta.hear': 'Try Live Hear →',
      'profile.cta.retake': 'Retake Screening',
      'metric.detectionLeft': 'Sound Detection — Left',
      'metric.detectionRight': 'Sound Detection — Right',
      'metric.localization': 'Sound Localization',
      'metric.speechQuiet': 'Speech — Quiet',
      'metric.speechNoise': 'Speech — Background Noise',
      'metric.tonesSub': '{n} of 5 tones detected',
      'metric.localizationSub': 'Accuracy identifying direction',
      'metric.speechSub': 'Word-level recognition accuracy',
      'metric.speechQuietSub': 'Word-level recognition accuracy',
      'metric.speechNoiseSub': 'Word-level recognition accuracy in background noise',
      'score.detectionLeft': 'sounds presented to the left channel',
      'score.detectionRight': 'sounds presented to the right channel',
      'score.localization': 'identifying where sounds came from',
      'score.speechQuiet': 'speech presented in a quiet environment',
      'score.speechNoise': 'speech presented with background noise',
      'profile.strongestText': 'You performed consistently well on {list}.',
      'profile.challengeText': 'Your responses were less consistent for {list}.',
      'rec.speechNoise.title': 'Reduce background noise',
      'rec.speechNoise.body': 'When possible, move conversations to quieter spaces or turn down competing sound sources.',
      'rec.detection.title': 'Choose your position strategically',
      'rec.detection.body': 'Position yourself so your stronger side faces the speaker in group settings.',
      'rec.localization.title': 'Face the speaker',
      'rec.localization.body': 'Visual information — lip movement, gestures, and expression — can support communication when locating sound is harder.',
      'rec.speechQuiet.title': 'Use captions',
      'rec.speechQuiet.body': 'For important conversations or instructions, live captions can add clarity even in easy listening conditions.',
      'rec.default.title': 'Use captions',
      'rec.default.body': "For important conversations or instructions, try HEAR's Live Hear captioning tool.",
      'situation.classroom': 'Classroom', 'situation.restaurant': 'Restaurant',
      'situation.group': 'Group conversation', 'situation.calls': 'Phone calls',
      'situation.transit': 'Public transportation', 'situation.meetings': 'Meetings',
      'situation.outdoor': 'Outdoor environments',
      'helps.captions': 'Captions', 'helps.facing': 'Facing the speaker',
      'helps.quiet': 'Quiet environment', 'helps.written': 'Written instructions',
      'helps.repetition': 'Repetition', 'helps.seating': 'Seating position',
      'profile.accessSummary.empty': 'Select the situations above to see a personalized summary.',
      'profile.accessSummary.text': 'Your responses suggest that {list} {verb} among your biggest communication challenges.',
      'profile.accessSummary.are': 'are', 'profile.accessSummary.is': 'is', 'profile.accessSummary.and': 'and',

      // ---- screening.html / screening.js ----
      'screening.title': 'Check Your Listening Experience — HEAR',
      'screen.stage.gettingReady': 'Getting ready',
      'screen.stage.detection': 'Sound Detection',
      'screen.stage.localization': 'Sound Localization',
      'screen.stage.speechQuiet': 'Speech — Quiet',
      'screen.stage.speechNoise': 'Speech — Background Noise',
      'screen.stage.complete': 'Complete',
      'screen.intro.label': 'Before you begin',
      'screen.intro.h2': 'How do you experience sound?',
      'screen.intro.p': 'Take a short interactive screening to explore how you respond to different sounds. This takes about 4–5 minutes.',
      'screen.intro.notice': 'This screening is not a medical hearing test or diagnosis. Results may be affected by your device and listening environment. If you have concerns about your hearing, consider consulting a qualified hearing professional.',
      'screen.intro.li1': 'Use headphones or earbuds',
      'screen.intro.li2': 'Find a quiet environment',
      'screen.intro.li3': 'Set your device volume to a comfortable level',
      'screen.intro.li4': 'Do not use this test to make medical decisions',
      'screen.intro.begin': 'Begin Screening',
      'screen.detection.label': 'Sound Detection — {side} channel',
      'screen.detection.left': 'Left', 'screen.detection.right': 'Right',
      'screen.detection.h2': 'Did you hear a sound?',
      'screen.detection.p': 'Press play, then tell us whether you heard the tone.',
      'screen.trial': 'Trial {n} of {total}',
      'screen.yes': 'Yes', 'screen.no': 'No',
      'screen.local.label': 'Sound Localization',
      'screen.local.h2': 'Where did you hear the sound?',
      'screen.local.p': 'Press play, then select the direction the sound came from.',
      'screen.local.left': 'Left', 'screen.local.center': 'Center', 'screen.local.right': 'Right',
      'screen.speech.labelQuiet': 'Speech — Quiet',
      'screen.speech.labelNoise': 'Speech — Background Noise',
      'screen.speech.h2': 'Type the sentence you heard.',
      'screen.speech.p': 'Press play and listen carefully{noiseNote}. Then type what you heard as closely as you can.',
      'screen.speech.noiseNote': ' — background noise will be present',
      'screen.speech.placeholder': 'Type what you heard...',
      'screen.speech.submit': 'Submit',
      'screen.sentence': 'Sentence {n} of {total}',
      // Content spoken/typed during the Speech stages — these are what's
      // being tested, not interface chrome, so they follow the UI
      // language like everything else here: a Korean-language screening
      // uses Korean sentences and Korean text-to-speech, not English
      // sentences with Korean labels around them.
      'screen.quiet.0': 'The meeting begins at three.',
      'screen.quiet.1': 'Please close the door behind you.',
      'screen.noise.0': 'Turn left at the next light.',
      'screen.noise.1': 'The package arrived this morning.',
      'screen.done.label': 'Screening complete',
      'screen.done.h2': 'Thanks for completing the screening.',
      'screen.done.p': "We're putting together your Listening Profile now.",
      'screen.done.cta': 'See My Listening Profile →',

      // ---- sign.html / sign.js ----
      'sign.title': 'Sign to Text — HEAR',
      'sign.kicker': 'Experimental · V2',
      'sign.h1': 'Sign to Text',
      'sign.sub': 'Communicate through signs, words, or both. This experimental tool tracks both hands and recognizes a growing, community-expandable set of signs — including their motion, not just a still hand shape — using your camera.',
      'sign.notice': 'Prototype notice: This tool recognizes the vocabulary shown below, trained on video sequences recorded in browsers like yours. It should not be used as a substitute for professional interpretation, and accuracy depends entirely on the training data behind each sign.',
      'sign.selectLang.h2': 'Select your sign language',
      'sign.vocabCount': '\u2713 {n} {name} signs available',
      'sign.addSignCta': "Can't find your sign? + Add New Sign",
      'sign.perm.label': 'Camera access required',
      'sign.perm.h2': 'Allow camera access',
      'sign.perm.p': 'HEAR uses your camera to analyze hand movements locally in your browser. Your camera feed is not uploaded.',
      'sign.perm.btn': '🎥 Allow Camera',
      'sign.leftHand': 'Left hand', 'sign.rightHand': 'Right hand',
      'sign.diag.h3': 'Hand detection test',
      'sign.diag.p': 'Before recognizing signs, confirm the camera reads your left and right hand correctly.',
      'sign.diag.run': 'Run hand test',
      'sign.diag.promptLeft': 'Raise your LEFT hand.',
      'sign.diag.promptRight': 'Raise your RIGHT hand.',
      'sign.diag.done': '✓ Test complete — left/right detection looks correct.',
      'sign.diag.retry': 'Run again',
      'sign.detectedLabel': 'Detected sign',
      'sign.confidenceDefault': 'Show a sign to the camera and hold the motion for a moment',
      'sign.addBtn': 'Add', 'sign.clearBtn': 'Clear',
      'sign.recognized.h3': 'Recognized signs',
      'sign.recognized.empty': 'Recognized signs will appear here.',
      'sign.undo': '← Undo', 'sign.clearSentence': 'Clear sentence', 'sign.speak': '🔊 Speak',
      'sign.suggestedLabel': 'Suggested phrase (word-for-word — not a verified translation)',
      'sign.footerNote': 'Want to improve accuracy or add your own signs? Use the {collectLink} to record training sequences, or check the {accuracyLink}.',
      'sign.collectLinkText': 'data collection tool',
      'sign.accuracyLinkText': 'current model accuracy',
      'sign.noHand': 'No hand detected',
      'sign.keepSigning': 'Keep signing…',
      'sign.noTraining': 'No training data yet',
      'sign.holdSteady': 'Hold the sign steady',
      'sign.cameraUnavailable': 'Camera unavailable',
      'sign.confidenceLabel': 'Model confidence',
      'sign.stabilityLabel': 'stability',
      'sign.datasetNotice': "You don't have much training data yet. Sign to Text learns from video sequences you record yourself. Visit the {link} to teach HEAR a few signs before trying live recognition.",

      // ---- collect.html / collect.js ----
      'collect.title': 'Sign Data Collection — HEAR',
      'collect.back': '← Back to Sign to Text',
      'collect.kicker': 'Developer tool · V2',
      'collect.h1': 'Sign Data Collection',
      'collect.p': "Record short video sequences of each sign to train HEAR's on-device sign classifier. Each recording captures both hands, frame by frame, so the model can learn the motion of a sign — not just a single hand pose. Nothing here is uploaded — sequences are stored in this browser's local storage.",
      'collect.langSection.h2': 'Language / dataset',
      'collect.langSection.p': 'ASL and KSL are separate vocabularies with separate datasets and separate models — sequences you record here only ever train the language selected below.',
      'collect.addSign.h3': 'Add a new sign',
      'collect.addSign.p': 'This only creates the label — you (or another collector) still have to record real sequences of the sign for it to be useful. Adding a word does not generate its sign.',
      'collect.addSign.placeholder': 'e.g. GOODBYE or 안녕히 가세요',
      'collect.addSign.btn': 'Add sign',
      'collect.perm.label': 'Camera access required',
      'collect.perm.h2': 'Allow camera access',
      'collect.perm.p': 'Your camera feed is processed locally and is not uploaded by HEAR.',
      'collect.perm.btn': '🎥 Allow Camera',
      'collect.leftHand': 'Left hand', 'collect.rightHand': 'Right hand',
      'collect.startRecord': '🎥 Start Recording',
      'collect.recordHint': 'Records for up to 10 seconds — sign the word once, then press Stop (or let it stop on its own).',
      'collect.recording': 'Recording',
      'collect.stop': '⏹ Stop Recording',
      'collect.save': 'Save Sequence',
      'collect.retry': 'Record Again',
      'collect.tooShort': "That recording was too short — hold the sign for at least a second or two and try again.",
      'collect.collectorLabel': 'Collector name',
      'collect.collectorPlaceholder': 'e.g. your name or initials',
      'collect.collectorHint': 'Recording sequences from more than one person lets HEAR measure how well the model recognizes signs from someone it has never seen before — see "Unseen-participant accuracy" below.',
      'collect.selectSign': 'Select sign',
      'collect.sampleCountText': 'Sequences collected for this sign:',
      'collect.dataset.h2': 'Dataset',
      'collect.perSign.h3': 'Sequences per sign',
      'collect.perSign.hint': 'Tap a sign to see its individual recordings and delete just one, if needed.',
      'collect.manage.h3': 'Manage dataset',
      'collect.manage.p': 'Export your recordings to back them up or share with a collaborator, or import a dataset someone else recorded.',
      'collect.export': 'Export my dataset (.json)',
      'collect.import': 'Import dataset (merges in)',
      'collect.clearAll': 'Clear all sequences',

      // ---- shared model consent ----
      'collect.consent.h3': 'Before you save this sequence',
      'collect.consent.personal': 'Add to my personal model only',
      'collect.consent.personal.sub': "Stays in this browser. Used for your own accuracy testing, never included in a shared export.",
      'collect.consent.shared': "Contribute to HEAR's shared model",
      'collect.consent.shared.sub': "Published immediately — every visitor's browser can recognize this sign right away, with no export or review step.",
      'collect.liveStatus.on': '✓ Live sharing is on — anything saved with this option becomes usable by every visitor immediately.',
      'collect.liveStatus.off': "Live sharing isn't set up on this deployment yet, so this stays saved on this device until it's exported and merged the manual way (see \u201cShared model contribution\u201d below).",
      'collect.sharedPanel.h3': 'Shared model contribution',
      'collect.sharedPanel.p': "Sequences saved with \u201cContribute to HEAR's shared model\u201d checked are already published live the moment you save them — see the note above the Save button. This section is a separate, manual backup path: export everything marked shared as a file, in case you want a reviewed snapshot handed to a maintainer instead of (or in addition to) the live path above.",
      'collect.sharedPanel.gate': 'A sign is ready to contribute once it has at least {min} shared sequences from at least {people} different collector(s).',
      'collect.exportShared': 'Export shared contribution (.json)',
      'collect.exportShared.none': 'No signs meet the contribution threshold yet — keep recording with "Contribute to HEAR\u2019s shared model" selected.',
      'collect.sharedReady.h3': 'Ready to contribute',
      'collect.sharedReady.none': 'None yet',
      'collect.importMerge.notice': 'Importing merges these sequences into your existing dataset — it does not replace or delete anything you already recorded.',
      'collect.status.core': 'Core',
      'collect.status.pending': 'Pending',
      'collect.status.validated': 'Validated',
      'collect.perCollector.h3': 'Sequences per collector',
      'collect.perCollector.p': "Only collectors who've actually recorded sequences appear here.",
      'collect.accuracy.h2': 'Model accuracy',
      'collect.accuracy.p': 'Estimated with leave-one-out cross-validation over your recorded sequences: each sequence is compared frame-by-frame against every other sequence, so this reflects real performance on your data — not a placeholder number.',
      'collect.evalBtn': 'Evaluate accuracy',
      'collect.generalization.h2': 'Unseen-participant accuracy',
      'collect.generalization.p': 'This holds out one collector\u2019s sequences at a time, trains only on everyone else\u2019s, and tests against the held-out person. It answers a different question than the number above: not "does the model remember this data" but "does it generalize to someone it has never seen sign before." Needs at least two collectors\u2019 worth of sequences.',
      'collect.noSequences': 'No sequences recorded yet.',
      'collect.sequencesUnit': 'sequences',
      'collect.noSequencesYet': 'No sequences yet — record some signs first.',
      'collect.needTwoCollectors': 'Record sequences from at least two different collectors to see this.',
      // Per-sequence delete — lets someone remove one bad recording
      // instead of clearing an entire sign (see collect.js's expandable
      // per-sign list).
      'collect.noEntries': 'No sequences recorded for this sign yet.',
      'collect.deleteSequence': 'Delete this sequence',
      'collect.deleteConfirm': 'Delete this recording? This can\u2019t be undone — you can always record another.',
      'collect.badge.shared': 'Shared',
      'collect.confusion.h3': 'Confusion matrix',
      'collect.confusion.p': 'Rows are the sign that was actually shown; columns are what the model predicted. Off-diagonal numbers (in red) show which signs get mixed up with each other.',
      'collect.importFail': 'That file could not be read as a HEAR dataset.',
      'collect.summary.language': 'Language',
      'collect.summary.sign': 'Sign',
      'collect.summary.duration': 'Duration',
      'collect.summary.frames': 'Frames captured',
      'collect.summary.hands': 'Hands detected',
      'collect.summary.bothHands': 'Both hands',
      'collect.summary.oneHand': 'One hand',
      'collect.summary.noHands': 'None',
      'collect.summary.sec': 'sec',
      'collect.table.collector': 'Collector',
      'collect.table.total': 'Total',
      'collect.confusion.actualPredicted': 'Actual \\ Predicted',
      'collect.overallAccuracy': 'Overall accuracy (leave-one-out, {n} sequences)',
      'collect.overallAccuracy.sub': 'Computed live from your recorded sequences — not a fixed figure.',
      'collect.unseenAccuracy': 'Unseen-participant accuracy ({people} collectors, {n} held-out sequences)',
      'collect.unseenAccuracy.sub': "Each collector's sequences were held out and tested against a model trained only on everyone else's.",
      'collect.startingCamera': 'Starting camera…',
      'collect.clearConfirm': 'Clear all recorded {lang} training sequences? This cannot be undone.'
    },

    ko: {
      'nav.screening': '내 경험 확인하기',
      'nav.hear': '실시간 자막',
      'nav.sign': '수어 → 텍스트',
      'nav.accessibility': '접근성 가이드',
      'nav.experience': '체험하기',
      'nav.insights': '인사이트',
      'nav.about': '소개',
      'footer.tagline': 'HEAR — 일상적인 소통을 더 쉽게 만드는 웹 기반 접근성 플랫폼입니다.',
      'footer.notice': '의료기기가 아니며 청력 손실을 진단하지 않습니다.',

      'index.title': 'HEAR — 일상적인 의사소통을 더 쉽게 만듭니다.',
      'index.eyebrow': '접근성 플랫폼',
      'index.h1': 'HEAR',
      'index.lede': '듣는 방식은 사람마다 다릅니다.',
      'index.sub': 'HEAR는 당신의 듣기 경험을 이해하고, 나와 주변 사람 모두를 위해 일상적인 소통을 더 쉽게 만들어 줄 도구를 찾도록 돕습니다.',
      'index.cta1': '내 듣기 경험 확인하기 →',
      'index.cta2': 'HEAR 둘러보기',
      'index.problem.kicker': '문제',
      'index.problem.h2': '청력 손실은 단순히 "안 들리는 것" 이상입니다.',
      'index.problem.c1.h3': '의사소통',
      'index.problem.c1.p': '특히 여러 목소리가 동시에 들리는 그룹 상황에서 대화를 따라가는 것.',
      'index.problem.c2.h3': '환경',
      'index.problem.c2.p': '교실, 식당, 회의실, 공공장소는 각각 서로 다른 청취 어려움을 만듭니다.',
      'index.problem.c3.h3': '소리',
      'index.problem.c3.p': '단순히 소리가 들리는지 여부가 아니라, 주변 소리를 찾아내고 구분하는 것.',
      'index.statement': '접근성은 사람에게 맞춰져야 합니다 — 그 반대가 아니라.',
      'index.how.kicker': 'HEAR는 이렇게 작동합니다',
      'index.how.h2': '청취 경험 확인부터 오늘 바로 쓸 수 있는 도구까지.',
      'index.how.c1.h3': '1. 경험 확인하기',
      'index.how.c1.p': '짧은 인터랙티브 스크리닝으로 다양한 소리와 듣기 환경에 대한 반응을 살펴봅니다.',
      'index.how.c2.h3': '2. 프로필 확인하기',
      'index.how.c2.p': '나에게 더 어려울 수 있는 상황을 담은 맞춤형 듣기 프로필을 받아보세요.',
      'index.how.c3.h3': '3. Live Hear 사용하기',
      'index.how.c3.p': '실제 대화를 실시간 자막으로 바꿔줍니다 — 휴대폰이나 노트북에서 바로.',

      'about.title': '소개 — HEAR',
      'about.kicker': 'HEAR를 만든 이유',
      'about.h1': 'HEAR를 만든 이유',
      'about.p1.kicker': '경험',
      'about.p1': '일상에서 소리를 듣는 경험에서 시작하세요. 어떤 장소에서, 어떤 대화에서, 혹은 어떤 소통의 순간이 오래 기억에 남았나요?',
      'about.p2.kicker': '발견',
      'about.p2': '관심을 가지고 주변을 바라보기 시작하면 새로운 패턴이 보입니다. 우리가 일상에서 얼마나 자연스럽게 "사람들은 잘 들을 것"이라고 가정하고 소통하는지, 그리고 그 가정이 누군가에게는 얼마나 큰 장벽이 될 수 있는지 발견하게 됩니다.',
      'about.p3.kicker': '질문',
      'about.p3': '그런 경험과 발견은 어떤 질문으로 이어졌나요? 왜 접근성 도구는 지금과 같은 방식으로만 만들어져 있을까요? 왜 소통에 적응해야 하는 부담은 청력 손실을 가진 사람에게만 돌아가야 할까요?',
      'about.p4.kicker': '조사',
      'about.p4': '문제를 더 깊이 이해하기 위해 다른 사람들의 경험을 듣고, 의사소통 접근성에 관한 연구를 찾아보고, 기존의 도구들을 직접 살펴보았습니다.',
      'about.p5.kicker': '제작',
      'about.p5': '그 고민에서 HEAR가 시작되었습니다. HEAR는 청력 손실을 설명하는 데서 그치지 않습니다. 자신이 소리를 듣고 소통하는 방식을 이해하고, 나에게 맞는 의사소통 방법을 찾고, 필요한 순간에 Live Hear와 같은 접근성 도구를 사용할 수 있도록 돕습니다.',
      'about.statement': '"얼마나 잘 들리나요?"라고만 묻지 마세요. "세상이 당신과 얼마나 잘 소통하고 있나요?"라고 물어보세요.',
      'about.what.kicker': 'HEAR란',
      'about.what.h2': '진단이 아닌, 소통을 위한 플랫폼',
      'about.what.p': 'HEAR는 실제 청력 손실 경험에서 영감을 받아 만든 웹 기반 접근성 플랫폼입니다. 청력 손실을 하나의 의학적 상태로만 바라보기보다, 사람들이 실제로 소통의 어려움을 겪는 일상적인 환경에 집중합니다. 교실, 식당, 회의, 그리고 가까운 사람들과의 대화 속에서 어떤 장벽이 생기는지를 살펴봅니다. HEAR는 인터랙티브 스크리닝, 맞춤형 접근성 추천, 실시간 자막, 익명 사용자 인사이트를 하나의 플랫폼으로 제공합니다.',
      'about.notice': 'HEAR는 의료기기가 아니며 청력 손실을 진단하지 않습니다. 청력에 대해 걱정되는 점이 있다면 전문 청각 전문가와 상담해 주세요.',

      'access.title': '접근성 높이기 — HEAR',
      'access.kicker': '주변 사람들을 위해',
      'access.h1': '의사소통을 더 쉽게 만드는 방법',
      'access.sub': '작은 변화만으로도 모두가 더 편하게 대화할 수 있습니다.',
      'access.tab.teachers': '👩\u200d🏫 교사를 위해',
      'access.tab.families': '👨\u200d👩\u200d👧 가족을 위해',
      'access.tab.friends': '🧑 친구·급우를 위해',
      'access.teachers.before.h3': '말하기 전에',
      'access.teachers.before.li1': '먼저 학생의 주의를 끌어 주세요.',
      'access.teachers.before.li2': '학생을 정면으로 바라보고 이야기해 주세요.',
      'access.teachers.before.li3': '중요한 정보는 말뿐 아니라 글이나 이미지로도 알려 주세요.',
      'access.teachers.during.h3': '수업 중',
      'access.teachers.during.li1': '학급을 등진 채 이야기하지 마세요.',
      'access.teachers.during.li2': '불필요한 배경 소음을 줄여 주세요.',
      'access.teachers.during.li3': '필요한 경우 중요한 내용을 반복하거나 다른 방식으로 설명해 주세요.',
      'access.teachers.group.h3': '그룹 토론',
      'access.teachers.group.li1': '한 번에 한 사람씩 이야기하도록 해 주세요.',
      'access.teachers.group.li2': '이야기하기 전에 누가 말할지 알려 주세요.',
      'access.teachers.group.li3': '구두 설명과 함께 서면으로도 안내해 주세요.',
      'access.families.home.h3': '집에서',
      'access.families.home.li1': '대화를 시작하기 전에 먼저 주의를 끌어 주세요.',
      'access.families.home.li2': '대화 중에는 TV나 음악 소리를 줄여 주세요.',
      'access.families.home.li3': '특히 방 건너편에서 말할 때는 마주보고 이야기해 주세요.',
      'access.families.gath.h3': '가족 모임',
      'access.families.gath.li1': '주방이나 스피커에서 떨어진 조용한 자리를 선택해 주세요.',
      'access.families.gath.li2': '가능하다면 한 번에 한 사람씩 이야기해 주세요.',
      'access.families.gath.li3': '놓친 내용이 있으면 지목하지 말고 조용히 따로 확인해 주세요.',
      'access.friends.conv.h3': '대화 중에',
      'access.friends.conv.li1': '스쳐 지나가듯 말할 때도 마주보고 이야기해 주세요.',
      'access.friends.conv.li2': '그냥 더 크게 반복하기보다 다르게 표현해 주세요.',
      'access.friends.conv.li3': '중요한 대화는 더 조용한 곳을 제안해 주세요.',
      'access.friends.groups.h3': '그룹에서',
      'access.friends.groups.li1': '서로 말이 겹치지 않도록 해 주세요.',
      'access.friends.groups.li2': '주제가 빠르게 바뀌면 핵심 내용을 다시 정리해 주세요.',
      'access.friends.groups.li3': '짐작하지 말고 무엇이 도움이 되는지 물어봐 주세요.',
      'access.statement': '"얼마나 잘 들리나요?"라고만 묻지 마세요. "세상이 당신과 얼마나 잘 소통하고 있나요?"라고 물어보세요.',

      'exp.title': '체험하기 — HEAR',
      'exp.kicker': '직접 체험해보기',
      'exp.h1': '어려운 환경에서 소리를 듣는 경험을 직접 해보세요.',
      'exp.notice': '이것은 교육을 위한 시뮬레이션입니다. 모든 사람의 청력 손실 경험을 그대로 재현하는 것은 아니며, 청력 손실을 경험하는 방식은 사람마다 다릅니다.',
      'exp.classroom.h3': '교실',
      'exp.classroom.p': '교실의 소음과 또렷하지 않은 목소리가 섞인 환경에서 수업을 들어보세요.',
      'exp.restaurant.h3': '식당',
      'exp.restaurant.p': '그릇 부딪히는 소리와 주변 테이블의 대화 소음 속에서 대화를 따라가 보세요.',
      'exp.group.h3': '그룹 대화',
      'exp.group.p': '여러 사람의 목소리가 빠르게 오가고 겹치는 상황에서 대화를 따라가 보세요.',
      'exp.sim.label': '시뮬레이션',
      'exp.sim.question': '얼마나 이해할 수 있었나요?',
      'exp.sim.most': '대부분',
      'exp.sim.some': '일부',
      'exp.sim.little': '거의 못 들음',
      'exp.sim.resultText': '시뮬레이션에 참여해주셔서 감사합니다. 많은 청력 손실 당사자들이 매일 겪는, 시끄럽고 빠르게 진행되는 대화의 경험에 가까웠을 것입니다.',
      'exp.sim.resultCta': '도움이 될 방법 보기 →',

      'insights.title': '인사이트 — HEAR',
      'insights.kicker': '커뮤니티 데이터',
      'insights.h1': 'HEAR 사용자들이 가장 많이 이야기한 것들',
      'insights.sub': 'HEAR 사용자들의 익명 응답을 바탕으로 합니다. 이름, 이메일, 의료 정보는 수집하지 않습니다.',
      'insights.envs.h3': '가장 어려운 환경',
      'insights.strats.h3': '가장 도움이 되는 방법',
      'insights.env.restaurant': '식당',
      'insights.env.group': '그룹 대화',
      'insights.env.classroom': '교실',
      'insights.env.meetings': '회의',
      'insights.env.calls': '전화 통화',
      'insights.strat.captions': '자막',
      'insights.strat.facing': '화자를 마주보기',
      'insights.strat.quiet': '조용한 환경',
      'insights.strat.written': '서면으로 안내받기',
      'insights.strat.seating': '자리 위치',
      'insights.notice': '이 수치는 현재 버전 HEAR에서 사용되는 예시 데이터입니다. 더 많은 사용자가 스크리닝과 접근성 프로필을 완료하면 실제 익명 집계 결과로 업데이트됩니다. 개별 응답은 공개되지 않습니다.',

      'hear.title': '실시간 자막 — HEAR',
      'hear.kicker': '실시간 자막',
      'hear.h1': 'Live Hear',
      'hear.sub': '말을 실시간으로 자막으로 변환합니다 — 브라우저에서 바로 사용할 수 있습니다.',
      'hear.unsupported': '이 브라우저에서는 실시간 자막이 지원되지 않습니다. 최상의 경험을 위해 데스크톱이나 안드로이드의 Chrome, Edge를 사용해보세요.',
      'hear.captionPlaceholder': '"듣기 시작"을 누르고 말해보세요.',
      'hear.startBtn': '🎙 듣기 시작',
      'hear.stopBtn': '⏹ 듣기 중지',
      'hear.statusLive': '듣는 중',
      'hear.statusOff': '대기 중',
      'hear.notice': 'Live Hear는 기기의 마이크와 브라우저 음성 인식을 사용합니다. 오디오는 브라우저에서 처리되며 HEAR에 저장되지 않습니다.',
      'hear.size': '글자 크기',
      'hear.size.small': '작게', 'hear.size.medium': '보통', 'hear.size.large': '크게',
      'hear.contrast': '대비',
      'hear.contrast.normal': '기본', 'hear.contrast.high': '고대비',
      'hear.language': '언어',
      'hear.language.en': '영어', 'hear.language.ko': '한국어',
      'hear.speed': '자막 속도',
      'hear.speed.slow': '느리게', 'hear.speed.normal': '보통', 'hear.speed.fast': '빠르게',
      'hear.deniedMic': '마이크 접근이 거부되었습니다. Live Hear를 사용하려면 마이크 접근을 허용해 주세요.',
      'hear.listening': '듣는 중…',

      'profile.title': '나의 듣기 프로필 — HEAR',
      'profile.empty.h2': '아직 듣기 프로필이 없습니다',
      'profile.empty.p': '맞춤 결과를 보려면 먼저 스크리닝을 진행해주세요.',
      'profile.empty.cta': '내 듣기 경험 확인하기 →',
      'profile.results.kicker': '결과',
      'profile.results.h2': '나의 듣기 프로필',
      'profile.results.p': '이 결과는 이번 스크리닝에서 나타난 반응을 보여줍니다. 청력도(audiogram)나 의학적 진단 결과로 해석해서는 안 됩니다.',
      'profile.strongest.kicker': '가장 잘한 부분',
      'profile.challenge.kicker': '조금 더 어려웠던 부분',
      'profile.recs.kicker': '추천',
      'profile.recs.h2': '무엇이 도움이 될까요?',
      'profile.myprofile.kicker': '나의 프로필',
      'profile.myprofile.h2': '당신의 경험에 대해 조금 더 알려주세요',
      'profile.myprofile.p': '스크리닝 결과와 실제 경험을 함께 살펴보면 더 완전한 그림을 얻을 수 있습니다.',
      'profile.situations.h3': '어떤 상황이 특히 어려운가요?',
      'profile.helps.h3': '무엇이 가장 도움이 되나요?',
      'profile.access.kicker': '나의 접근성 프로필',
      'profile.cta.hear': 'Live Hear 사용해보기 →',
      'profile.cta.retake': '스크리닝 다시 하기',
      'metric.detectionLeft': '소리 감지 — 왼쪽',
      'metric.detectionRight': '소리 감지 — 오른쪽',
      'metric.localization': '소리의 위치 파악',
      'metric.speechQuiet': '음성 — 조용한 환경',
      'metric.speechNoise': '음성 — 배경 소음',
      'metric.tonesSub': '5개 중 {n}개의 소리를 감지했습니다.',
      'metric.localizationSub': '소리가 어느 방향에서 들려오는지 판단한 정확도입니다.',
      'metric.speechQuietSub': '단어를 정확하게 인식한 비율입니다.',
      'metric.speechNoiseSub': '배경 소음이 있는 환경에서 단어를 정확하게 인식한 비율입니다.',
      'score.detectionLeft': '왼쪽에서 들려오는 소리를 감지하는 것',
      'score.detectionRight': '오른쪽에서 들려오는 소리를 감지하는 것',
      'score.localization': '소리가 어느 방향에서 들려오는지 파악하는 것',
      'score.speechQuiet': '조용한 환경에서 음성을 인식하는 것',
      'score.speechNoise': '배경 소음이 있는 환경에서 음성을 인식하는 것',
      'profile.strongestText': '{list} 항목에서 상대적으로 좋은 결과를 보였습니다.',
      'profile.challengeText': '{list} 항목에서는 상대적으로 어려움을 보였습니다.',
      'rec.speechNoise.title': '배경 소음 줄이기',
      'rec.speechNoise.body': '가능하다면 더 조용한 공간으로 이동하거나 주변의 불필요한 소음을 줄여보세요.',
      'rec.detection.title': '위치를 전략적으로 선택하기',
      'rec.detection.body': '그룹 상황에서는 더 잘 들리는 쪽이 화자를 향하도록 자리를 잡아보세요.',
      'rec.localization.title': '화자를 마주보기',
      'rec.localization.body': '입 모양, 몸짓, 표정 같은 시각 정보는 소리 위치를 파악하기 어려울 때 소통에 도움이 됩니다.',
      'rec.speechQuiet.title': '자막 사용하기',
      'rec.speechQuiet.body': '중요한 대화나 안내를 들을 때 실시간 자막을 함께 사용하면 내용을 더 명확하게 이해하는 데 도움이 될 수 있습니다.',
      'rec.default.title': 'HEAR의 Live Hear 사용하기',
      'rec.default.body': '중요한 대화나 안내가 필요할 때 HEAR의 Live Hear 자막 도구를 사용해보세요.',
      'situation.classroom': '교실', 'situation.restaurant': '식당',
      'situation.group': '그룹 대화', 'situation.calls': '전화 통화',
      'situation.transit': '대중교통', 'situation.meetings': '회의',
      'situation.outdoor': '야외 환경',
      'helps.captions': '자막', 'helps.facing': '화자를 마주보기',
      'helps.quiet': '조용한 환경', 'helps.written': '서면 지시',
      'helps.repetition': '반복 설명', 'helps.seating': '좌석 위치',
      'profile.accessSummary.empty': '위에서 해당하는 상황을 선택하면 나에게 맞는 요약을 확인할 수 있습니다.',
      'profile.accessSummary.text': '응답을 보면 {list}{verb} 가장 큰 소통 어려움 중 하나로 보입니다.',
      'profile.accessSummary.are': '이', 'profile.accessSummary.is': '이', 'profile.accessSummary.and': '와/과',

      'screening.title': '듣기 경험 확인 — HEAR',
      'screen.stage.gettingReady': '준비 중',
      'screen.stage.detection': '소리 감지',
      'screen.stage.localization': '소리 위치 파악',
      'screen.stage.speechQuiet': '음성 — 조용한 환경',
      'screen.stage.speechNoise': '음성 — 배경 소음',
      'screen.stage.complete': '완료',
      'screen.intro.label': '시작하기 전에',
      'screen.intro.h2': '소리를 어떻게 듣고 계신가요?',
      'screen.intro.p': '일상에서 다양한 소리를 어떻게 듣고 경험하는지 알아보는 짧은 인터랙티브 스크리닝입니다. 약 4~5분 정도 소요됩니다.',
      'screen.intro.notice': '이 스크리닝은 의학적인 청력 검사나 진단을 위한 것이 아닙니다. 결과는 사용하는 기기와 주변 환경에 따라 달라질 수 있습니다. 청력에 대해 걱정되는 점이 있다면 전문 청각 전문가와 상담해 주세요.',
      'screen.intro.li1': '헤드폰이나 이어폰을 사용하세요',
      'screen.intro.li2': '조용한 환경을 찾으세요',
      'screen.intro.li3': '기기 볼륨을 편안한 수준으로 맞추세요',
      'screen.intro.li4': '이 테스트로 의학적 결정을 내리지 마세요',
      'screen.intro.begin': '스크리닝 시작하기',
      'screen.detection.label': '소리 감지 — {side} 채널',
      'screen.detection.left': '왼쪽', 'screen.detection.right': '오른쪽',
      'screen.detection.h2': '소리가 들렸나요?',
      'screen.detection.p': '재생 버튼을 누른 뒤, 음이 들렸는지 알려주세요.',
      'screen.trial': '{total}회 중 {n}회',
      'screen.yes': '예', 'screen.no': '아니오',
      'screen.local.label': '소리 위치 파악',
      'screen.local.h2': '소리가 어디서 들렸나요?',
      'screen.local.p': '재생 버튼을 누른 뒤, 소리가 온 방향을 선택하세요.',
      'screen.local.left': '왼쪽', 'screen.local.center': '가운데', 'screen.local.right': '오른쪽',
      'screen.speech.labelQuiet': '음성 — 조용한 환경',
      'screen.speech.labelNoise': '음성 — 배경 소음',
      'screen.speech.h2': '들린 문장을 입력하세요.',
      'screen.speech.p': '재생 버튼을 누르고 잘 들어보세요{noiseNote}. 그런 다음 들린 대로 최대한 정확히 입력하세요.',
      'screen.speech.noiseNote': ' — 배경 소음이 함께 재생됩니다',
      'screen.speech.placeholder': '들린 내용을 입력하세요...',
      'screen.speech.submit': '제출',
      'screen.sentence': '{total}개 중 {n}번째 문장',
      'screen.quiet.0': '회의는 3시에 시작합니다.',
      'screen.quiet.1': '나가실 때 문을 닫아 주세요.',
      'screen.noise.0': '다음 신호등에서 좌회전하세요.',
      'screen.noise.1': '택배가 오늘 아침에 도착했습니다.',
      'screen.done.label': '스크리닝 완료',
      'screen.done.h2': '스크리닝을 완료했습니다.',
      'screen.done.p': '참여해주셔서 감사합니다. 지금 여러분의 응답을 바탕으로 듣기 프로필을 준비하고 있습니다.',
      'screen.done.cta': '내 듣기 프로필 보기 →',

      'sign.title': '수어 → 텍스트 — HEAR',
      'sign.kicker': '실험적 기능 · V2',
      'sign.h1': '수어 → 텍스트',
      'sign.sub': '수어, 말, 또는 두 가지를 함께 사용해 소통해보세요. 이 실험적인 도구는 카메라를 통해 양손의 움직임을 추적하고, 정지된 손 모양뿐 아니라 수어의 움직임까지 인식합니다. 현재는 커뮤니티가 함께 만들어가는 수어 어휘를 바탕으로 계속 확장되고 있습니다.',
      'sign.notice': '프로토타입 안내: 이 도구는 아래에 표시된 수어만 인식할 수 있습니다. 모델은 같은 브라우저에서 직접 녹화한 영상 시퀀스를 바탕으로 학습됩니다. 전문 수어 통역을 대신할 수 없으며, 인식 정확도는 각 수어에 충분한 학습 데이터가 있는지에 따라 달라질 수 있습니다.',
      'sign.selectLang.h2': '사용할 수어를 선택하세요',
      'sign.vocabCount': '\u2713 {name} 수어 {n}개 사용 가능',
      'sign.addSignCta': '원하는 수어가 없나요? + 새 수어 추가',
      'sign.perm.label': '카메라 접근 필요',
      'sign.perm.h2': '카메라 접근을 허용하세요',
      'sign.perm.p': 'HEAR는 브라우저에서 손의 움직임을 분석하기 위해 카메라를 사용합니다. 카메라 영상은 업로드되지 않습니다.',
      'sign.perm.btn': '🎥 카메라 허용',
      'sign.leftHand': '왼손', 'sign.rightHand': '오른손',
      'sign.diag.h3': '좌우 손 인식 테스트',
      'sign.diag.p': '수어 인식을 시작하기 전에, 카메라가 왼손과 오른손을 올바르게 구분하는지 확인해보세요.',
      'sign.diag.run': '손 인식 테스트 실행',
      'sign.diag.promptLeft': '왼손을 들어주세요.',
      'sign.diag.promptRight': '오른손을 들어주세요.',
      'sign.diag.done': '✓ 테스트 완료 — 좌우 인식이 정확한 것으로 보입니다.',
      'sign.diag.retry': '다시 실행',
      'sign.detectedLabel': '인식된 수어',
      'sign.confidenceDefault': '카메라에 수어를 보여주고 잠시 동작을 유지하세요',
      'sign.addBtn': '추가', 'sign.clearBtn': '지우기',
      'sign.recognized.h3': '인식된 수어',
      'sign.recognized.empty': '인식된 수어가 여기에 표시됩니다.',
      'sign.undo': '← 되돌리기', 'sign.clearSentence': '문장 지우기', 'sign.speak': '🔊 읽어주기',
      'sign.suggestedLabel': '추천 문구 (단어 대 단어 — 검증된 번역이 아님)',
      'sign.footerNote': '인식 정확도를 높이거나 새로운 수어를 직접 추가하고 싶다면 {collectLink}에서 학습용 영상을 녹화할 수 있습니다. {accuracyLink}',
      'sign.collectLinkText': '데이터 수집 도구',
      'sign.accuracyLinkText': '현재 모델 정확도 확인하기',
      'sign.noHand': '손이 감지되지 않음',
      'sign.keepSigning': '계속 수어를 해주세요…',
      'sign.noTraining': '아직 학습 데이터가 없습니다',
      'sign.holdSteady': '동작을 유지해주세요',
      'sign.cameraUnavailable': '카메라를 사용할 수 없습니다',
      'sign.confidenceLabel': '모델 신뢰도',
      'sign.stabilityLabel': '안정도',
      'sign.datasetNotice': '현재 학습 데이터가 충분하지 않습니다. HEAR의 수어 인식 모델은 직접 녹화한 영상 시퀀스를 바탕으로 학습됩니다. 실시간 인식을 사용하기 전에 {link}에서 몇 가지 수어를 직접 추가해 주세요.',

      'collect.title': '수어 데이터 수집 — HEAR',
      'collect.back': '← 수어 → 텍스트로 돌아가기',
      'collect.kicker': '개발자 도구 · V2',
      'collect.h1': '수어 데이터 수집',
      'collect.p': 'HEAR의 온디바이스 수어 인식 모델을 학습시키기 위해 각 수어의 짧은 영상 시퀀스를 녹화해 주세요. 각 녹화에서는 양손의 움직임을 프레임 단위로 기록합니다. 이를 통해 모델이 정지된 손 모양뿐 아니라 수어의 움직임까지 학습할 수 있습니다. 녹화된 영상은 업로드되지 않습니다. 모든 시퀀스는 현재 사용 중인 브라우저의 로컬 저장소에 저장됩니다.',
      'collect.langSection.h2': '언어 / 데이터셋',
      'collect.langSection.p': 'ASL과 KSL은 서로 다른 어휘와 데이터셋, 모델을 사용합니다. 여기에서 녹화한 데이터는 선택한 언어의 모델을 학습하는 데만 사용됩니다.',
      'collect.addSign.h3': '새 수어 추가',
      'collect.addSign.p': '수어를 추가하면 해당 수어의 이름표(라벨)만 만들어집니다. 실제로 모델이 수어를 인식하려면 본인이나 다른 사람이 해당 수어의 영상 시퀀스를 직접 녹화해야 합니다. 단어를 추가한다고 해서 수어가 자동으로 인식되는 것은 아닙니다.',
      'collect.addSign.placeholder': '예: GOODBYE 또는 안녕히 가세요',
      'collect.addSign.btn': '수어 추가',
      'collect.perm.label': '카메라 접근 필요',
      'collect.perm.h2': '카메라 접근을 허용하세요',
      'collect.perm.p': '카메라 영상은 브라우저에서 로컬로 처리되며 HEAR로 업로드되지 않습니다.',
      'collect.perm.btn': '🎥 카메라 허용',
      'collect.leftHand': '왼손', 'collect.rightHand': '오른손',
      'collect.startRecord': '🎥 녹화 시작',
      'collect.recordHint': '최대 10초까지 녹화됩니다 — 단어를 한 번 수어로 표현한 뒤 정지 버튼을 누르세요(또는 자동으로 멈추도록 두세요).',
      'collect.recording': '녹화 중',
      'collect.stop': '⏹ 녹화 정지',
      'collect.save': '시퀀스 저장',
      'collect.retry': '다시 녹화',
      'collect.tooShort': '녹화가 너무 짧습니다 — 최소 1~2초 동안 동작을 유지한 뒤 다시 시도하세요.',
      'collect.collectorLabel': '수집자 이름',
      'collect.collectorPlaceholder': '예: 이름 또는 이니셜',
      'collect.collectorHint': '두 명 이상이 시퀀스를 녹화하면, 모델이 한 번도 본 적 없는 사람의 수어를 얼마나 잘 인식하는지 측정할 수 있습니다 — 아래 "미확인 사용자 정확도"를 참고하세요.',
      'collect.selectSign': '수어 선택',
      'collect.sampleCountText': '이 수어에 대해 수집된 시퀀스:',
      'collect.dataset.h2': '데이터셋',
      'collect.perSign.h3': '수어별 시퀀스 수',
      'collect.perSign.hint': '수어를 선택하면 해당 수어의 개별 녹화 목록을 확인할 수 있습니다. 필요한 경우 특정 녹화만 삭제할 수도 있습니다.',
      'collect.manage.h3': '데이터셋 관리',
      'collect.manage.p': '녹화한 데이터를 백업하거나 다른 사람과 공유하려면 데이터셋을 내보낼 수 있습니다. 다른 사람이 녹화한 데이터셋을 가져올 수도 있습니다.',
      'collect.export': '내 데이터셋 내보내기 (.json)',
      'collect.import': '데이터셋 가져오기 (병합)',
      'collect.clearAll': '모든 시퀀스 삭제',

      // ---- shared model consent ----
      'collect.consent.h3': '이 시퀀스를 저장하기 전에',
      'collect.consent.personal': '내 개인 모델에만 추가',
      'collect.consent.personal.sub': '이 브라우저에만 남습니다. 본인의 정확도 테스트에만 사용되며, 공유용 내보내기에는 포함되지 않습니다.',
      'collect.consent.shared': "HEAR의 공유 모델에 기여",
      'collect.consent.shared.sub': '저장하는 즉시 게시됩니다 — 내보내기나 검토 절차 없이, 모든 방문자의 브라우저가 바로 이 수어를 인식할 수 있게 됩니다.',
      'collect.liveStatus.on': '✓ 실시간 공유가 켜져 있습니다 — 이 옵션으로 저장한 내용은 즉시 모든 방문자가 사용할 수 있습니다.',
      'collect.liveStatus.off': '이 배포본에는 아직 실시간 공유가 설정되어 있지 않아서, 내보내기 후 수동으로 병합되기 전까지는 이 기기에만 저장됩니다 (아래 "공유 모델 기여" 참고).',
      'collect.sharedPanel.h3': '공유 모델에 기여하기',
      'collect.sharedPanel.p': '"HEAR 공유 모델에 기여"를 선택하고 저장한 시퀀스는 저장하는 즉시 공유 모델에 게시됩니다. 저장하기 전에 버튼 위의 안내를 꼭 확인해 주세요. 이 섹션은 별도의 백업 및 공유 방법입니다 — 공유한 데이터를 파일로 내보내 관리자에게 전달할 수도 있습니다.',
      'collect.sharedPanel.gate': '하나의 수어는 서로 다른 수집자 {people}명 이상이 녹화한 공유 시퀀스가 최소 {min}개 모이면 기여 가능 상태가 됩니다.',
      'collect.exportShared': '공유 데이터 내보내기 (.json)',
      'collect.exportShared.none': '아직 기여 기준을 충족한 수어가 없습니다 — "HEAR의 공유 모델에 기여"를 선택한 채로 계속 녹화해 주세요.',
      'collect.sharedReady.h3': '기여 가능한 수어',
      'collect.sharedReady.none': '아직 없습니다.',
      'collect.importMerge.notice': '가져온 데이터는 현재 데이터셋에 추가됩니다. 기존에 녹화한 데이터는 삭제되거나 덮어쓰이지 않습니다.',
      'collect.status.core': '기본',
      'collect.status.pending': '검증 대기',
      'collect.status.validated': '검증됨',
      'collect.perCollector.h3': '수집자별 시퀀스 수',
      'collect.perCollector.p': '실제로 수어 시퀀스를 녹화한 사람만 표시됩니다.',
      'collect.accuracy.h2': '모델 정확도',
      'collect.accuracy.p': '녹화된 시퀀스를 대상으로 leave-one-out 교차검증을 사용해 모델의 정확도를 추정합니다. 각 시퀀스를 나머지 데이터와 비교하여 평가하기 때문에, 단순히 임의의 숫자를 표시하는 것이 아니라 현재 데이터셋에서의 모델 성능을 보여줍니다.',
      'collect.evalBtn': '정확도 평가',
      'collect.generalization.h2': '새로운 사용자에 대한 정확도',
      'collect.generalization.p': '한 번에 한 명의 수집자가 녹화한 시퀀스를 제외하고, 나머지 데이터만 사용해 모델을 학습한 뒤 제외된 사람의 수어를 테스트합니다. 이를 통해 "모델이 이미 본 데이터를 기억하고 있는가?"가 아니라 "처음 보는 사람의 수어에도 잘 대응할 수 있는가?"를 확인할 수 있습니다. 이 평가에는 최소 두 명 이상의 수집자가 필요합니다.',
      'collect.noSequences': '아직 녹화된 시퀀스가 없습니다.',
      'collect.sequencesUnit': '개 시퀀스',
      'collect.noSequencesYet': '아직 시퀀스가 없습니다 — 먼저 수어를 녹화해보세요.',
      'collect.needTwoCollectors': '이 결과를 보려면 최소 두 명의 서로 다른 수집자로부터 시퀀스를 녹화하세요.',
      'collect.noEntries': '아직 이 수어로 녹화된 시퀀스가 없습니다.',
      'collect.deleteSequence': '이 시퀀스 삭제',
      'collect.deleteConfirm': '이 녹화본을 삭제할까요? 되돌릴 수 없습니다 — 언제든 다시 녹화할 수 있습니다.',
      'collect.badge.shared': '공유됨',
      'collect.confusion.h3': '혼동 행렬',
      'collect.confusion.p': '행은 실제로 보여준 수어이고, 열은 모델이 예측한 수어입니다. 대각선이 아닌(빨간색) 숫자는 어떤 수어끼리 혼동되는지를 보여줍니다.',
      'collect.importFail': '해당 파일을 HEAR 데이터셋으로 읽을 수 없습니다.',
      'collect.summary.language': '언어',
      'collect.summary.sign': '수어',
      'collect.summary.duration': '길이',
      'collect.summary.frames': '캡처된 프레임',
      'collect.summary.hands': '감지된 손',
      'collect.summary.bothHands': '양손',
      'collect.summary.oneHand': '한 손',
      'collect.summary.noHands': '없음',
      'collect.summary.sec': '초',
      'collect.table.collector': '수집자',
      'collect.table.total': '합계',
      'collect.confusion.actualPredicted': '실제 \\ 예측',
      'collect.overallAccuracy': '전체 정확도(leave-one-out, {n}개 시퀀스)',
      'collect.overallAccuracy.sub': '녹화된 시퀀스로부터 실시간으로 계산됩니다 — 고정된 수치가 아닙니다.',
      'collect.unseenAccuracy': '새로운 사용자 정확도 (수집자 {people}명, 제외된 시퀀스 {n}개)',
      'collect.unseenAccuracy.sub': '각 수집자의 시퀀스를 제외하고, 나머지 사람들의 데이터로만 학습한 모델로 테스트했습니다.',
      'collect.startingCamera': '카메라 시작 중…',
      'collect.clearConfirm': '녹화된 {lang} 학습 시퀀스를 모두 지울까요? 이 작업은 되돌릴 수 없습니다.'
    }
  };

  function getLang() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved === 'ko' ? 'ko' : (saved === 'en' ? 'en' : DEFAULT_LANG);
    } catch (e) {
      return DEFAULT_LANG;
    }
  }

  function setLang(lang) {
    const l = lang === 'ko' ? 'ko' : 'en';
    try { localStorage.setItem(STORAGE_KEY, l); } catch (e) {}
    return l;
  }

  // ---- speech language (Live Hear) ----
  // Defaults to match the UI language until the person explicitly
  // picks a speech language, at which point that choice sticks.
  function speechLangForUi(uiLang) { return uiLang === 'ko' ? 'ko-KR' : 'en-US'; }

  function getSpeechLang() {
    try {
      if (localStorage.getItem(SPEECH_OVERRIDE_KEY) === '1') {
        const saved = localStorage.getItem(SPEECH_STORAGE_KEY);
        if (saved) return saved;
      }
    } catch (e) {}
    return speechLangForUi(getLang());
  }

  function isSpeechLangOverridden() {
    try { return localStorage.getItem(SPEECH_OVERRIDE_KEY) === '1'; } catch (e) { return false; }
  }

  // manual=true (the default) marks this as an explicit choice that
  // should stop tracking the UI language going forward.
  function setSpeechLang(code, manual) {
    try {
      localStorage.setItem(SPEECH_STORAGE_KEY, code);
      if (manual !== false) localStorage.setItem(SPEECH_OVERRIDE_KEY, '1');
    } catch (e) {}
    return code;
  }

  // ---- sign language (Sign to Text) default ----
  // Only a *default* — the actual current value and its own override
  // tracking live in sign-classifier.js (hear_sign_language). This
  // just tells that module what to fall back to when nothing has
  // been explicitly chosen yet.
  function signLangForUi(uiLang) { return uiLang === 'ko' ? 'KSL' : 'ASL'; }
  function getSignLangDefault() { return signLangForUi(getLang()); }

  // Simple {placeholder} interpolation for strings that need one, e.g.
  // t('screen.trial', { n: 2, total: 5 }).
  function t(key, vars) {
    const lang = getLang();
    let str = (dict[lang] && dict[lang][key] !== undefined) ? dict[lang][key]
      : (dict.en[key] !== undefined ? dict.en[key] : key);
    if (vars) {
      Object.keys(vars).forEach((k) => {
        str = str.replace(new RegExp('\\{' + k + '\\}', 'g'), vars[k]);
      });
    }
    return str;
  }

  function apply(root) {
    const scope = root || document;
    scope.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      const val = t(key);
      const attr = el.getAttribute('data-i18n-attr');
      if (attr) el.setAttribute(attr, val);
      else el.textContent = val;
    });
    document.documentElement.lang = getLang();
  }

  function refreshToggle(container) {
    const el = container || document.getElementById('uiLangToggle');
    if (!el) return;
    const lang = getLang();
    el.querySelectorAll('button[data-ui-lang]').forEach((b) => {
      b.classList.toggle('active', b.dataset.uiLang === lang);
    });
  }

  function initToggle(id) {
    const el = document.getElementById(id || 'uiLangToggle');
    if (!el) return;
    el.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-ui-lang]');
      if (!btn) return;
      setLang(btn.dataset.uiLang);
      apply();
      refreshToggle(el);
      document.dispatchEvent(new CustomEvent('hear:langchange', { detail: { lang: getLang() } }));
    });
    refreshToggle(el);
  }

  document.addEventListener('DOMContentLoaded', function () {
    apply();
    document.querySelectorAll('.lang-toggle').forEach((el) => initToggle(el.id));
  });

  return {
    t, getLang, setLang, apply, refreshToggle,
    getSpeechLang, setSpeechLang, isSpeechLangOverridden, speechLangForUi,
    getSignLangDefault, signLangForUi
  };
})();
