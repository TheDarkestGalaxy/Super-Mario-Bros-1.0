// ---------------------------------------------------------------------------
// Game controller: owns the world, runs the fixed-timestep simulation, handles
// all inter-entity collisions, scoring, and the level/lives state machine.
// ---------------------------------------------------------------------------

class Game {
  constructor(canvas, overlayEl) {
    this.canvas = canvas;
    this.overlayEl = overlayEl;
    this.camera = new Camera();

    this.levelIndex = 0;
    this.level = null;
    this.overworldDef = null; // saved while underground
    this.returnPipe = null; // { returnX, power snapshot handled via player }
    this.area = "over"; // "over" | "under"

    this.player = null;
    this.enemies = [];
    this.items = [];
    this.fireballs = [];

    this.score = 0;
    this.coins = 0;
    this.lives = 3;
    this.time = 300;
    this._timeFrac = 0;
    this.animTime = 0;

    this.mode = "title"; // title|levelIntro|playing|paused|dying|levelclear|gameover|gamewin
    this.modeTimer = 0;

    this._acc = 0;
    this._last = 0;
    this._raf = null;
  }

  // --- Lifecycle ------------------------------------------------------------
  startNewGame() {
    this.score = 0;
    this.coins = 0;
    this.lives = 3;
    this.levelIndex = 0;
    this.area = "over";
    this.overworldDef = null;
    this.returnPipe = null;
    this.hideOverlay();
    this.loadLevel(0);
  }

  loadLevel(index, opts = {}) {
    this.levelIndex = index;
    this.area = "over";
    this.overworldDef = null;
    this.returnPipe = null;

    const def = Levels.LIST[index];
    this.level = new Level(def);
    this.level.flagDrop = 0;

    const keepPower = opts.keepPower;
    const spawnX = opts.spawnX != null ? opts.spawnX : this.level.startX;
    const spawnY = opts.spawnY != null ? opts.spawnY : this.level.startY;

    if (!this.player || !keepPower) {
      this.player = new Player(spawnX, spawnY);
    } else {
      const power = this.player.power;
      this.player = new Player(spawnX, spawnY);
      if (power === "big") this.player.grow();
      else if (power === "fire") this.player.giveFire();
    }

    this.camera.reset();
    if (opts.cameraX != null) this.camera.x = opts.cameraX;

    this.enemies = [];
    this.items = [];
    this.fireballs = [];
    this._spawnEnemies();

    if (!opts.keepTime) {
      this.time = this.level.time;
      this._timeFrac = 0;
    }

    if (opts.skipIntro) {
      this.mode = "playing";
      Sound.stopMusic();
      Sound.startMusic(this.level.theme === "under" ? "under" : "over");
    } else {
      this.mode = "levelIntro";
      this.modeTimer = 110;
      Sound.stopMusic();
    }
  }

  _spawnEnemies() {
    const SZ = CONFIG.TILE;
    for (const s of this.level.enemySpawns) {
      const xPix = s.x * SZ;
      const bottomPix = (s.y + 1) * SZ;
      this.enemies.push(new Enemy(s.type, xPix, bottomPix));
    }
  }

  hideOverlay() {
    if (this.overlayEl) this.overlayEl.classList.add("hidden");
  }
  showOverlay() {
    if (this.overlayEl) this.overlayEl.classList.remove("hidden");
  }

  musicTheme() {
    return this.level && this.level.isUnder ? "under" : "over";
  }

  // --- Pipe warps -----------------------------------------------------------
  beginPipeEnter(pipe) {
    if (this.area !== "over") return;
    if (!Levels.LIST[this.levelIndex].underground) return;
    this.returnPipe = pipe;
    this._exitingUnder = false;
    this.player.startPipeIn(pipe);
  }

  beginPipeExit() {
    if (this.area !== "under") return;
    const exit = this.level.exitPipe;
    if (!exit) return;
    this.player.startPipeIn(exit); // slide down exit pipe too
    // After slide, finishPipeExit via a flag
    this._exitingUnder = true;
  }

