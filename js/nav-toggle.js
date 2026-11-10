/* HEAR — mobile nav sidebar.
   Included on every page. Handles both: (1) the hamburger button that
   slides the sidebar in/out, and (2) creating the dimmed backdrop
   behind it (there's no backdrop element in the HTML — this injects
   one so every page doesn't need its own copy).
   Defensive about timing: runs immediately if the DOM is already
   parsed by the time this executes, otherwise waits for
   DOMContentLoaded — same pattern as capacitor-bridge.js and
   sign-classifier.js, so this never silently no-ops just because of
   script-load ordering in a given environment (web vs. the Capacitor
   app's WKWebView). */
(function () {
  function init() {
    const toggle = document.getElementById('navToggle');
    const nav = document.getElementById('siteNav');
    if (!toggle || !nav) return;

    // The backdrop only matters on narrow/mobile widths where .nav
    // becomes a fixed sidebar (see styles.css) — but it's harmless to
    // have on desktop too, since it's only ever shown while .open.
    let backdrop = document.getElementById('navBackdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.className = 'nav-backdrop';
      backdrop.id = 'navBackdrop';
      document.body.appendChild(backdrop);
    }

    function closeNav() {
      nav.classList.remove('open');
      backdrop.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    }
    function openNav() {
      nav.classList.add('open');
      backdrop.classList.add('open');
      toggle.setAttribute('aria-expanded', 'true');
    }

    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      if (nav.classList.contains('open')) closeNav(); else openNav();
    });

    backdrop.addEventListener('click', closeNav);

    // Tapping a link closes the sidebar (the page navigation itself
    // handles moving to the new page).
    nav.querySelectorAll('a').forEach((a) => {
      a.addEventListener('click', closeNav);
    });

    // If the window is resized/rotated back above the mobile
    // breakpoint, make sure the sidebar isn't left stuck open.
    window.addEventListener('resize', () => {
      if (window.innerWidth > 860) closeNav();
    });

    // Escape key closes it too, for anyone using a hardware keyboard.
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeNav();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
