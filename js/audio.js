// ---------------------------------------------------------------------------
// Tiny WebAudio synth. All sound effects and music are generated on the fly
// with oscillators, so the game ships with no audio asset files.
// ---------------------------------------------------------------------------

const Sound = {
  ctx: null,
  master: null,
  muted: false,
  _musicTimer: null,
  _musicStep: 0,

  init() {
    // AudioContext must be created/resumed after a user gesture.
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.25;
    this.master.connect(this.ctx.destination);
  },

  resume() {
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
  },

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) {
      this.master.gain.value = this.muted ? 0 : 0.25;
    }
    return this.muted;
  },

  // Play a single tone. dur in seconds.
  tone(freq, dur, type = "square", vol = 0.5, delay = 0) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur);
  },

  // A quick upward chirp used for pitch-sliding effects.
  slide(f1, f2, dur, type = "square", vol = 0.5) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f1, t0);
    osc.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur);
  },

  // --- Named effects --------------------------------------------------------
  jump() {
    this.slide(320, 640, 0.16, "square", 0.4);
  },
  bump() {
    this.tone(180, 0.08, "square", 0.4);
  },
  coin() {
    this.tone(988, 0.07, "square", 0.5);
    this.tone(1319, 0.16, "square", 0.5, 0.07);
  },
  stomp() {
    this.tone(160, 0.1, "square", 0.5);
    this.slide(400, 120, 0.12, "triangle", 0.4);
  },
  kick() {
    this.tone(220, 0.09, "square", 0.4);
  },
  powerAppear() {
    this.slide(300, 900, 0.3, "square", 0.35);
  },
  powerUp() {
    const notes = [523, 659, 784, 1047, 1319];
    notes.forEach((n, i) => this.tone(n, 0.1, "square", 0.4, i * 0.06));
  },
  powerDown() {
    const notes = [784, 587, 440, 330];
    notes.forEach((n, i) => this.tone(n, 0.12, "square", 0.4, i * 0.07));
  },
  fireball() {
    this.slide(600, 200, 0.12, "sawtooth", 0.3);
  },
  brick() {
    this.tone(120, 0.06, "square", 0.4);
    this.tone(90, 0.12, "square", 0.4, 0.04);
  },
  die() {
    const seq = [660, 620, 0, 500, 580, 660, 0, 520, 620, 700];
    seq.forEach((n, i) => {
      if (n) this.tone(n, 0.14, "square", 0.45, i * 0.11);
    });
  },
  flag() {
    const seq = [392, 523, 659, 784, 1047, 784, 1047];
    seq.forEach((n, i) => this.tone(n, 0.14, "square", 0.4, i * 0.12));
  },
  win() {
    const seq = [523, 659, 784, 1047, 1319, 1047, 784, 1047];
    seq.forEach((n, i) => this.tone(n, 0.16, "square", 0.4, i * 0.14));
  },
  gameOver() {
    const seq = [392, 330, 262, 196];
    seq.forEach((n, i) => this.tone(n, 0.3, "triangle", 0.4, i * 0.28));
  },

  // --- Looping background bassline -----------------------------------------
  startMusic() {
    if (!this.ctx || this._musicTimer) return;
    // A simple, cheerful walking bassline (frequencies in Hz).
    const bass = [
      330, 330, 0, 330, 0, 262, 330, 0, 392, 0, 0, 0, 196, 0, 0, 0,
    ];
    this._musicStep = 0;
    const beat = 0.19;
    this._musicTimer = setInterval(() => {
      if (this.muted) return;
      const n = bass[this._musicStep % bass.length];
      if (n) this.tone(n, beat * 0.9, "triangle", 0.16);
      this._musicStep++;
    }, beat * 1000);
  },

  stopMusic() {
    if (this._musicTimer) {
      clearInterval(this._musicTimer);
      this._musicTimer = null;
    }
  },
};