  finishPipeExit() {
    const returnX = this.returnPipe ? this.returnPipe.returnX : 3;
    const overDef = Levels.LIST[this.levelIndex];
    const power = this.player.power;

    this.area = "over";
    this.level = new Level(overDef);
    this.level.flagDrop = 0;
    this.enemies = [];
    this.items = [];
    this.fireballs = [];
    this._spawnEnemies();

    const SZ = CONFIG.TILE;
    // Emerge from a pipe near returnX if one exists, otherwise stand on ground.
    let emerge = null;
    for (const p of overDef.pipes || []) {
      if (Math.abs(p.x - returnX) <= 3) {
        emerge = {
          x: p.x,
          topRow: GROUND_ROW - p.h,
        };
        break;
      }
    }

    const spawnCol = emerge ? emerge.x : returnX;
    this.player = new Player(spawnCol * SZ, GROUND_ROW * SZ - 16);
    if (power === "big" || power === "fire") {
      this.player.power = power;
      this.player._resize(28);
    }

    if (emerge) {
      this.player.startPipeOut(emerge);
    } else {
      this.player.state = "normal";
      this.player.y = GROUND_ROW * SZ - this.player.h;
      this.player.x = spawnCol * SZ + (SZ - this.player.w) / 2;
    }

    this.camera.reset();
    this.camera.x = Math.max(
      0,
      Math.min(
        spawnCol * SZ - CONFIG.VIEW_W * 0.4,
        this.level.pixelWidth - CONFIG.VIEW_W
      )
    );

    this.returnPipe = null;
    this.overworldDef = null;
    this._exitingUnder = false;
    Sound.stopMusic();
    Sound.startMusic("over");
  }

  // Called from player when pipeIn timer ends.
  finishPipeEnter() {
    if (this._exitingUnder) {
      this.finishPipeExit();
      return;
    }
    // Snapshot overworld and go under.
    this.overworldDef = Levels.LIST[this.levelIndex];
    const underDef = this.overworldDef.underground;
    if (!underDef) {
      this.player.state = "normal";
      return;
    }

    const power = this.player.power;
    this.area = "under";
    this.level = new Level(underDef);
    this.level.flagDrop = 0;
    this.enemies = [];
    this.items = [];
    this.fireballs = [];
    this._spawnEnemies();

    this.player = new Player(this.level.startX, this.level.startY);
    if (power === "big") {
      this.player.power = "big";
      this.player._resize(28);
    } else if (power === "fire") {
      this.player.power = "fire";
      this.player._resize(28);
    }
    this.player.state = "normal";

    this.camera.reset();
    Sound.stopMusic();
    Sound.startMusic("under");
  }

  // --- Main loop ------------------------------------------------------------
  run() {
    this._last = performance.now();
    const frame = (now) => {
      this._raf = requestAnimationFrame(frame);
      let delta = now - this._last;
      this._last = now;
      if (delta > 250) delta = 250;
      this._acc += delta;
      while (this._acc >= CONFIG.STEP) {
        this.step();
        this._acc -= CONFIG.STEP;
      }
      Renderer.draw(this);
    };
    this._raf = requestAnimationFrame(frame);
  }

  step() {
    Input.beginFrame();
    this.animTime++;

    if (Input.mutePressed) Sound.toggleMute();
    if (Input.pausePressed) this._togglePause();

    this._handlePlaytest();

    switch (this.mode) {
      case "levelIntro":
        this._stepLevelIntro();
        break;
      case "playing":
        this._stepPlaying();
        break;
      case "dying":
        this._stepDying();
        break;
      case "levelclear":
        this._stepLevelClear();
        break;
      case "gameover":
      case "gamewin":
        if (Input.jumpPressed || Input.anyPressed) {
          if (this._acceptRestart) {
            this.mode = "title";
            this.showOverlay();
            this._acceptRestart = false;
          }
        }
        break;
    }

    Input.endFrame();
  }

