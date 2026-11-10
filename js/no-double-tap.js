// Stops the iOS "double-tap to zoom" gesture inside the app.
// Two-finger pinch zoom is unaffected (it uses multi-touch, not taps),
// and normal scrolling and single taps keep working.
(function () {
  var lastTouchEnd = 0;
  document.addEventListener('touchend', function (e) {
    var now = Date.now();
    if (now - lastTouchEnd <= 300 && e.touches.length === 0 && e.changedTouches.length === 1) {
      var t = e.target;
      var tag = t && t.tagName ? t.tagName.toLowerCase() : '';
      // Leave text fields alone so the caret and selection still work.
      if (tag !== 'input' && tag !== 'textarea' && tag !== 'select') e.preventDefault();
    }
    lastTouchEnd = now;
  }, { passive: false });
})();
