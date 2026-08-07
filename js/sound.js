(function (global) {
  'use strict';

  var audioCtx = null;
  var masterGain = null;
  var unlockPromise = null;

  function ensureAudio() {
    if (!audioCtx) {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      audioCtx = new Ctx();
      masterGain = audioCtx.createGain();
      masterGain.gain.value = 0.4;
      masterGain.connect(audioCtx.destination);
    }
    return audioCtx;
  }

  function resumeAudio() {
    var ctx = ensureAudio();
    if (ctx.state === 'running') {
      return Promise.resolve(ctx);
    }
    // iOS は resume() 完了前に鳴らすと無音になりやすい
    return ctx.resume().then(function () {
      return ctx;
    }).catch(function () {
      return ctx;
    });
  }

  /**
   * ユーザー操作（「はじめる」など）の直後に呼ぶ。
   * iOS Safari で AudioContext を有効化する。
   */
  function unlock() {
    if (!unlockPromise) {
      unlockPromise = resumeAudio().then(function (ctx) {
        // 無音の極短バッファで「解除」を確実にする（iOS 向け）
        try {
          var buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
          var source = ctx.createBufferSource();
          source.buffer = buffer;
          source.connect(masterGain);
          source.start(0);
        } catch (err) {
          // 失敗しても resume できていれば続行
        }
        return ctx;
      });
    }
    return unlockPromise;
  }

  function setVolume(value) {
    ensureAudio();
    var v = Math.max(0, Math.min(1, Number(value)));
    masterGain.gain.value = v * v;
  }

  function playChirp() {
    return resumeAudio().then(function (ctx) {
      var now = ctx.currentTime;

      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(660, now + 0.12);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.9, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);

      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(now);
      osc.stop(now + 0.2);
    });
  }

  global.FireflySound = {
    unlock: unlock,
    setVolume: setVolume,
    play: playChirp,
  };
})(window);
