// ---------------------------------------------------------------------------
// Tiny WebAudio synth. All sound effects and music are generated on the fly
// with oscillators, so the game ships with no audio asset files.
// ---------------------------------------------------------------------------

const Sound = {
  ctx: null,
  master: null,
  musicGain: null,
  muted: false,
  _musicTimer: null,
  _tracks: null,
  _nextTime: 0,
  _noteLen: 0,

  init() {
    // AudioContext must be created/resumed after a user gesture.
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.25;
    this.master.connect(this.ctx.destination);
    // Music sits on its own quieter bus so sound effects stay punchy.
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.55;
    this.musicGain.connect(this.master);
  },

  // Convert a note name like "C4" / "F#3" to a frequency in Hz.
  noteFreq(name) {
    const semis = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
    const m = /^([A-G])(#|b)?(-?\d)$/.exec(name);
    if (!m) return 0;
    let s = semis[m[1]];
    if (m[2] === "#") s += 1;
    if (m[2] === "b") s -= 1;
    const octave = parseInt(m[3], 10);
    const midi = (octave + 1) * 12 + s;
    return 440 * Math.pow(2, (midi - 69) / 12);
  },

  // Schedule a note at an absolute AudioContext time on a given destination.
  noteAt(freq, startTime, dur, type, vol, dest) {
    if (!this.ctx || !freq) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);
    // Tiny attack + decay for a plucky chiptune envelope.
    g.gain.setValueAtTime(0.0001, startTime);
    g.gain.exponentialRampToValueAtTime(vol, startTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, startTime + dur * 0.9);
    osc.connect(g);
    g.connect(dest || this.master);
    osc.start(startTime);
    osc.stop(startTime + dur);
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

  // --- Looping background music --------------------------------------------
  // Original chiptune arrangements that capture the *feel* of classic NES
  // platformer themes (syncopated square lead, walking bass, bright tempo)
  // without copying any copyrighted melody.
  _buildTracks(theme) {
    const n = (name, d) => ({ f: this.noteFreq(name), d });
    const r = (d) => ({ f: 0, d }); // rest

    if (theme === "under") {
      // Lower, minor, slightly slower underground pulse.
      const melody = [
        n("A3", 4), n("E4", 2), n("A3", 2), n("C4", 4), n("E4", 4),
        n("G3", 4), n("D4", 2), n("G3", 2), n("B3", 4), n("D4", 4),
        n("F3", 4), n("C4", 2), n("F3", 2), n("A3", 4), n("C4", 4),
        n("E3", 4), n("B3", 2), n("E3", 2), n("G3", 4), n("B3", 2), r(2),
      ];
      const bass = [
        n("A2", 4), n("A2", 4), n("A2", 4), n("E2", 4),
        n("G2", 4), n("G2", 4), n("G2", 4), n("D2", 4),
        n("F2", 4), n("F2", 4), n("F2", 4), n("C2", 4),
        n("E2", 4), n("E2", 4), n("E2", 4), n("B1", 4),
      ];
      const pulse = [
        n("A4", 2), r(2), n("A4", 2), r(2), n("C5", 2), r(2), n("A4", 2), r(2),
        n("G4", 2), r(2), n("G4", 2), r(2), n("B4", 2), r(2), n("G4", 2), r(2),
        n("F4", 2), r(2), n("F4", 2), r(2), n("A4", 2), r(2), n("F4", 2), r(2),
        n("E4", 2), r(2), n("E4", 2), r(2), n("G4", 2), r(2), n("E4", 2), r(2),
      ];
      return [
        { notes: melody, type: "square", vol: 0.18, idx: 0, next: 0 },
        { notes: bass, type: "triangle", vol: 0.3, idx: 0, next: 0 },
        { notes: pulse, type: "square", vol: 0.06, idx: 0, next: 0 },
      ];
    }

    // Overworld: bright, bouncy, syncopated — classic NES platformer energy.
    // Key of G, cheerful call-and-response lead + walking bass.
    const melody = [
      // phrase A
      n("G4", 2), n("B4", 2), n("D5", 2), r(1), n("B4", 1), n("D5", 2), n("G5", 4),
      n("E5", 2), n("C5", 2), n("A4", 2), r(1), n("C5", 1), n("E5", 2), n("A5", 4),
      // phrase B
      n("F5", 2), n("D5", 2), n("B4", 2), r(1), n("D5", 1), n("F5", 2), n("B5", 2), n("A5", 2),
      n("G5", 2), n("D5", 2), n("B4", 2), n("G4", 2), n("A4", 2), n("B4", 2), n("D5", 4),
      // phrase C (lift)
      n("G5", 2), r(1), n("G5", 1), n("F5", 2), n("E5", 2), n("D5", 2), n("B4", 2), n("G4", 2),
      n("A4", 2), n("B4", 2), n("C5", 2), n("D5", 2), n("E5", 2), n("D5", 2), n("B4", 4),
      // phrase D (resolve)
      n("C5", 2), n("E5", 2), n("G5", 2), n("E5", 2), n("C5", 2), n("A4", 2), n("F4", 4),
      n("B4", 2), n("D5", 2), n("G5", 2), n("D5", 2), n("B4", 2), n("G4", 2), n("G4", 2), r(2),
    ];

    const bass = [
      n("G2", 2), n("G2", 2), n("D3", 2), n("G2", 2), n("G2", 2), n("B2", 2), n("D3", 2), n("G2", 2),
      n("A2", 2), n("A2", 2), n("E3", 2), n("A2", 2), n("A2", 2), n("C3", 2), n("E3", 2), n("A2", 2),
      n("B2", 2), n("B2", 2), n("F3", 2), n("B2", 2), n("B2", 2), n("D3", 2), n("F3", 2), n("B2", 2),
      n("G2", 2), n("G2", 2), n("D3", 2), n("G2", 2), n("G2", 2), n("B2", 2), n("D3", 2), n("G2", 2),
      n("G2", 2), n("G2", 2), n("D3", 2), n("G2", 2), n("G2", 2), n("B2", 2), n("D3", 2), n("G2", 2),
      n("A2", 2), n("A2", 2), n("E3", 2), n("A2", 2), n("A2", 2), n("C3", 2), n("E3", 2), n("A2", 2),
      n("C3", 2), n("C3", 2), n("G3", 2), n("C3", 2), n("F2", 2), n("F2", 2), n("C3", 2), n("F2", 2),
      n("G2", 2), n("G2", 2), n("D3", 2), n("G2", 2), n("G2", 2), n("D3", 2), n("G2", 2), r(2),
    ];

    // Soft off-beat "harmony sparkle"
    const sparkle = [
      r(2), n("D5", 1), r(1), r(2), n("G5", 1), r(1), r(2), n("D5", 1), r(1), r(2), n("B4", 1), r(1),
      r(2), n("E5", 1), r(1), r(2), n("A5", 1), r(1), r(2), n("E5", 1), r(1), r(2), n("C5", 1), r(1),
      r(2), n("F5", 1), r(1), r(2), n("B5", 1), r(1), r(2), n("F5", 1), r(1), r(2), n("D5", 1), r(1),
      r(2), n("D5", 1), r(1), r(2), n("G5", 1), r(1), r(2), n("D5", 1), r(1), r(2), n("B4", 1), r(1),
      r(2), n("D5", 1), r(1), r(2), n("G5", 1), r(1), r(2), n("D5", 1), r(1), r(2), n("B4", 1), r(1),
      r(2), n("E5", 1), r(1), r(2), n("A5", 1), r(1), r(2), n("E5", 1), r(1), r(2), n("C5", 1), r(1),
      r(2), n("G5", 1), r(1), r(2), n("E5", 1), r(1), r(2), n("C5", 1), r(1), r(2), n("A4", 1), r(1),
      r(2), n("G5", 1), r(1), r(2), n("D5", 1), r(1), r(2), n("B4", 1), r(1), r(2), n("G4", 1), r(1),
    ];

    return [
      { notes: melody, type: "square", vol: 0.2, idx: 0, next: 0 },
      { notes: bass, type: "triangle", vol: 0.28, idx: 0, next: 0 },
      { notes: sparkle, type: "square", vol: 0.07, idx: 0, next: 0 },
    ];
  },

  startMusic(theme = "over") {
    if (!this.ctx) return;
    this.stopMusic();
    const bpm = theme === "under" ? 100 : 118;
    this._noteLen = 60 / bpm / 4; // duration of one 16th note
    this._tracks = this._buildTracks(theme);
    const start = this.ctx.currentTime + 0.12;
    this._tracks.forEach((t) => (t.next = start));
    // Look-ahead scheduler (see "A Tale of Two Clocks").
    this._musicTimer = setInterval(() => this._schedule(), 25);
  },

  _schedule() {
    if (!this.ctx || !this._tracks) return;
    const horizon = this.ctx.currentTime + 0.2;
    for (const t of this._tracks) {
      while (t.next < horizon) {
        const note = t.notes[t.idx];
        const dur = note.d * this._noteLen;
        this.noteAt(note.f, t.next, dur, t.type, t.vol, this.musicGain);
        t.next += dur;
        t.idx = (t.idx + 1) % t.notes.length;
      }
    }
  },

  stopMusic() {
    if (this._musicTimer) {
      clearInterval(this._musicTimer);
      this._musicTimer = null;
    }
    this._tracks = null;
  },
};
