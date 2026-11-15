/*
 * HEAR 물음표 모듈 (hear-question-mark.js)
 * 마이크 소리를 계속 듣고 있다가, 음성인식이 문장 하나를 끝낼 때마다
 * 그 문장의 말끝 음높이가 올라갔는지 재서 "?"를 붙일지 정해요.
 * 방법은 HEAR 억양 검사기(11월 15일 버전)와 똑같아요.
 * 개발 중인 기능이에요: 기준값 4반음은 화자 한 명의 녹음으로 정한 임시값이고, 한국어 예/아니오 질문에만 맞춰져 있어요.
 * 음높이 분석은 브라우저 안에서 하지만, 함께 쓰는 크롬 음성 인식은 소리를 구글 서버로 보내 처리해요.
 *
 * 쓰는 법:
 *   await HEARQ.start();                 // 마이크 켜기 (버튼 클릭 안에서 부르기)
 *   var r = HEARQ.judge();               // 음성인식 최종 결과가 나올 때 부르기
 *   caption = HEARQ.punctuate(text, r);  // "밥 먹었어요" -> "밥 먹었어요?"
 *   HEARQ.threshold = 4;                 // 기준값(반음). A~C 화자로 정한 값을 넣기
 */
(function (global) {
  "use strict";
  function median(a) { if (!a.length) return null; var s = a.slice().sort(function (p, q) { return p - q; }); var m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
  function pct(a, p) { if (!a.length) return null; var s = a.slice().sort(function (u, v) { return u - v; }); var i = Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1)))); return s[i]; }

  // 음높이: 짧은 구간마다 주파수 스펙트럼을 보고, 배음(기본음의 2배, 3배, …)이 가장 잘 맞는 기본음을 찾아요.
  // 질문 끝처럼 음이 빠르게 올라가도 놓치지 않아요. 그다음 앞뒤가 자연스럽게 이어지는 길을 골라요(옥타브 튐 방지).
  var P = { win: 0.04, hop: 0.01, fmin: 60, fmax: 600, nh: 15, ppo: 48, nfft: 4096, hcut: 3000, decay: 0.84, alpha: 1.0,
            vthr: 1.5, egate: 0.05, lam: 0.12, free: 1.0, vuv: 0.5, K: 5, minRun: 5, runE: 0.25 };
  var FFT = null;
  function fftSetup(n) {
    var bits = Math.round(Math.log2(n)), rev = new Uint32Array(n), i;
    for (i = 0; i < n; i++) { var r = 0, v = i; for (var b = 0; b < bits; b++) { r = (r << 1) | (v & 1); v >>= 1; } rev[i] = r; }
    var c = new Float64Array(n / 2), sn = new Float64Array(n / 2);
    for (i = 0; i < n / 2; i++) { c[i] = Math.cos(2 * Math.PI * i / n); sn[i] = -Math.sin(2 * Math.PI * i / n); }
    return { n: n, rev: rev, c: c, s: sn, re: new Float64Array(n), im: new Float64Array(n) };
  }
  function fftMag(frame, out) {
    var F = FFT, n = F.n, re = F.re, im = F.im, i;
    for (i = 0; i < n; i++) { var j = F.rev[i]; re[i] = j < frame.length ? frame[j] : 0; im[i] = 0; }
    for (var size = 2; size <= n; size <<= 1) {
      var half = size >> 1, step = n / size;
      for (var st = 0; st < n; st += size) {
        for (var k = 0; k < half; k++) {
          var a = st + k, b2 = a + half, wr = F.c[k * step], wi = F.s[k * step];
          var tr = re[b2] * wr - im[b2] * wi, ti = re[b2] * wi + im[b2] * wr;
          re[b2] = re[a] - tr; im[b2] = im[a] - ti; re[a] += tr; im[a] += ti;
        }
      }
    }
    for (i = 0; i <= n / 2; i++) out[i] = Math.sqrt(re[i] * re[i] + im[i] * im[i]);
  }

  function pitchTrack(x, sr) {
    if (!FFT || FFT.n !== P.nfft) FFT = fftSetup(P.nfft);
    var N = Math.round(P.win * sr), H = Math.round(P.hop * sr), nb = P.nfft / 2 + 1, binHz = sr / P.nfft;
    var LO = Math.log2(P.fmin), GLO = LO - 1, ppo = P.ppo;
    var nGrid = Math.floor((Math.log2(P.hcut) + 0.01 - GLO) * ppo) + 1;
    var ncand = Math.floor((Math.log2(P.fmax) - LO) * ppo) + 1;
    var hoff = [], hoffh = [], wts = [], wsum = 0, h;
    for (h = 1; h <= P.nh; h++) { hoff.push(Math.round(Math.log2(h) * ppo) + ppo); hoffh.push(Math.round(Math.log2(h - 0.5) * ppo) + ppo); var w = Math.pow(P.decay, h - 1); wts.push(w); wsum += w; }
    var gridBin = new Float64Array(nGrid);
    for (var g = 0; g < nGrid; g++) gridBin[g] = Math.pow(2, GLO + g / ppo) / binHz;
    var Glen = nGrid + hoff[hoff.length - 1] + ncand + 2, G = new Float64Array(Glen);
    var win = new Float64Array(N); for (var i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1));
    var K = Math.floor(300 / binHz), kL = K >> 1, kR = K - 1 - kL;
    var hcutBin = P.hcut / binHz;
    var frame = new Float64Array(N), mag = new Float64Array(nb), L = new Float64Array(nb), cs = new Float64Array(nb + 1), R = new Float64Array(nb);
    var scores = [], en = [];
    for (var s0 = 0; s0 < x.length - N; s0 += H) {
      var e = 0;
      for (i = 0; i < N; i++) { var v = x[s0 + i] * win[i]; frame[i] = v; e += v * v; }
      en.push(Math.sqrt(e / N));
      fftMag(frame, mag);
      cs[0] = 0;
      for (i = 0; i < nb; i++) { L[i] = Math.log(mag[i] + 1e-9); cs[i + 1] = cs[i] + L[i]; }
      for (i = 0; i < nb; i++) {
        if (i > hcutBin) { R[i] = 0; continue; }
        var lo = Math.max(0, i - kL), hi = Math.min(nb - 1, i + kR);
        var env = (cs[hi + 1] - cs[lo]) / K;
        R[i] = Math.max(L[i] - env, 0);
      }
      var gm = 0;
      for (g = 0; g < nGrid; g++) {
        var pos = gridBin[g], i0 = Math.floor(pos), fr = pos - i0;
        var val = i0 + 1 < nb ? R[i0] * (1 - fr) + R[i0 + 1] * fr : 0;
        G[g] = val; gm += val;
      }
      for (g = nGrid; g < Glen; g++) G[g] = 0;
      gm = gm / nGrid + 1e-9;
      var sc = new Float64Array(ncand);
      for (var c = 0; c < ncand; c++) {
        var sp = 0, sm = 0;
        for (h = 0; h < wts.length; h++) { sp += wts[h] * G[c + hoff[h]]; sm += wts[h] * G[c + hoffh[h]]; }
        sc[c] = (sp - P.alpha * sm) / (wsum * gm);
      }
      scores.push(sc);
    }
    var T = scores.length;
    if (!T) return { st: [], hop: P.hop };
    var emax = 0; en.forEach(function (v) { if (v > emax) emax = v; });
    // 후보: 무성(null) + 점수 높은 봉우리 K개
    var cands = [];
    for (var t = 0; t < T; t++) {
      var row = [{ p: null, cost: -P.vthr }];
      if (en[t] >= P.egate * emax) {
        var s = scores[t], pk = [];
        for (i = 1; i < s.length - 1; i++) if (s[i] >= s[i - 1] && s[i] >= s[i + 1]) pk.push(i);
        pk.sort(function (p1, p2) { return s[p2] - s[p1]; });
        pk.slice(0, P.K).forEach(function (ix) { row.push({ p: 12 * (LO + ix / ppo), cost: -s[ix] }); });
      }
      cands.push(row);
    }
    // 앞뒤가 자연스럽게 이어지는 길 고르기
    var D = cands[0].map(function (c0) { return c0.cost; }), back = [];
    for (t = 1; t < T; t++) {
      var prev = cands[t - 1], cur = cands[t], d = new Array(cur.length), bk = new Array(cur.length);
      for (var j = 0; j < cur.length; j++) {
        var best = Infinity, bi = 0, pj = cur[j].p;
        for (var q = 0; q < prev.length; q++) {
          var pi = prev[q].p, tc;
          if (pi == null && pj == null) tc = 0;
          else if (pi == null || pj == null) tc = P.vuv;
          else tc = P.lam * Math.max(0, Math.abs(pj - pi) - P.free);
          var vv = D[q] + tc;
          if (vv < best) { best = vv; bi = q; }
        }
        d[j] = best + cur[j].cost; bk[j] = bi;
      }
      D = d; back.push(bk);
    }
    var jj = 0; for (j = 1; j < D.length; j++) if (D[j] < D[jj]) jj = j;
    var path = new Array(T);
    for (t = T - 1; t >= 0; t--) { path[t] = cands[t][jj].p; if (t > 0) jj = back[t - 1][jj]; }
    // 너무 짧거나(0.05초 미만) 너무 작은 소리 조각은 지우기 (숨소리, 잡음)
    t = 0;
    while (t < T) {
      if (path[t] == null) { t++; continue; }
      var u = t, mx = 0;
      while (u < T && path[u] != null) { if (en[u] > mx) mx = en[u]; u++; }
      if (u - t < P.minRun || mx < P.runE * emax) for (var z = t; z < u; z++) path[z] = null;
      t = u;
    }
    var vals = path.filter(function (vp) { return vp != null; });
    var med = median(vals);
    var stv = path.map(function (vp) { return vp == null ? null : vp - med; });
    return { st: stv, hop: P.hop };
  }

  // 말끝 상승: 마지막 100ms 안의 높은 쪽(90번째 백분위) - 그 앞 100~500ms 구간의 낮은 쪽(10번째 백분위)
  // (11월 15일: 150ms → 100ms. 평서문 끝에서 음이 떨어지기 직전 값을 잡던 문제를 고침)
  function finalRise(st, hop) {
    var last = -1, i;
    for (i = st.length - 1; i >= 0; i--) if (st[i] != null) { last = i; break; }
    if (last < 0) return null;
    var endFrames = Math.round(0.10 / hop), endVals = [];
    for (i = last; i > last - endFrames && i >= 0; i--) if (st[i] != null) endVals.push(st[i]);
    if (endVals.length < 3) return null;
    var w0 = Math.max(0, last - Math.round(0.5 / hop)), w1 = last - endFrames, pre = [];
    for (i = w0; i <= w1; i++) if (st[i] != null) pre.push(st[i]);
    if (pre.length < 3) return null;
    return { rise: pct(endVals, 0.9) - pct(pre, 0.1), last: last, w0: w0 };
  }

  // 쉬는 구간(0.35초 이상)에서 나누기
  function segments(x, sr) {
    var H = Math.round(0.01 * sr), N = Math.round(0.025 * sr), rms = [], maxR = 0;
    for (var s = 0; s + N <= x.length; s += H) { var e = 0; for (var i = 0; i < N; i++) e += x[s + i] * x[s + i]; var r = Math.sqrt(e / N); rms.push(r); if (r > maxR) maxR = r; }
    if (!rms.length) return [];
    var floor = pct(rms, 0.2) || 0, thr = Math.max(maxR * 0.06, floor * 2.5);
    var runs = [], start = -1;
    for (var k = 0; k < rms.length; k++) {
      var on = rms[k] > thr;
      if (on && start < 0) start = k;
      if (!on && start >= 0) { runs.push([start, k]); start = -1; }
    }
    if (start >= 0) runs.push([start, rms.length]);
    var merged = [];
    runs.forEach(function (r) {
      if (merged.length && (r[0] - merged[merged.length - 1][1]) * H / sr < 0.35) merged[merged.length - 1][1] = r[1];
      else merged.push([r[0], r[1]]);
    });
    var pad = Math.round(0.05 * sr);
    return merged.filter(function (r) { return (r[1] - r[0]) * H / sr >= 0.25; })
      .map(function (r) { return [Math.max(0, r[0] * H - pad), Math.min(x.length, r[1] * H + N + pad)]; });
  }


  // ---------- 실시간 부분 ----------
  var SR = 16000, KEEP = 4.0;               // 16kHz로 마지막 4초를 계속 보관
  var ring = new Float32Array(Math.round(SR * KEEP)), wpos = 0, filled = 0;
  var ctx = null, stream = null, node = null, src = null;

  var total = 0, lastChunk = 0, events = [];
  function push(buf) {
    for (var i = 0; i < buf.length; i++) { ring[wpos] = buf[i]; wpos = (wpos + 1) % ring.length; }
    filled = Math.min(ring.length, filled + buf.length);
    total += buf.length; lastChunk = Date.now();
  }
  function lastSeconds(sec) {
    var n = Math.min(filled, Math.round(sec * SR)), out = new Float32Array(n);
    var start = (wpos - n + ring.length) % ring.length;
    for (var i = 0; i < n; i++) out[i] = ring[(start + i) % ring.length];
    return out;
  }
  function note(msg) { events.push(new Date().toLocaleTimeString() + " " + msg); if (events.length > 20) events.shift(); }

  // 마이크 소리를 받는 부분: AudioWorklet을 쓰고, 안 되는 브라우저에서만 예전 방식(ScriptProcessor)으로 받아요
  var WORKLET = "class P extends AudioWorkletProcessor{process(i){var c=i[0]&&i[0][0];if(c)this.port.postMessage(c.slice(0));return true;}}registerProcessor('hearq-tap',P);";
  var workletReady = null, ratio = 1, mute = null;
  function onChunk(x) {
    if (ratio === 1) { push(x); return; }
    var n = Math.floor(x.length / ratio), y = new Float32Array(n);
    for (var i = 0; i < n; i++) { var a = Math.floor(i * ratio), b = Math.floor((i + 1) * ratio), s = 0; for (var k = a; k < b; k++) s += x[k]; y[i] = s / (b - a); }
    push(y);
  }
  // 마이크를 (다시) 열어서 분석에 연결해요. 음성 인식이 마이크를 바꿔 잡아서 끊기면 자동으로 다시 열어요.
  async function attachMic() {
    var constraints = API.rawAudio ? { audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } } : { audio: true };
    var s = await navigator.mediaDevices.getUserMedia(constraints);
    if (src) { try { src.disconnect(); } catch (e) {} }
    if (stream && stream !== s) { stream.getTracks().forEach(function (t) { t.onended = null; t.stop(); }); }
    stream = s;
    var tr = stream.getAudioTracks()[0];
    tr.onended = function () { note("마이크 연결이 끊겨서 다시 여는 중"); if (ctx) attachMic().catch(function (e) { note("다시 열기 실패: " + e.message); }); };
    tr.onmute = function () { note("마이크 소리가 잠깐 멈춤"); };
    tr.onunmute = function () { note("마이크 소리 다시 들어옴"); };
    src = ctx.createMediaStreamSource(stream);
    src.connect(node);
    note("마이크 연결됨");
  }
  async function start() {
    if (ctx) { if (ctx.state !== "running") ctx.resume(); return true; }
    // 클릭 직후에 오디오를 먼저 만들고 켜야 크롬이 막지 않아요 (await 전에)
    try { ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: SR }); }
    catch (e) { ctx = new (window.AudioContext || window.webkitAudioContext)(); }
    var resumed = ctx.resume();
    ratio = ctx.sampleRate / SR;
    mute = ctx.createGain(); mute.gain.value = 0; mute.connect(ctx.destination);
    var usedWorklet = false;
    if (ctx.audioWorklet && window.AudioWorkletNode) {
      try {
        var url = URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" }));
        await ctx.audioWorklet.addModule(url);
        node = new AudioWorkletNode(ctx, "hearq-tap");
        node.port.onmessage = function (e) { onChunk(e.data); };
        usedWorklet = true;
      } catch (e) { node = null; }
    }
    if (!usedWorklet) {
      node = ctx.createScriptProcessor(2048, 1, 1);
      node.onaudioprocess = function (e) { onChunk(e.inputBuffer.getChannelData(0)); };
    }
    node.connect(mute);
    await attachMic();
    try { await Promise.race([resumed, new Promise(function (r) { setTimeout(r, 1500); })]); } catch (e) {}
    API.mode = usedWorklet ? "worklet" : "scriptprocessor";
    return true;
  }
  // 버튼 클릭 안에서 부르면 멈춘 분석을 다시 켜요
  function wake() {
    if (!ctx) return start();
    ctx.resume();
    var tr = stream && stream.getAudioTracks()[0];
    if (!tr || tr.readyState === "ended") return attachMic();
    return Promise.resolve(true);
  }
  function status() {
    var tr = stream && stream.getAudioTracks()[0];
    return { on: !!ctx, ctx: ctx ? ctx.state : "없음", seconds: total / SR, silentFor: lastChunk ? (Date.now() - lastChunk) / 1000 : null,
             track: tr ? tr.readyState : "없음", muted: tr ? tr.muted : null, mode: API.mode, events: events.slice() };
  }
  function stop() {
    try { if (node) node.disconnect(); if (src) src.disconnect(); if (stream) stream.getTracks().forEach(function (t) { t.onended = null; t.stop(); }); if (ctx) ctx.close(); } catch (e) {}
    ctx = stream = node = src = null; wpos = 0; filled = 0; total = 0; lastChunk = 0;
  }

  // 마지막 3초에서 가장 최근에 끝난 말 조각을 찾아 말끝 상승을 재요
  function judge() {
    if (!ctx) return { rise: null, question: false, reason: "분석이 꺼져 있어요" };
    if (!lastChunk || Date.now() - lastChunk > 1000) return { rise: null, question: false, reason: "마이크 소리가 안 들어와요 (" + (ctx ? ctx.state : "") + ")" };
    var x = lastSeconds(3.0);
    if (x.length < SR * 0.5) return { rise: null, question: false, reason: "소리가 너무 짧아요" };
    var segs = segments(x, SR);
    if (!segs.length) return { rise: null, question: false, reason: "말소리를 못 찾았어요" };
    var sg = segs[segs.length - 1];
    var pt = pitchTrack(x.subarray(sg[0], sg[1]), SR), fr = finalRise(pt.st, pt.hop);
    if (!fr) return { rise: null, question: false, reason: "음높이를 못 찾았어요" };
    return { rise: fr.rise, question: fr.rise >= API.threshold, reason: "" };
  }
  // 문장 끝 어미만 봐도 질문인 게 확실한 경우 (예: 먹었니, 가냐, 하나요, 합니까, 할까, 인가요)
  // "-요", "-어", "-지"처럼 질문과 평서문에 둘 다 쓰이는 어미는 여기서 정하지 않고 음높이로 정해요.
  function finalOf(ch) { var c = ch.charCodeAt(0) - 0xAC00; return (c >= 0 && c < 11172) ? c % 28 : -1; }
  function endingQuestion(text) {
    var t = (text || "").replace(/[\s.?!,~…]+$/, "");
    if (!t) return null;
    var w = t.split(/\s+/).pop();
    if (/^(아니|아냐)$/.test(w) || /머니$/.test(w)) return null; // "아냐/아니"(=no), "어머니/할머니"는 질문이 아니에요
    if (/니까$/.test(w)) { var p = w.charAt(w.length - 3); return (p && finalOf(p) === 17) ? "-ㅂ니까" : null; } // 합니까(질문) / 오니까(이유)
    if (/니$/.test(w) && w.length >= 2) return "-니";
    if (/냐$/.test(w)) return "-냐";
    if (/나요$/.test(w)) return "-나요";
    if (/까요?$/.test(w) && w.length >= 2 && w !== "아까") return "-까";
    if (/는가요?$/.test(w)) return "-는가";
    if (/가요?$/.test(w) && w.length >= 2) { var q = w.charAt(w.length - (/요$/.test(w) ? 3 : 2)); if (q && finalOf(q) === 4) return "-ㄴ가"; }
    return null;
  }
  // 문장 끝 어미만 봐도 평서문인 게 확실한 경우 (예: 연락할게, 갈게요, 감사합니다, 했다, 그렇구나)
  function endingStatement(text) {
    var t = (text || "").replace(/[\s.?!,~…]+$/, "");
    if (!t) return null;
    var w = t.split(/\s+/).pop();
    if (/게요?$/.test(w) && w.length >= 2) { var p = w.charAt(w.length - (/요$/.test(w) ? 3 : 2)); if (p && finalOf(p) === 8) return "-ㄹ게"; } // 할게, 먹을게 (어떻게는 아님)
    if (/니다$/.test(w)) return "-ㅂ니다";
    if (/구나$|군요?$/.test(w)) return "-구나";
    if (/다$/.test(w) && w.length >= 2) return "-다";
    return null;
  }
  // 어미와 음높이를 합쳐서 정해요. 어미가 확실하면 어미로, 아니면 말끝 음높이로.
  function decide(text, r) {
    var st = API.useEndings ? endingStatement(text) : null;
    if (st) return { question: false, by: "어미 " + st };
    var e = API.useEndings ? endingQuestion(text) : null;
    if (e) return { question: true, by: "어미 " + e };
    if (r && r.question) return { question: true, by: "억양" };
    return { question: false, by: r && r.rise != null ? "억양" : "" };
  }
  function punctuate(text, r) {
    var t = (text || "").replace(/\s+$/, "").replace(/[.?!]+$/, "");
    if (!t) return t;
    if (decide(t, r).question) return t + "?";
    return API.addPeriod ? t + "." : t;
  }

  var API = { start: start, stop: stop, wake: wake, status: status, judge: judge, punctuate: punctuate, decide: decide, endingQuestion: endingQuestion, endingStatement: endingStatement, useEndings: true, threshold: 4, addPeriod: false, rawAudio: false,
              _pitchTrack: pitchTrack, _finalRise: finalRise, _segments: segments };
  global.HEARQ = API;
})(window);
