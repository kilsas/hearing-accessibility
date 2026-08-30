/* HEAR — Hand tracking wrapper (MediaPipe Hands), V2: two-hand tracking.
   Loads MediaPipe from CDN and exposes a simple callback-based API.
   All video processing happens locally in the browser; frames are
   never uploaded anywhere.

   Each onResult callback fires once per video frame with:
     onResult(vector, meta)
   - vector: a 126-length array (21 landmarks × 3 coords × 2 hands:
     [...leftHand63, ...rightHand63]). A hand that isn't currently
     visible is represented as 63 zeros rather than omitted, so the
     feature vector always has a fixed length whether one or both
     hands are visible. If NEITHER hand is visible, vector is null.
   - meta: { leftPresent, rightPresent, handCount, rawLandmarks }
     rawLandmarks is { left, right } (each an array of 21 {x,y,z} or
     null) for drawing/inspection purposes.

   HANDEDNESS: left/right is assigned from MediaPipe's own handedness
   label (with a fixed mirror correction applied — see onResults()
   below), never from array index or on-screen position. Moving a
   hand across the frame must not change which hand it's reported as. */

window.HearHandTracking = (function () {
  const FEATURES_PER_HAND = 63; // 21 landmarks * 3 (x, y, z)
  const ZERO_HAND = new Array(FEATURES_PER_HAND).fill(0);

  let hands = null;
  let camera = null;
  let onLandmarks = null;
  let videoEl = null;
  let canvasEl = null;
  let canvasCtx = null;

  function normalizeHand(landmarks) {
    // Re-center on the wrist (index 0) and scale by the largest
    // distance from the wrist so the feature vector is roughly
    // invariant to hand size and distance from the camera.
    const wrist = landmarks[0];
    const centered = landmarks.map((p) => ({
      x: p.x - wrist.x,
      y: p.y - wrist.y,
      z: p.z - wrist.z
    }));
    let maxDist = 0;
    centered.forEach((p) => {
      const d = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
      if (d > maxDist) maxDist = d;
    });
    if (maxDist === 0) maxDist = 1;
    const vec = [];
    centered.forEach((p) => {
      vec.push(p.x / maxDist, p.y / maxDist, p.z / maxDist);
    });
    return vec; // length 63
  }

  // Combine left+right into one fixed-length 126 vector. Missing
  // hands are zero-padded rather than dropped, so downstream code
  // (classifier, sequence recorder) never has to special-case
  // one-handed vs two-handed signs — the model simply learns that
  // some signs have a near-zero segment for one hand.
  function combineHands(leftLandmarks, rightLandmarks) {
    const leftVec = leftLandmarks ? normalizeHand(leftLandmarks) : ZERO_HAND;
    const rightVec = rightLandmarks ? normalizeHand(rightLandmarks) : ZERO_HAND;
    return leftVec.concat(rightVec);
  }

  function drawLandmarks(handList) {
    if (!canvasCtx) return;
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    handList.forEach(({ landmarks, color }) => {
      if (window.drawConnectors && window.HAND_CONNECTIONS) {
        window.drawConnectors(canvasCtx, landmarks, window.HAND_CONNECTIONS, { color, lineWidth: 3 });
        window.drawLandmarks(canvasCtx, landmarks, { color: '#2C6E6B', lineWidth: 1, radius: 4 });
      }
    });
    canvasCtx.restore();
  }

  async function start({ video, canvas, onResult, onError }) {
    videoEl = video;
    canvasEl = canvas;
    canvasCtx = canvas ? canvas.getContext('2d') : null;
    onLandmarks = onResult;

    if (!window.Hands) {
      if (onError) onError(new Error('MediaPipe Hands failed to load.'));
      return;
    }

    hands = new window.Hands({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });
    hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.65,
      minTrackingConfidence: 0.55
    });
    hands.onResults((results) => {
      if (canvasEl && (canvasEl.width !== video.videoWidth)) {
        canvasEl.width = video.videoWidth || 640;
        canvasEl.height = video.videoHeight || 480;
      }

      const landmarkSets = results.multiHandLandmarks || [];
      const handedness = results.multiHandedness || [];

      let leftLandmarks = null;
      let rightLandmarks = null;
      const drawList = [];

      landmarkSets.forEach((landmarks, i) => {
        // MediaPipe's handedness label is computed under the assumption
        // that the input image is MIRRORED (a typical front/selfie
        // camera shot). This pipeline feeds MediaPipe the RAW video
        // frame — the mirror the person sees is a CSS-only transform
        // on the <video>/<canvas> (see .camera-wrap video/canvas in
        // styles.css), which never touches the actual pixel data
        // hands.send() reads. So our input is the un-mirrored case,
        // and per MediaPipe's own docs ("if [the input] is not
        // [mirrored], please swap the handedness output"), the raw
        // label has to be swapped to get the person's true hand.
        //
        // This is a position-independent, identity-based swap — a
        // fixed correction applied to whichever label MediaPipe
        // returns, not a left/right assumption based on where the
        // hand appears on screen. Holding a hand up and moving it
        // across the frame must not change which hand it's reported
        // as; only actually switching hands should.
        const rawLabel = handedness[i] && handedness[i].label;
        const label = rawLabel === 'Left' ? 'Right' : (rawLabel === 'Right' ? 'Left' : null);
        if (label === 'Left') {
          leftLandmarks = landmarks;
          drawList.push({ landmarks, color: '#5FBEB9' });
        } else if (label === 'Right') {
          rightLandmarks = landmarks;
          drawList.push({ landmarks, color: '#C97A4A' });
        } else {
          // Unknown label — still draw and slot into whichever side is free.
          if (!leftLandmarks) { leftLandmarks = landmarks; } else if (!rightLandmarks) { rightLandmarks = landmarks; }
          drawList.push({ landmarks, color: '#5FBEB9' });
        }
      });

      if (drawList.length) drawLandmarks(drawList);
      else if (canvasCtx) canvasCtx.clearRect(0, 0, canvasEl.width, canvasEl.height);

      const handCount = (leftLandmarks ? 1 : 0) + (rightLandmarks ? 1 : 0);
      const vector = handCount > 0 ? combineHands(leftLandmarks, rightLandmarks) : null;
      const meta = {
        leftPresent: !!leftLandmarks,
        rightPresent: !!rightLandmarks,
        handCount,
        rawLandmarks: { left: leftLandmarks, right: rightLandmarks }
      };
      if (onLandmarks) onLandmarks(vector, meta);
    });

    try {
      if (window.Camera) {
        camera = new window.Camera(video, {
          onFrame: async () => { await hands.send({ image: video }); },
          width: 640,
          height: 480
        });
        await camera.start();
      } else {
        // Fallback: manual getUserMedia + rAF loop
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
        video.srcObject = stream;
        await video.play();
        const loop = async () => {
          await hands.send({ image: video });
          requestAnimationFrame(loop);
        };
        loop();
      }
    } catch (err) {
      if (onError) onError(err);
    }
  }

  function stop() {
    if (camera && camera.stop) camera.stop();
    if (videoEl && videoEl.srcObject) {
      videoEl.srcObject.getTracks().forEach((t) => t.stop());
    }
  }

  return { start, stop, combineHands, FEATURES_PER_HAND };
})();
