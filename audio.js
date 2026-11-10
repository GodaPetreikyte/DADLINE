/* DADLINE — WebAudio: an original looping 90s-phone-style ringtone that speeds up, plus SFX. */
(function (root) {
  'use strict';

  let ctx = null, master = null, muted = false;
  let ringing = false, ringTimer = null, urgency = 0;

  try { muted = localStorage.getItem('dadline-muted') === '1'; } catch (e) { /* storage blocked */ }

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
  }

  function setMuted(m) {
    muted = m;
    try { localStorage.setItem('dadline-muted', m ? '1' : '0'); } catch (e) { /* ignore */ }
    if (master) master.gain.setTargetAtTime(m ? 0 : 0.5, ctx.currentTime, 0.02);
  }

  const midi = n => 440 * Math.pow(2, (n - 69) / 12);

  function tone(freq, dur, opts = {}) {
    if (!ctx) return;
    const t = ctx.currentTime + (opts.delay || 0);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = opts.type || 'square';
    o.frequency.setValueAtTime(freq, t);
    if (opts.slide) o.frequency.exponentialRampToValueAtTime(opts.slide, t + dur);
    if (opts.via) {
      o.frequency.exponentialRampToValueAtTime(opts.via, t + dur * 0.4);
      o.frequency.exponentialRampToValueAtTime(opts.to || freq, t + dur);
    }
    const v = opts.vol || 0.12;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noise(dur, opts = {}) {
    if (!ctx) return;
    const t = ctx.currentTime + (opts.delay || 0);
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = opts.freq || 2000; f.Q.value = 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(opts.vol || 0.15, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t);
  }

  // ---- Ringtone: sounds like an old monophonic phone (3310-style), but the melody is our own. ----
  // One voice only (those phones couldn't play chords), a thin 25%-duty pulse wave, hard
  // on/off staccato notes, and a band-pass "tiny piezo speaker" filter.
  let ringBus = null, pulseWave = null;
  function ringChain() {
    if (ringBus) return ringBus;
    // 25% pulse wave from its Fourier series: buzzier and thinner than a plain square.
    const N = 32, real = new Float32Array(N), imag = new Float32Array(N);
    for (let n = 1; n < N; n++) imag[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * 0.25);
    pulseWave = ctx.createPeriodicWave(real, imag);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 650;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3800;
    const peak = ctx.createBiquadFilter(); peak.type = 'peaking'; peak.frequency.value = 2200; peak.gain.value = 6; peak.Q.value = 1.2;
    ringBus = ctx.createGain(); ringBus.gain.value = 0.11;
    ringBus.connect(hp); hp.connect(peak); peak.connect(lp); lp.connect(master);
    return ringBus;
  }
  function beep(freq, at, dur) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.setPeriodicWave(pulseWave);
    o.frequency.setValueAtTime(freq, at);
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(1, at + 0.002);   // hard start...
    g.gain.setValueAtTime(1, at + dur - 0.004);
    g.gain.linearRampToValueAtTime(0, at + dur);      // ...hard stop
    o.connect(g); g.connect(ringBus);
    o.start(at); o.stop(at + dur + 0.01);
  }

  // Original driving dance riff in 16th notes (MIDI, null = rest): repeated root "kicks",
  // octave jumps and a climbing answer phrase, the way old built-in dance ringtones went.
  const A5 = 81, C6 = 84, D6 = 86, E6 = 88, G6 = 91, A6 = 93, B6 = 95, C7 = 96;
  const PHRASE = [
    A5, null, A5, null, E6, null, A5, A5,   G6, null, E6, null, D6, null, E6, null,
    A5, null, A5, null, E6, null, A5, A5,   C7, null, B6, null, A6, null, G6, E6,
    A5, null, A5, null, E6, null, A5, A5,   G6, null, E6, null, D6, null, C6, null,
    D6, null, E6, null, G6, null, A6, null, C7, null, A6, null, E6, null, A5, null
  ];

  function playPhrase() {
    if (!ringing || !ctx) return;
    ringChain();
    const speed = 1 + urgency * 0.7;
    const step = 0.072 / speed;                   // one 16th note
    const t0 = ctx.currentTime + 0.03;
    PHRASE.forEach((n, i) => {
      if (n === null) return;
      // Repeated notes are extra short so they "kick"; others ring a bit longer.
      const held = PHRASE[i + 1] === null ? 1.6 : 0.75;
      beep(midi(n), t0 + i * step, step * held);
    });
    const gap = (1.1 - urgency * 0.8) * 1000;
    ringTimer = setTimeout(playPhrase, PHRASE.length * step * 1000 + Math.max(200, gap));
  }

  function startRing() {
    init();
    if (ringing) return;
    ringing = true;
    playPhrase();
  }
  function stopRing() {
    ringing = false;
    clearTimeout(ringTimer);
  }
  function setUrgency(u) { urgency = Math.max(0, Math.min(1, u)); }

  const SFX = {
    click:    () => tone(880, 0.04, { vol: 0.06 }),
    dice:     () => { for (let i = 0; i < 7; i++) noise(0.04, { delay: i * 0.06 + Math.random() * 0.02, freq: 1800 + Math.random() * 1500, vol: 0.18 }); },
    step:     () => tone(200, 0.05, { vol: 0.05, slide: 150 }),
    cat:      () => tone(500, 0.45, { type: 'sawtooth', vol: 0.07, via: 950, to: 420 }),
    lego:     () => { noise(0.05, { freq: 4000, vol: 0.25 }); tone(950, 0.3, { vol: 0.1, slide: 180, delay: 0.03 }); },
    mom:      () => { tone(523, 0.16, { type: 'triangle', vol: 0.16 }); tone(392, 0.25, { type: 'triangle', vol: 0.16, delay: 0.18 }); },
    shortcut: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.1, { delay: i * 0.06, vol: 0.09 })),
    sighting: () => [1047, 1319, 1568, 2093].forEach((f, i) => tone(f, 0.18, { delay: i * 0.08, vol: 0.06, type: 'sine' })),
    luck:     () => [784, 988, 1175, 1568, 1976].forEach((f, i) => tone(f, 0.12, { delay: i * 0.05, vol: 0.07 })),
    blocked:  () => { tone(1568, 0.3, { type: 'sine', vol: 0.1 }); tone(2093, 0.3, { type: 'sine', vol: 0.07, delay: 0.08 }); },
    unlock:   () => { noise(0.08, { freq: 600, vol: 0.3 }); tone(150, 0.15, { vol: 0.1, delay: 0.05 }); tone(300, 0.1, { vol: 0.06, delay: 0.2 }); },
    room:     () => tone(660, 0.08, { vol: 0.05, type: 'triangle' }),
    found:    () => [659, 784, 988].forEach((f, i) => tone(f, 0.12, { delay: i * 0.07, vol: 0.09 })),
    chute:    () => tone(1400, 0.7, { type: 'sine', vol: 0.12, slide: 220 }),
    stuck:    () => { tone(120, 0.25, { vol: 0.15 }); noise(0.15, { freq: 400, vol: 0.25 }); },
    whoosh:   () => noise(0.45, { freq: 900, vol: 0.2 }),
    clank:    () => { tone(780, 0.08, { vol: 0.1 }); tone(1170, 0.25, { vol: 0.06, type: 'triangle', delay: 0.03 }); noise(0.1, { freq: 5000, vol: 0.15 }); },
    tick:     () => { tone(330, 0.06, { vol: 0.06 }); tone(247, 0.08, { vol: 0.06, delay: 0.07 }); },
    win:      () => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => { tone(f, 0.16, { delay: i * 0.11, vol: 0.1 }); tone(f / 2, 0.16, { delay: i * 0.11, vol: 0.05, type: 'triangle' }); }),
    lose:     () => { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.22, { delay: i * 0.2, vol: 0.1 })); tone(98, 0.8, { delay: 0.85, vol: 0.08, type: 'sawtooth' }); }
  };

  function sfx(name) {
    if (!ctx || muted || !SFX[name]) return;
    SFX[name]();
  }

  root.DadAudio = { init, startRing, stopRing, setUrgency, sfx, setMuted, isMuted: () => muted };
})(window);
