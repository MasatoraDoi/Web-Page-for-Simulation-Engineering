(function (global) {
  'use strict';

  var audioCtx = null;
  var masterGain = null;

  function ensureAudio() {
    if (!audioCtx) {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      audioCtx = new Ctx();
      masterGain = audioCtx.createGain();
      masterGain.gain.value = 0.4;
      masterGain.connect(audioCtx.destination);
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function setVolume(value) {
    ensureAudio();
    // value: 0..1
    var v = Math.max(0, Math.min(1, Number(value)));
    // 聴感に合わせて少し曲線を付ける
    masterGain.gain.value = v * v;
  }

  function playChirp() {
    var ctx = ensureAudio();
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
  }

  global.FireflySound = {
    setVolume: setVolume,
    play: playChirp,
  };
})(window);
