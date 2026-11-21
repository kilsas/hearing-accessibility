# HEAR question-mark rules now in use

All rules live in `js/hear-question-mark.js`. They apply to Korean captions only.

| Rule | What it does | Status | Switch off for one tab |
| --- | --- | --- | --- |
| Endings | A full "?" after question endings (-니, -냐, -나요, -까요, -ㅂ니까, -는가 ...); no mark after statement endings (-ㅂ니다, -구나, -ㄹ게요, -다 ...) | On | — |
| End rise | A full "?" when the pitch rises 4 semitones or more at the end | On | — |
| Grey "?" | A light grey "?" when a sentence starts with a wh-word and the end rises 2–4 semitones | On | — |
| End-fall | When a full "?" would be shown but the voice peaks and then falls 4.5 semitones or more in the last 0.25 s, the "?" becomes grey | On (`fallRuleOn: true`) | add `?fall=0` to the address |
| Choice questions | Sentences ending in `A 안 A` (했어 안 했어), `~거야 말 거야` or `~래 말래` always get a full "?" | On (`choiceRuleOn: true`) | add `?choice=0` to the address |

Rules that failed testing are still in the code but off by default: the probability rule (`probRuleOn`, test with `?prob=1`), v3 (`v3RuleOn`, test with `?v3=1`), and the final-height rule (`finalRuleOn`). Why each was kept off is in `rule_log.md`.

Users can also tap any caption sentence to switch "?" and ".".