  _handlePlaytest() {
    if (typeof Playtest === "undefined") return;
    const cmd = Playtest.consume();
    if (!cmd) return;

    // Allow playtest commands from title too for level select after start.
    if (this.mode === "title") return;

    switch (cmd.type) {
      case "level":
        if (cmd.index >= 0 && cmd.index < Levels.LIST.length) {
          this.loadLevel(cmd.index, { skipIntro: true });
        }
        break;
      case "next":
        this._nextLevel();
        break;
      case "restart":
        this.loadLevel(this.levelIndex, { skipIntro: true });
        break;
      case "power": {
        if (!this.player) break;
        if (this.player.power === "small") this.player.grow();
        else if (this.player.power === "big") this.player.giveFire();
        else {
          this.player.power = "small";
          this.player._resize(16);
        }
        break;
      }
      case "toggleInvincible":
        Playtest.invincible = !Playtest.invincible;
        break;
      case "toggleTimer":
        Playtest.freezeTimer = !Playtest.freezeTimer;
        break;
      case "toggleLives":
        Playtest.infiniteLives = !Playtest.infiniteLives;
        break;
      case "flag": {
        if (!this.player || !this.level || this.area !== "over") break;
        this.player.x = this.level.flagX - 24;
        this.player.y = GROUND_ROW * CONFIG.TILE - this.player.h;
        this.player.vx = 0;
        this.player.vy = 0;
        this.camera.x = Math.max(
          0,
          this.level.flagX - CONFIG.VIEW_W * 0.7
        );
        break;
      }
      case "under": {
        if (this.area === "under") {
          this._exitingUnder = true;
          this.finishPipeExit();
        } else if (this.level && this.level.enterPipes.length) {
          this.returnPipe = this.level.enterPipes[0];
          this._exitingUnder = false;
          this.finishPipeEnter();
        }
        break;
      }
    }
  }

  _stepLevelIntro() {
    this.modeTimer--;
    if (this.modeTimer <= 0) {
      this.mode = "playing";
      Sound.resume();
      Sound.startMusic(this.musicTheme());
    }
  }

  _stepPlaying() {
    const level = this.level;
    this.player.update(level, this);

    // If player finished a pipe slide while exiting, finishPipeEnter handles it.
    if (this.player.state === "pipeIn" || this.player.state === "pipeOut") {
      // Still update camera lightly; skip combat.
      this.camera.follow(this.player, level.pixelWidth);
      return;
    }

    this.enemies.forEach((e) => e.update(level));
    this.items.forEach((it) => it.update(level));
    this.fireballs.forEach((f) => f.update(level));
    level.update();

    this._collide();

    this.enemies = this.enemies.filter((e) => !e.dead);
    this.items = this.items.filter((it) => !it.dead);
    this.fireballs = this.fireballs.filter((f) => !f.dead);

    this.camera.follow(this.player, level.pixelWidth);

    if (
      !(
        typeof Playtest !== "undefined" &&
        Playtest.enabled &&
        Playtest.freezeTimer
      )
    ) {
      this._timeFrac += 1;
      if (this._timeFrac >= 24) {
        this._timeFrac = 0;
        this.time--;
        if (this.time <= 0) {
          this.time = 0;
          this.player.die();
        }
      }
    }

    // Flag only in overworld.
    if (
      this.area === "over" &&
      this.player.x + this.player.w >= level.flagX &&
      this.player.state === "normal"
    ) {
      this._beginLevelClear();
    }

    if (this.player.state === "dying") {
      this.mode = "dying";
    }
  }

  _stepDying() {
    this.player.update(this.level, this);
    if (this.player.dead) {
      this._loseLife();
    }
  }

  _beginLevelClear() {
    this.player.state = "clear";
    this.mode = "levelclear";
    this.modeTimer = 200;
    Sound.stopMusic();
    Sound.win();
    this.addScore(Math.ceil(this.time) * 50);
    this.time = 0;
  }

  _stepLevelClear() {
    this.player.update(this.level, this);
    if (this.level.flagDrop < 120) this.level.flagDrop += 3;
    this.modeTimer--;
    if (this.modeTimer <= 0) this._nextLevel();
  }

  _nextLevel() {
    this.levelIndex++;
    if (this.levelIndex >= Levels.LIST.length) {
      this.mode = "gamewin";
      this._acceptRestart = false;
      setTimeout(() => (this._acceptRestart = true), 800);
      Sound.win();
    } else {
      this.loadLevel(this.levelIndex);
    }
  }

