/* Efeitos sonoros sintetizados com WebAudio (sem arquivos de áudio). */
(function (A) {
  'use strict';

  var ctx = null, master = null, noise = null;
  var muted = A.Store.isMuted();
  var lastPlay = {};

  function unlock() {
    if (ctx) {
      if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) { /* ignora */ } }
      return;
    }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.3;
      master.connect(ctx.destination);
      var n = ctx.sampleRate;
      noise = ctx.createBuffer(1, n, ctx.sampleRate);
      var d = noise.getChannelData(0);
      for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { ctx = null; }
  }

  function tone(f0, f1, dur, type, vol, delay) {
    if (!ctx || muted) return;
    var t = ctx.currentTime + (delay || 0);
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.03);
  }

  function burst(dur, vol, cutoff, delay) {
    if (!ctx || muted || !noise) return;
    var t = ctx.currentTime + (delay || 0);
    var s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noise;
    f.type = 'lowpass';
    f.frequency.setValueAtTime(cutoff, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(80, cutoff / 6), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t); s.stop(t + dur + 0.03);
  }

  var SOUNDS = {
    click: function () { tone(520, 640, 0.06, 'triangle', 0.25); },
    gem: function (k) {
      var f = [880, 1175, 1568][k | 0] || 880;
      tone(f, f * 1.5, 0.1, 'sine', 0.3);
    },
    rabbit: function () { tone(392, 587, 0.12, 'triangle', 0.35); tone(587, 880, 0.16, 'triangle', 0.3, 0.1); },
    hurt: function () { burst(0.3, 0.7, 1800); tone(150, 55, 0.28, 'sawtooth', 0.35); },
    thunder: function () { burst(0.7, 0.9, 900); tone(90, 40, 0.5, 'sine', 0.3); },
    warn: function () { tone(660, 660, 0.09, 'square', 0.12); },
    level: function () {
      [523, 659, 784, 1047].forEach(function (f, i) { tone(f, f, 0.16, 'triangle', 0.3, i * 0.09); });
    },
    dead: function () { tone(392, 196, 0.5, 'sawtooth', 0.25); tone(294, 147, 0.6, 'sawtooth', 0.2, 0.18); },
    win: function () {
      [523, 659, 784, 1047, 784, 1047, 1319].forEach(function (f, i) { tone(f, f, 0.2, 'triangle', 0.32, i * 0.11); });
    }
  };

  A.Sound = {
    unlock: unlock,
    play: function (name, arg) {
      var fn = SOUNDS[name];
      if (!fn || !ctx || muted) return;
      var now = Date.now();
      if (lastPlay[name] && now - lastPlay[name] < 45) return;
      lastPlay[name] = now;
      try { fn(arg); } catch (e) { /* som é opcional */ }
    },
    isMuted: function () { return muted; },
    setMuted: function (m) {
      muted = !!m;
      A.Store.setMuted(muted);
      if (master) master.gain.value = muted ? 0 : 0.3;
    }
  };
})(window.Aguia = window.Aguia || {});
