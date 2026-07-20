// ---------------------------------------------------------------------------
// TEMPORARY PLAYTEST MODE
// Toggle with ` (backtick) or F2 while playing.
// Remove this file (and its <script> tag) before a "final" release.
// ---------------------------------------------------------------------------

const Playtest = {
  enabled: false,
  invincible: false,
  infiniteLives: true,
  freezeTimer: false,

  // One-shot commands queued for Game.step()
  cmd: null,

  init() {
    window.addEventListener("keydown", (e) => {
      if (e.code === "Backquote" || e.code === "F2") {
        e.preventDefault();
        this.enabled = !this.enabled;
        this.cmd = null;
        return;
      }
      if (!this.enabled) return;

      const map = {
        Digit1: { type: "level", index: 0 },
        Digit2: { type: "level", index: 1 },
        Digit3: { type: "level", index: 2 },
        KeyN: { type: "next" },
        KeyR: { type: "restart" },
        KeyG: { type: "power" }, // cycle small → big → fire
        KeyI: { type: "toggleInvincible" },
        KeyT: { type: "toggleTimer" },
        KeyF: { type: "flag" }, // warp to flag
        KeyU: { type: "under" }, // warp into first enter-pipe / under area
        KeyL: { type: "toggleLives" },
      };
      if (map[e.code]) {
        e.preventDefault();
        this.cmd = map[e.code];
      }
    });
  },

  consume() {
    const c = this.cmd;
    this.cmd = null;
    return c;
  },

  lines() {
    return [
      "PLAYTEST ON",
      "1-3 level  N next  R restart",
      "G power  I invuln  F flag",
      "U under  T timer  L lives",
      "` / F2 toggle",
      this.invincible ? "INVULN ON" : "invuln off",
      this.freezeTimer ? "TIMER FROZEN" : "timer runs",
      this.infiniteLives ? "INF LIVES" : "normal lives",
    ];
  },
};