  _loseLife() {
    if (
      !(
        typeof Playtest !== "undefined" &&
        Playtest.enabled &&
        Playtest.infiniteLives
      )
    ) {
      this.lives--;
    }
    if (this.lives < 0) {
      this.mode = "gameover";
      this._acceptRestart = false;
      Sound.gameOver();
      setTimeout(() => (this._acceptRestart = true), 1000);
    } else {
      // Dying underground returns you to overworld start of the level.
      this.loadLevel(this.levelIndex);
    }
  }

  _togglePause() {
    if (this.mode === "playing") {
      this.mode = "paused";
      Sound.stopMusic();
    } else if (this.mode === "paused") {
      this.mode = "playing";
      Sound.startMusic(this.musicTheme());
    }
  }

  // --- Collision handling ---------------------------------------------------
  _collide() {
    const p = this.player;
    if (p.state !== "normal") return;

    for (const e of this.enemies) {
      if (e.dead || e.state === "flipped" || e.state === "flat") continue;
      if (!Physics.overlap(p, e)) continue;

      const pb = p.y + p.h;
      const stomping = p.vy > 0 && pb <= e.y + e.h * 0.6;

      if (p.invincible) {
        e.flip(p.centerX < e.x ? 1 : -1);
        this.addScore(100);
        Sound.kick();
        continue;
      }

      if (stomping && e.stompable) {
        const result = e.stomp(p.centerX);
        p.vy = Input.jump ? -CONFIG.JUMP_SPEED * 0.8 : -CONFIG.BOUNCE_SPEED;
        if (result === "squash" || result === "shell") {
          this.addScore(100);
          Sound.stomp();
        } else if (result === "kick") {
          this.addScore(400);
          Sound.kick();
        } else if (result === "stop") {
          Sound.stomp();
        }
        continue;
      }

      if (e.state === "shell") {
        e.stomp(p.centerX);
        Sound.kick();
        this.addScore(400);
      } else if (e.dangerous) {
        p.damage();
        if (p.state === "dying") return;
      }
    }

    for (const shell of this.enemies) {
      if (shell.state !== "shellMove") continue;
      for (const e of this.enemies) {
        if (e === shell || e.dead || e.state === "flipped") continue;
        if (Physics.overlap(shell, e)) {
          e.flip(shell.vx > 0 ? 1 : -1);
          this.addScore(200);
          Sound.kick();
        }
      }
    }

    for (const f of this.fireballs) {
      if (f.explodeTimer > 0) continue;
      for (const e of this.enemies) {
        if (e.dead || e.state === "flipped" || e.state === "flat") continue;
        if (Physics.overlap(f, e)) {
          e.flip(f.vx > 0 ? 1 : -1);
          f.explode();
          this.addScore(100);
          Sound.stomp();
          break;
        }
      }
    }

    for (const it of this.items) {
      if (it.dead || !it.collectible || it.kind === "coinpop") continue;
      if (!Physics.overlap(p, it)) continue;
      it.dead = true;
      if (it.kind === "mushroom") p.grow();
      else if (it.kind === "flower") p.giveFire();
      else if (it.kind === "star") p.giveStar();
      this.addScore(1000);
    }
  }

  bumpBlock(col, row, player) {
    const result = this.level.bump(col, row, player.big);
    switch (result.kind) {
      case "coin":
        this.collectCoin();
        this.items.push(new Item("coinpop", col, row - 1));
        break;
      case "power": {
        Sound.powerAppear();
        const kind = player.power === "small" ? "mushroom" : "flower";
        this.items.push(new Item(kind, col, row));
        break;
      }
      case "break":
        this.addScore(50);
        Sound.brick();
        break;
      case "bump":
      case "solid":
        Sound.bump();
        break;
    }
    const bx = col * CONFIG.TILE;
    const by = row * CONFIG.TILE;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const feet = e.y + e.h;
      if (
        Math.abs(feet - by) < 6 &&
        e.x + e.w > bx &&
        e.x < bx + CONFIG.TILE
      ) {
        e.flip(e.dir);
        this.addScore(100);
      }
    }
  }

  collectCoin() {
    this.coins++;
    this.addScore(200);
    Sound.coin();
    if (this.coins >= 100) {
      this.coins -= 100;
      this.lives++;
    }
  }

  addScore(n) {
    this.score += n;
  }
}
