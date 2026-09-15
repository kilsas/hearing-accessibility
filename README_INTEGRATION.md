# Changes needed in hear.html

Two small edits to the existing hear.html. Everything else stays the same.

## 1. Add the noise badge element

Find this line:

```html
<span class="status-dot" id="statusDot"><span class="dot"></span> <span id="statusText" data-i18n="hear.statusOff">Not listening</span></span>
```

Add a noise badge right after it:

```html
<span class="status-dot" id="statusDot"><span class="dot"></span> <span id="statusText" data-i18n="hear.statusOff">Not listening</span></span>
<span class="noise-badge noise-clean" id="noiseBadge"></span>
```

## 2. Load noise-adaptive.js before hear.js

Find this line at the bottom of the file:

```html
<script src="js/hear.js"></script>
```

Change it to:

```html
<script src="js/noise-adaptive.js"></script>
<script src="js/hear.js"></script>
```

(Order matters: noise-adaptive.js must load first so `window.HearNoise` exists
when hear.js references it.)

## 3. Replace js/hear.js

Replace the entire contents of `js/hear.js` with `hear_app_additions/hear.js`
from this repo (it is the same file with the noise-adaptive integration added
— every original line of logic is unchanged, only additions were made,
marked with `// NEW` comments).

## 4. Add js/noise-adaptive.js

Copy `hear_app_additions/noise-adaptive.js` into your `js/` folder as
`js/noise-adaptive.js`.

## 5. (Optional but recommended) Add CSS for the badge

In `css/styles.css`, add something like:

```css
.noise-badge {
  margin-left: 10px;
  padding: 2px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
}
.noise-badge:empty { display: none; }
.noise-clean { background: #e6f4ea; color: #1e7e34; }
.noise-low { background: #fff8e1; color: #8a6d00; }
.noise-moderate { background: #fff0e0; color: #b35c00; }
.noise-high { background: #fdecea; color: #c0392b; }
```

## Why this is safe to add

- If `getUserMedia` for noise monitoring fails or is denied, captions
  still work exactly as before (see the `try/catch` and `console.warn`
  in `noise-adaptive.js`) — the noise indicator is a pure enhancement,
  never a dependency.
- Under Clean/Low noise, caption text is rendered identically to the
  original code — the cleanup pass only runs when noise is Moderate or
  High, so there is no behavior change for the common case.
- The cleanup rule (collapsing immediate duplicate words) makes no
  assumption about sentence content, so — unlike the paper's Appendix A
  filter — it is safe to run on arbitrary open-vocabulary speech.
