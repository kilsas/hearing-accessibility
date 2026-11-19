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
    // (11월 16일) 비교 구간에서 평소 목소리보다 9반음 넘게 낮은 값은 빼요.
    // 갈라지는 소리나 "피자"의 "피"처럼 짧은 소리에서 음높이가 한 옥타브 아래로 잘못 잡히면
    // 말끝이 안 올라갔는데도 +15반음처럼 크게 나왔어요. 말끝 구간(endVals)은 그대로 둬요:
    // 평서문 끝이 낮게 떨어지는 건 진짜 정보라서요.
    for (i = w0; i <= w1; i++) if (st[i] != null && st[i] >= -9) pre.push(st[i]);
    if (pre.length < 3) return null;
    return { rise: pct(endVals, 0.9) - pct(pre, 0.1), last: last, w0: w0 };
  }

  // (11월 19일) 앞 올라감: 소리가 시작하고 0.05초 뒤부터 0.45초까지(첫 두 음절쯤)에서 가장 높은 값 - 그 앞의 가장 낮은 값
  // 의문사(누가·뭐·언제…)로 시작하는 문장의 첫 단어가 올라가는지 보려고 써요. 연구(4차 녹음)에서 1.75반음을 기준으로 했어요.
  function frontRise(st, hop) {
    var first = -1, i;
    for (i = 0; i < st.length; i++) if (st[i] != null) { first = i; break; }
    if (first < 0) return null;
    var a = first + Math.round(0.05 / hop), b = Math.min(st.length - 1, first + Math.round(0.45 / hop));
    var pk = null, pi = -1;
    for (i = a; i <= b; i++) if (st[i] != null && (pk == null || st[i] > pk)) { pk = st[i]; pi = i; }
    if (pk == null) return null;
    var lo = null;
    for (i = first; i <= pi; i++) if (st[i] != null && (lo == null || st[i] < lo)) lo = st[i];
    return pk - lo;
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
    if (!vad.timer) vad.timer = setInterval(vadTick, 50);
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
  // 말하다가 쉬는 순간을 찾아요. 쉴 때마다 방금 끝난 말의 말끝 상승을 재서 알려 줘요 (두 문장을 이어 말할 때 쓰기)
  var vad = { speaking: false, on: 0, off: 0, timer: null, cbs: [] };
  function onPause(cb) { vad.cbs.push(cb); }
  function vadTick() {
    if (!ctx || filled < SR * 0.5) return;
    var x = lastSeconds(3.0), H = Math.round(0.05 * SR), rms = [];
    for (var s0 = 0; s0 + H <= x.length; s0 += H) { var e = 0; for (var i = 0; i < H; i++) e += x[s0 + i] * x[s0 + i]; rms.push(Math.sqrt(e / H)); }
    if (rms.length < 4) return;
    var mx = Math.max.apply(null, rms), fl = pct(rms, 0.2) || 0, thr = Math.max(mx * 0.06, fl * 2.5, 0.002);
    var now = rms[rms.length - 1] > thr;
    if (now) { vad.on += 50; vad.off = 0; if (!vad.speaking && vad.on >= 150) vad.speaking = true; }
    else { vad.off += 50; if (vad.speaking && vad.off >= API.pauseMs) { vad.speaking = false; vad.on = 0; var r = judge(); vad.cbs.forEach(function (cb) { try { cb(r); } catch (e) {} }); } if (!vad.speaking) vad.on = 0; }
  }
  function stop() {
    if (vad.timer) { clearInterval(vad.timer); vad.timer = null; } vad.speaking = false; vad.on = vad.off = 0;
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
    var sg = segs[segs.length - 1], seg = x.slice(sg[0], sg[1]);
    var pt = pitchTrack(seg, SR), fr = finalRise(pt.st, pt.hop);
    if (!fr) return { rise: null, question: false, reason: "음높이를 못 찾았어요", audio: seg, st: pt.st };
    return { rise: fr.rise, front: frontRise(pt.st, pt.hop), question: fr.rise >= API.threshold, reason: "", audio: seg, st: pt.st, w0: fr.w0, last: fr.last };
  }
  // 문장 끝 어미만 봐도 질문인 게 확실한 경우 (예: 먹었니, 가냐, 하나요, 합니까, 할까, 인가요)
  // "-요", "-어", "-지"처럼 질문과 평서문에 둘 다 쓰이는 어미는 여기서 정하지 않고 음높이로 정해요.
  function finalOf(ch) { var c = ch.charCodeAt(0) - 0xAC00; return (c >= 0 && c < 11172) ? c % 28 : -1; }
  function endingQuestion(text) {
    var t = (text || "").replace(/[\s.?!,~…]+$/, "");
    if (!t) return null;
    var w = t.split(/\s+/).pop();
    if (/^(아니|아냐)$/.test(w) || /머니$/.test(w)) return null; // "아냐", "아니", "어머니"는 질문 어미가 아니라 단어예요
    if (/니까$/.test(w)) { var p = w.charAt(w.length - 3); return (p && finalOf(p) === 17) ? "-ㅂ니까" : null; } // 합니까(질문) / 오니까(이유)
    if (/니$/.test(w) && w.length >= 2) return "-니";
    if (/냐$/.test(w)) return "-냐";
    if (/나요$/.test(w)) return "-나요";
    if (/까요?$/.test(w) && w.length >= 2 && w !== "아까") return "-까";
    if (/는가요?$/.test(w)) return "-는가";
    if (/^(언젠가|누군가|뭔가|어딘가|무언가|웬만한가)$/.test(w)) return null; // "언젠가", "누군가"는 질문 어미가 아니라 단어예요
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
  // 문장 중간에 있어도 질문이 확실한 어미 (쉬는 자리를 못 찾았을 때 씀): -냐, -었니/-았니/-했니/-겠니, -ㅂ니까, -나요
  // "-ㄹ까"(갈까 말까)나 "-으니"(먹었으니)처럼 중간에서 다른 뜻으로 쓰이는 건 빼요.
  function midQuestionIndexes(words) {
    var out = [];
    for (var i = 0; i < words.length - 1; i++) {
      var w = words[i].replace(/[.?!,]+$/, "");
      if (/^(아니|아냐)$/.test(w) || /머니$/.test(w)) continue;
      if (/냐$/.test(w) || /나요$/.test(w)) { out.push(i + 1); continue; }
      if (/니까$/.test(w)) { var p = w.charAt(w.length - 3); if (p && finalOf(p) === 17) out.push(i + 1); continue; }
      if (/니$/.test(w) && w.length >= 2) { var b = w.charAt(w.length - 2); if (finalOf(b) === 20) out.push(i + 1); }
    }
    return out;
  }
  // ---------- 영어 ----------
  // 영어는 어순으로 질문인 게 확실한 경우(Do you…, Is it…, What are…, …isn't it)는 단어로 정하고,
  // "You're coming?"처럼 어순은 평서문인데 억양으로만 묻는 질문은 음높이로 정해요.
  var EN_AUX = /^(do|does|did|is|are|was|were|am|can|could|will|would|should|shall|may|might|must|have|has|had|isn't|aren't|wasn't|weren't|don't|doesn't|didn't|can't|couldn't|won't|wouldn't|shouldn't|haven't|hasn't|hadn't)$/;
  var EN_SUBJ = /^(i|you|we|they|he|she|it|this|that|these|those|there|the|a|an|my|your|his|her|our|their|its|anyone|anybody|someone|somebody|everyone|everybody|anything|something|everything)$/;
  var EN_WH = /^(what|where|when|why|who|whom|whose|which|how)$/;
  var EN_WH_CONTR = /^(what's|where's|when's|why's|who's|how's|what're|where're|who're|how're)$/;
  var EN_TAGS = /(isn't it|aren't you|aren't they|don't you|doesn't it|didn't you|didn't it|won't you|can't you|wasn't it|weren't you|haven't you|hasn't it)$/;
  var EN_DO_IMPERATIVE = /^(it|this|that|these|those|the|a|an|my|your|his|her|our|their|something|anything|everything)$/; // "Do it now", "Do your homework"는 명령문
  function enWords(text) { return (text || "").toLowerCase().replace(/[.?!,]+/g, " ").trim().split(/\s+/).filter(Boolean); }
  // 문장 앞의 "okay, so", "well", "oh", "hey" 같은 말은 건너뛰고 봐요 ("Okay, so how was your day?")
  var EN_LEAD = /^(okay|ok|so|well|um|uh|oh|hey|alright|all|right|and|but|yeah|yes|no|like|anyway|actually|then|also|hi|hello|sorry|now|wait|hmm|listen|look|anyways|honestly|by|the|way|i|mean|you|know)$/;
  function stripLead(w) {
    var i = 0;
    while (i < w.length - 1 && i < 4) {
      var two = w[i] + " " + (w[i + 1] || "");
      if (/^(all right|by the|the way|i mean|you know)$/.test(two)) { i += 2; continue; }
      if (/^(okay|ok|so|well|um|uh|oh|hey|alright|and|but|yeah|yes|no|anyway|anyways|actually|then|also|hi|hello|sorry|wait|hmm|listen|look|honestly|way)$/.test(w[i])) { i++; continue; }
      break;
    }
    return w.slice(i);
  }
  function englishQuestion(text) {
    var w = stripLead(enWords(text));
    if (!w.length) return null;
    if (w.length >= 2 && EN_AUX.test(w[0]) && EN_SUBJ.test(w[1]) && !(w[0] === "do" && EN_DO_IMPERATIVE.test(w[1]))) return "어순 (" + w[0] + " " + w[1] + "…)";
    if (EN_WH_CONTR.test(w[0])) return "의문사 (" + w[0] + "…)";
    if (w.length >= 2 && EN_WH.test(w[0]) && (EN_AUX.test(w[1]) || /^(many|much|long|often|far|old|about|else)$/.test(w[1]))) return "의문사 (" + w[0] + " " + w[1] + "…)";
    if (w.length >= 3 && EN_WH.test(w[0]) && EN_AUX.test(w[2])) return "의문사 (" + w.slice(0, 3).join(" ") + "…)"; // what time is it, which one is
    if (w.length >= 3 && EN_WH.test(w[0]) && /^(you|we|they|he|she|i|it|u)$/.test(w[1]) && /ing$/.test(w[2])) return "의문사 (" + w.slice(0, 3).join(" ") + "…)"; // where you going, what you doing (be동사가 빠진 말투)
    var tail = w.slice(-2).join(" ");
    if (w.length >= 4 && EN_TAGS.test(tail) && !/^(turn|go|on|the|to)$/.test(w[w.length - 2])) return "꼬리 질문 (…" + tail + ")";
    return null;
  }
  function englishCase(text) {
    var t = (text || "").trim();
    t = t.replace(/\bi\b/g, "I").replace(/\bi'(m|ve|ll|d)\b/g, "I'$1");
    // 문장 앞 "okay", "well", "oh", "hey", "yes", "anyway", "by the way" 뒤에 쉼표 ("Okay, so how was your day?")
    var m = /^(okay|ok|well|oh|hey|yeah|yes|anyway|actually|alright|all right|hi|hello|sorry|um|uh|by the way)\s+(\S+)/i.exec(t);
    if (m && !/^(done|said|then|there)$/i.test(m[2]) && t.indexOf(",") !== m[1].length) t = m[1] + "," + t.slice(m[1].length);
    return t.charAt(0).toUpperCase() + t.slice(1);
  }
  // 쉰 자리 앞이 "okay", "so", "well", "by the way" 같은 말뿐이면 마침표 대신 쉼표를 넣어요
  var EN_DISCOURSE = /^(okay|ok|so|well|um|uh|oh|hey|alright|yeah|yes|no|anyway|anyways|actually|hi|hello|sorry|now|wait|hmm|listen|look|honestly|right|then)$/;
  function isDiscourse(chunk) {
    var w = enWords(chunk);
    if (!w.length || w.length > 3) return false;
    var j = w.join(" ");
    if (/^(by the way|all right|you know|i mean)$/.test(j)) return true;
    return w.every(function (x) { return EN_DISCOURSE.test(x); });
  }
  function fixI(text) { return (text || "").replace(/\bi\b/g, "I").replace(/\bi'(m|ve|ll|d)\b/g, "I'$1"); }
  // 쉰 자리를 어떻게 처리할지 정해요: "final"(문장 끝: ? 또는 .), "comma"(쉼표), "none"(아무것도 안 넣음)
  var KO_CONNECTIVE = /(고|서|면|으면|는데|은데|던데|지만|니까|며|으며|면서|려고|도록|거나|든지|자마자)$/;
  var KO_DISCOURSE = /^(아|어|음|응|네|예|아니|야|저기|있잖아|근데|그런데|그래서|그리고|그러니까|하지만|그럼|그러면|아니면|그래|자|참|와)$/;
  function pauseType(chunk) {
    var w = ((chunk || "").trim().split(/\s+/).pop() || "").replace(/[.?!,]+$/, "");
    if (!w) return "none";
    if (isEnglish()) {
      if (isDiscourse(chunk)) return "comma";
      return looksFinal(chunk) ? "final" : "none";
    }
    if (endingQuestion(w) || endingStatement(w)) return "final";
    if (KO_DISCOURSE.test(w)) return "comma";
    if (/에서$/.test(w)) return "none";             // 학교에서 (장소 조사)
    if (KO_CONNECTIVE.test(w)) return "comma";      // 비가 오니까, 밥 먹고, 했는데
    return looksFinal(chunk) ? "final" : "none";   // 나는, 어제 → 아무것도 안 넣음
  }
  function isEnglish() { return /^en/i.test(API.lang || ""); }

  // 짧게 쉰 자리가 문장 끝인지 확인해요. 조사(은/는/이/가…)나 연결 어미(-고, -서, -는데…)로 끝나면 문장 중간이라 ?를 넣지 않아요.
  // (한국어는 "저는~"처럼 문장 중간에서도 음이 올라가는 경우가 많아서 필요해요)
  var KO_NONFINAL = /(은|는|이|가|을|를|에|에서|에게|한테|께|도|만|랑|이랑|하고|의|로|으로|와|과|부터|까지|처럼|보다|고|서|면|으면|는데|은데|ㄴ데|지만|니까|며|으며|려고|러|면서|도록|게|든지|거나)$/;
  var EN_NONFINAL = /^(and|but|or|so|because|the|a|an|to|of|in|on|at|for|with|from|my|your|his|her|our|their|is|are|was|were|am|if|that|which|who|when|while|i|you|we|they|he|she|it)$/;
  function looksFinal(chunk) {
    var w = (chunk || "").trim().split(/\s+/).pop() || "";
    w = w.replace(/[.?!,]+$/, "");
    if (!w) return false;
    if (isEnglish()) return !EN_NONFINAL.test(w.toLowerCase());
    if (endingQuestion(w) || (endingStatement(w) && /게요?$/.test(w))) return true; // 합니까, 연락할게(요)는 문장 끝
    if (w === "가") return true; // "학교 가"처럼 동사 "가"로 끝나는 말
    if (/^(그런데|근데|그래서|그리고|그러니까|하지만|그러면|그럼|아니면|어제|오늘|내일|지금|아까|나중에|그냥|진짜|정말|아직|벌써)$/.test(w)) return false; // 접속사·부사에서 쉰 건 문장 중간
    return !KO_NONFINAL.test(w);
  }

  // 어미와 음높이를 합쳐서 정해요. 어미가 확실하면 어미로, 아니면 말끝 음높이로.
  // 의문사로 시작하는 말인지 (누가 왔어요, 뭐 먹었어요, what are you doing …)
  var KO_WH = /^(누가|누구|누굴|누구를|뭐|뭘|뭔|무엇|무슨|어디|어디서|언제|왜|어떻게|어떤|어느|얼마|몇)/;
  function startsWithWh(text) {
    var w = (text || "").trim().split(/\s+/)[0] || "";
    if (isEnglish()) return /^(what|where|when|why|who|whom|whose|which|how)$/.test(w.toLowerCase().replace(/[^a-z]/g, ""));
    return KO_WH.test(w);
  }
  function decide(text, r) {
    if (isEnglish()) {
      var en = API.useEndings ? englishQuestion(text) : null;
      if (en) return { question: true, by: en };
      if (r && r.question) return { question: true, by: "억양" };
      if (r && r.front != null && r.front > API.whRise && startsWithWh(text)) return { question: true, by: "의문사 음높이" };
      return { question: false, by: r && r.rise != null ? "억양" : "" };
    }
    var st = API.useEndings ? endingStatement(text) : null;
    if (st) return { question: false, by: "어미 " + st };
    var e = API.useEndings ? endingQuestion(text) : null;
    if (e) return { question: true, by: "어미 " + e };
    if (r && r.question) return { question: true, by: "억양" };
    if (r && r.front != null && r.front > API.whRise && startsWithWh(text)) return { question: true, by: "의문사 음높이" };
    return { question: false, by: r && r.rise != null ? "억양" : "" };
  }
  // (11월 19일) 확신 없는 물음표: 의문사로 시작하고, 질문 어미도 평서 어미도 없고, 말끝 상승이 애매한 구간(2반음 이상, 기준값 미만)이면
  // 진한 ? 대신 흐린 ? 를 붙여요. 구간은 시험 전에 정해 둔 값이고 464개 녹음을 보고 바꾸지 않았어요.
  function uncertain(text, r) {
    if (!r || r.rise == null) return false;
    if (!startsWithWh(text)) return false;
    var d = decide(text, r);
    if (d.question || (API.useEndings && !isEnglish() && endingStatement(text))) return false;
    return r.rise >= API.uncertainLo && r.rise < API.threshold;
  }
  function punctuate(text, r) {
    var t = (text || "").replace(/\s+$/, "").replace(/[.?!]+$/, "");
    if (!t) return t;
    if (isEnglish()) t = englishCase(t);
    if (decide(t, r).question) return t + "?";
    return (API.addPeriod || isEnglish()) ? t + "." : t;
  }

  var API = { version: "2026-11-16", start: start, stop: stop, wake: wake, onPause: onPause, status: status, judge: judge, punctuate: punctuate, decide: decide, pauseType: pauseType, looksFinal: looksFinal, isDiscourse: isDiscourse, fixI: fixI, englishQuestion: englishQuestion, englishCase: englishCase, lang: "ko-KR", midQuestionIndexes: midQuestionIndexes, pauseMs: 150, endingQuestion: endingQuestion, endingStatement: endingStatement, useEndings: true, threshold: 4, whRise: 1e9, uncertainLo: 2, addPeriod: false, rawAudio: false,
              _pitchTrack: pitchTrack, _finalRise: finalRise, _frontRise: frontRise, startsWithWh: startsWithWh, uncertain: uncertain, _segments: segments };
  global.HEARQ = API;
})(window);
