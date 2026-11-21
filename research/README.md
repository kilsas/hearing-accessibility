# Where Korean questions live in the voice

Data and code behind HEAR's question-mark rule.

In Korean, 밥 먹었어요 is "I ate" or "Did you eat?" only by pitch, and 누가 왔어요 can mean "Who came?", "Did someone come?" or "Someone came." Live captions often leave the question mark off, and readers believe whatever mark they see. This folder holds the sentence cards, test results and scripts I used to find where the question is in the voice and to test changes to HEAR's punctuation rule.

## What is here

| Path | What it is |
| --- | --- |
| `data/sentences.csv` | Every sentence card: the situation, the sentence, a sample answer and the intended meaning (wh-question, yes/no question, statement). Sets W and P are the main experiment, A and B are new-sentence sets, C tests endings and choice questions. |
| `data/site_marks_test_sets_B_C.csv` | The two test sets that the adopted rules had never seen, with HEAR's mark before and after the new rules. |
| `RULES.md` | The rules HEAR uses now and how to switch each one off. |
| `rule_log.md` | Every rule I tried, in order, with the pass conditions I wrote down before each test and the result. |
| `code/` | `export_pitch.praat` (pitch and intensity export), `praat_main.py` (measurement), the rule-building scripts, and `run_site_rule.js`, which runs HEAR's live JavaScript file on the recordings at 16 kHz. |

Speakers are listed only by code (S01, S02, ...). The audio recordings and the per-sentence pitch measurements taken from them are not shared, because they come from people's voices and the consent covered research use, not publication. They may be added later if participants agree.

## How a rule change was tested

1. Write the rule and its numbers down before opening the test recordings.
2. Compare it with HEAR's live rule on speakers and sentences it was not built on.
3. Adopt it only if all three conditions hold: a lower error score at three weights for uncertain (grey) marks, no increase in statements given a full "?" or questions left unmarked, and grey marks at 30% or less.

Ten changes were tried. Eight failed and stayed off. Two passed and are live:

| Rule | Test set | Result |
| --- | --- | --- |
| End-fall: if the voice peaks and falls 4.5+ semitones in the last 0.25 s, a full "?" becomes grey | B: 6 new speakers, 40 new sentences | Statements with a full "?": 23 → 18 of 84. Questions left unmarked: 0 → 0. |
| Choice questions (`A 안 A`, `~거야 말 거야`, `~래 말래`) always get "?" | C: 5 new speakers, 24 new sentences | Questions left unmarked: 10 → 0 of 20. No statement changed. |

The scripts show exactly how each number was computed, but they need the recordings, so the results cannot be reproduced from this folder alone. The test-set marks in `data/site_marks_test_sets_B_C.csv` can be recounted directly. The rules currently on in HEAR, and how to switch them off, are in `RULES.md`.

## Limits

These are read sentences, not conversation. The rule tests used five or six speakers each, so the gains are small and may not hold for every speaker. Sets A, B and C were recorded on iPads, earlier sets on iPhones. Only one of the twelve caption readers reported hearing loss, so the effect on deaf and hard-of-hearing readers is still untested.
