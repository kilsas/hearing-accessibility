/*
 * noise-adaptive.js
 *
 * Real-time ambient noise level estimation, built directly on the findings
 * of "Effects of Environmental Noise on Real-Time Speech-Captioning
 * Accuracy and Latency" (Kim, 2026): as background noise increases, caption
 * Word Error Rate and latency both increase, and simple post-processing
 * rules only meaningfully help under specific conditions.
 *
 * IMPORTANT HONESTY NOTE (see paper Appendix A.4):
 * The paper's cross-sentence-contamination filter only works because that
 * study used a small, closed set of seven known sentences per language. It
 * does NOT generalize to open-vocabulary, real-world speech, so it is not
 * used here. What *does* generalize from the research is (1) detecting
 * noise level in real time, (2) being transparent with the user about when
 * accuracy is likely degraded, and (3) applying only generic, sentence-
 * independent text cleanup under high noise. That is what this module does.
 *
 * This is a relative, uncalibrated noise proxy (browsers do not expose
 * calibrated dB SPL from getUserMedia) -- it is useful for tiering
 * "quieter vs. noisier right now," not for reproducing the study's lab
 * dB measurements.
 */

window.HearNoise = (function () {
  const TIERS = ['clean', 'low', 'moderate', 'high'];

  // Relative RMS amplitude thresholds (0-1 scale from Web Audio time-domain
  // data). Tuned empirically; adjust if false-positive "high" readings are
  // common on a given device/mic.
  const THRESHOLDS = { low: 0.02, moderate: 0.06, high: 0.12 };

  let audioCtx = null;
  let analyser = null;
  let dataArray = null;
  let rafId = null;
  let currentTier = 'clean';
  let smoothedRms = 0;
  const SMOOTHING = 0.85; // exponential moving average factor

  function classify(rms) {
    if (rms >= THRESHOLDS.high) return 'high';
    if (rms >= THRESHOLDS.moderate) return 'moderate';
    if (rms >= THRESHOLDS.low) return 'low';
    return 'clean';
  }

  function computeRms(buf) {
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = (buf[i] - 128) / 128; // center around 0
      sum += v * v;
    }
    return Math.sqrt(sum / buf.length);
  }

  function tick() {
    analyser.getByteTimeDomainData(dataArray);
    const rms = computeRms(dataArray);
    smoothedRms = SMOOTHING * smoothedRms + (1 - SMOOTHING) * rms;
    const tier = classify(smoothedRms);
    if (tier !== currentTier) {
      currentTier = tier;
      document.dispatchEvent(new CustomEvent('hear:noiselevel', { detail: { tier, rms: smoothedRms } }));
    }
    rafId = requestAnimationFrame(tick);
  }

  async function start() {
    if (audioCtx) return; // already running
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioCtx.createMediaStreamSource(stream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      dataArray = new Uint8Array(analyser.frequencyBinCount);
      source.connect(analyser);
      tick();
    } catch (e) {
      // Mic access may already be in use by SpeechRecognition on some
      // browsers, or may be denied. Fail silently -- noise tiering is an
      // enhancement, not a requirement for captions to work.
      console.warn('HearNoise: could not start noise monitoring', e);
    }
  }

  function stop() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    if (audioCtx) {
      audioCtx.close();
      audioCtx = null;
    }
    currentTier = 'clean';
    smoothedRms = 0;
  }

  function getTier() {
    return currentTier;
  }

  return { start, stop, getTier, TIERS };
})();
