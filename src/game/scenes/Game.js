// src/game/scenes/Game.js
import Phaser, { Scene } from 'phaser';
import { Paddle } from '../objects/Paddle.js';
import { Ball } from '../objects/Ball.js';
import { Goalie } from '../objects/Goalie.js';
import { PowerUpManager } from '../objects/PowerUpManager.js';

const WINNING_SCORE = 3;

const BATTLE_BPM = 152;
const BATTLE_BEAT_MS = 60000 / BATTLE_BPM;
const BATTLE_FIRST_BEAT = 116;

const GOAL_W = 24;
const GOAL_H = 240;
const BALL_R = 10;   // must match Ball.js circle radius

export class GameScene extends Scene {
    constructor() {
        super('Game');
        this._scores = [0, 0];
        this._paused = false;
        this._gameOver = false;
        this._beatCount = 0;
    }

    init(data) {
        this._mode = data?.mode ?? '2P';
        this._scores = [0, 0];
        this._gameOver = false;
        this._paused = false;
        this._beatCount = 0;
    }

    preload() {
        this.load.setPath('assets');
        if (!this.cache.audio.exists('clickSFX'))
            this.load.audio('clickSFX',  'Click_Button.wav');
        if (!this.cache.audio.exists('battleOST'))
            this.load.audio('battleOST', 'Main_Battle_OST.mp3');
        if (!this.cache.audio.exists('quakeSFX'))
            this.load.audio('quakeSFX',  'Quake.wav');
        if (!this.cache.audio.exists('pingSFX'))
            this.load.audio('pingSFX',   'Ping.wav');
        if (!this.cache.audio.exists('dashSFX'))
            this.load.audio('dashSFX',   'Dash.mp3');
        if (!this.cache.audio.exists('clearSFX'))
            this.load.audio('clearSFX', 'Clear.mp3');
    }

    create() {
        const { width: W, height: H } = this.scale;
        this._W = W; this._H = H;

        this._buildArena(W, H);
        this._buildGoalZones(W, H);
        this._buildBarriers(W, H);
        this._buildPlayers(W, H);
        this._buildBall(W, H);
        this._buildGoalies(W, H);
        this._buildHUD(W, H);
        this._powerUpManager = new PowerUpManager(this);
        this._buildPauseMenu(W, H);
        this._setupPhysics();
        this._startMusic();

        this.time.delayedCall(800, () => this._ball.launch(1));
        this.input.keyboard.on('keydown-ESC', () => this._togglePause());
        this.events.on('shutdown', () => {
            this._powerUpManager?.destroy();
            if (this._beatLoop) this._beatLoop.remove();
            // Kill all active tweens to prevent onComplete firing on destroyed objects
            this.tweens.killAll();
        });

        this.time.delayedCall(BATTLE_FIRST_BEAT, () => {
            this._onBeat();
            this._beatLoop = this.time.addEvent({
                delay: BATTLE_BEAT_MS, callback: this._onBeat,
                callbackScope: this, loop: true,
            });
        });

        // Cooldown to prevent repeated goal triggers
        this._goalCooldown = 0;
    }

    update(_time, delta) {
        if (this._paused || this._gameOver) return;
        this._p1Paddle.update(delta);
        this._p2Paddle.update(delta);
        this._p1Goalie.update(delta);
        this._p2Goalie.update(delta);
        this._powerUpManager.update(delta);
        this._ball.update(delta);
        if (this._goalCooldown > 0) this._goalCooldown -= delta;
        this._checkGoal();
        this._manualPaddleCollision();
        this._updateDashBars();
    }

    //  BEAT ENGINE
    _onBeat() {
        if (this._paused || this._gameOver) return;
        this._beatCount++;
        const b = this._beatCount;
        const isBar  = b % 4 === 0;
        const isHalf = b % 2 === 0;

        if (this._arenaBorder) {
            this.tweens.add({
                targets: this._arenaBorder,
                alpha: { from: isBar ? 0.9 : isHalf ? 0.6 : 0.35, to: 0.15 },
                duration: BATTLE_BEAT_MS * 0.7, ease: 'Expo.easeOut',
                overwrite: true,
            });
        }
        if (this._goalZoneGlows) {
            this._goalZoneGlows.forEach(g => this.tweens.add({
                targets: g,
                alpha: { from: isBar ? 0.5 : 0.25, to: 0.08 },
                duration: BATTLE_BEAT_MS * 0.8, ease: 'Expo.easeOut',
                overwrite: true,
            }));
        }
        if (this._centreCircle) {
            this.tweens.add({
                targets: this._centreCircle,
                alpha: { from: isBar ? 0.5 : 0.2, to: 0.05 },
                scaleX: { from: isBar ? 1.1 : 1.04, to: 1 },
                scaleY: { from: isBar ? 1.1 : 1.04, to: 1 },
                duration: BATTLE_BEAT_MS * 0.6, ease: 'Expo.easeOut',
                overwrite: true,
            });
        }
    }

    //  ARENA — solid bg, no stars/grid, neon border only
    _buildArena(W, H) {
        // Solid dark background only — no scrolling grid/stars
        this.add.rectangle(W / 2, H / 2, W, H, 0x08001a);

        // Subtle vignette gradient rings for depth (not stars)
        const vigGfx = this.add.graphics().setDepth(1).setAlpha(0.3);
        vigGfx.fillStyle(0x1a0040, 1);
        vigGfx.fillCircle(W / 2, H / 2, H * 0.6);

        // Neon arena border
        this._arenaBorder = this.add.graphics().setDepth(5).setAlpha(0.15);
        this._arenaBorder.lineStyle(2, 0x00f5ff, 1);
        this._arenaBorder.strokeRect(40, 40, W - 80, H - 80);
        this._arenaBorder.lineStyle(3, 0xff2d78, 1);
        [[40, 40], [W - 40, 40], [40, H - 40], [W - 40, H - 40]].forEach(([cx, cy]) => {
            const dx = cx < W / 2 ? 20 : -20, dy = cy < H / 2 ? 20 : -20;
            this._arenaBorder.strokeLineShape(new Phaser.Geom.Line(cx, cy, cx + dx, cy));
            this._arenaBorder.strokeLineShape(new Phaser.Geom.Line(cx, cy, cx, cy + dy));
        });

        // Centre dashed line
        const dash = this.add.graphics().setDepth(5);
        dash.lineStyle(1, 0x00f5ff, 0.18);
        for (let y = 52; y < H - 52; y += 20)
            dash.strokeLineShape(new Phaser.Geom.Line(W / 2, y, W / 2, y + 10));

        // Centre circle
        const circleGfx = this.add.graphics().setDepth(5).setAlpha(0.08);
        circleGfx.lineStyle(1, 0x00f5ff, 1);
        circleGfx.strokeCircle(W / 2, H / 2, 70);
        this._centreCircle = circleGfx;

        // Scanlines
        if (!this.textures.exists('scanlines')) {
            const sl = this.make.graphics({ add: false });
            for (let y = 0; y < H; y += 3) { sl.fillStyle(0x000000, 0.10); sl.fillRect(0, y, W, 1); }
            sl.generateTexture('scanlines', W, H); sl.destroy();
        }
        this.add.image(W / 2, H / 2, 'scanlines').setDepth(200);

        this.physics.world.setBoundsCollision(false, false, true, true);
        this.physics.world.setBounds(0, 40, W, H - 80);
    }

    //  GOAL ZONES
    _buildGoalZones(W, H) {
        const cy = H / 2;
        this._goalZoneGlows = [];

        const drawGoal = (x, col) => {
            const wallGfx = this.add.graphics().setDepth(6);
            wallGfx.fillStyle(col, 0.12);
            wallGfx.fillRect(x, 40, GOAL_W, cy - GOAL_H / 2 - 40);
            wallGfx.fillRect(x, cy + GOAL_H / 2, GOAL_W, H - 40 - (cy + GOAL_H / 2));

            const edgeGfx = this.add.graphics().setDepth(7);
            edgeGfx.lineStyle(2, col, 0.9);
            edgeGfx.strokeLineShape(new Phaser.Geom.Line(x, cy - GOAL_H / 2, x + GOAL_W, cy - GOAL_H / 2));
            edgeGfx.strokeLineShape(new Phaser.Geom.Line(x, cy + GOAL_H / 2, x + GOAL_W, cy + GOAL_H / 2));

            const glow = this.add.rectangle(x + GOAL_W / 2, cy, GOAL_W, GOAL_H, col, 0.08).setDepth(4);
            this._goalZoneGlows.push(glow);

            // Static wall above goal opening
            const topH = cy - GOAL_H / 2 - 40;
            if (topH > 0) {
                const topWall = this.physics.add.staticImage(x + GOAL_W / 2, 40 + topH / 2, null);
                topWall.setDisplaySize(GOAL_W, topH).refreshBody().setVisible(false);
                this._goalWallGroup.add(topWall);
            }

            // Static wall below goal opening
            const botY = cy + GOAL_H / 2;
            const botH = H - 40 - botY;
            if (botH > 0) {
                const botWall = this.physics.add.staticImage(x + GOAL_W / 2, botY + botH / 2, null);
                botWall.setDisplaySize(GOAL_W, botH).refreshBody().setVisible(false);
                this._goalWallGroup.add(botWall);
            }
        };

        this._goalWallGroup = this.physics.add.staticGroup();
        drawGoal(0, 0x00f5ff);
        drawGoal(W - GOAL_W, 0xff2d78);
    }

    //  BARRIERS — static, no flashing
    _buildBarriers(W, H) {
        this._barriers = this.physics.add.staticGroup();
        const BW = 16, BH = 56;
        if (!this.textures.exists('barrier_tex')) {
            const gfx = this.make.graphics({ add: false });
            gfx.fillStyle(0xff6600, 1);      gfx.fillRect(0, 0, BW, BH);
            gfx.fillStyle(0xffffff, 0.3);    gfx.fillRect(2, 0, 4, BH);
            gfx.lineStyle(1, 0xffffff, 0.5); gfx.strokeRect(0, 0, BW, BH);
            gfx.generateTexture('barrier_tex', BW, BH); gfx.destroy();
        }
        [{ x: W / 2, y: H / 2 - 150 }, { x: W / 2, y: H / 2 + 150 }].forEach(pos => {
            const b = this._barriers.create(pos.x, pos.y, 'barrier_tex');
            b.setDepth(8).setImmovable(true);
        });
    }

    //  PLAYERS
    _buildPlayers(W, H) {
        const margin = 50;
        this._p1Paddle = new Paddle(this, {
            x: 160, y: H / 2,
            minX: margin, maxX: W - margin,
            minY: margin, maxY: H - margin,
            tint: 0x00f5ff, label: 'P1', side: 'left', speed: 300,
            upKey:        Phaser.Input.Keyboard.KeyCodes.W,
            downKey:      Phaser.Input.Keyboard.KeyCodes.S,
            leftKey:      Phaser.Input.Keyboard.KeyCodes.A,
            rightKey:     Phaser.Input.Keyboard.KeyCodes.D,
            rotateCWKey:  Phaser.Input.Keyboard.KeyCodes.E,
            rotateCCWKey: Phaser.Input.Keyboard.KeyCodes.Q,
            dashKey:      Phaser.Input.Keyboard.KeyCodes.SHIFT,
            quakeKey:     Phaser.Input.Keyboard.KeyCodes.F,
        });

        this._p2Paddle = new Paddle(this, {
            x: W - 160, y: H / 2,
            minX: margin, maxX: W - margin,
            minY: margin, maxY: H - margin,
            tint: 0xff2d78, label: 'P2', side: 'right', speed: 300,
            upKey:        Phaser.Input.Keyboard.KeyCodes.UP,
            downKey:      Phaser.Input.Keyboard.KeyCodes.DOWN,
            leftKey:      Phaser.Input.Keyboard.KeyCodes.LEFT,
            rightKey:     Phaser.Input.Keyboard.KeyCodes.RIGHT,
            rotateCWKey:  Phaser.Input.Keyboard.KeyCodes.PERIOD,
            rotateCCWKey: Phaser.Input.Keyboard.KeyCodes.COMMA,
            dashKey:      Phaser.Input.Keyboard.KeyCodes.FORWARD_SLASH,
            quakeKey:     Phaser.Input.Keyboard.KeyCodes.L,
        });
    }

    _buildBall(W, H)  { this._ball = new Ball(this, W / 2, H / 2); }

    _buildGoalies(W, H) {
        const cy = H / 2;
        this._p1Goalie = new Goalie(this, {
            x: GOAL_W + 30, startY: cy,
            tint: 0x0088aa,
            railMinY: cy - GOAL_H / 2,
            railMaxY: cy + GOAL_H / 2,
            speed: 260,
            upKey:   Phaser.Input.Keyboard.KeyCodes.T,
            downKey: Phaser.Input.Keyboard.KeyCodes.G,
        });
        this._p2Goalie = new Goalie(this, {
            x: W - GOAL_W - 30, startY: cy,
            tint: 0xaa0044,
            railMinY: cy - GOAL_H / 2,
            railMaxY: cy + GOAL_H / 2,
            speed: 260,
            upKey:   Phaser.Input.Keyboard.KeyCodes.I,
            downKey: Phaser.Input.Keyboard.KeyCodes.K,
        });
    }

    //  PHYSICS — manual paddle collision (proper rotated hitbox)
    _setupPhysics() {
        // Goalie and barrier collisions still use Arcade Physics (axis-aligned, fine)
        this.physics.add.collider(this._ball.image, this._p1Goalie.image, () => {
            this._ball.accelerate(1);
            try { this.sound.play('pingSFX', { volume: 0.3 }); } catch(_) {}
        });
        this.physics.add.collider(this._ball.image, this._p2Goalie.image, () => {
            this._ball.accelerate(1);
            try { this.sound.play('pingSFX', { volume: 0.3 }); } catch(_) {}
        });
        this.physics.add.collider(this._ball.image, this._barriers, () => {
            try { this.sound.play('pingSFX', { volume: 0.25, detune: -300 }); } catch(_) {}
        });
        this.physics.add.collider(this._ball.image, this._goalWallGroup);

        // Per-paddle cooldown to prevent multi-frame sticking
        this._p1HitCooldown = 0;
        this._p2HitCooldown = 0;
    }

    // ── Manual rotated-paddle collision (runs every frame) ──
    // Treats the paddle as an oriented rectangle, projects the ball
    // onto the paddle's local axes to find overlap and resolve.

    _manualPaddleCollision() {
        this._resolveRotatedPaddle(this._p1Paddle, 1);
        this._resolveRotatedPaddle(this._p2Paddle, 2);
    }

    _resolveRotatedPaddle(paddle, id) {
        // Tick per-paddle cooldown
        if (id === 1) {
            if (this._p1HitCooldown > 0) { this._p1HitCooldown--; return; }
        } else {
            if (this._p2HitCooldown > 0) { this._p2HitCooldown--; return; }
        }

        const ball   = this._ball.image;
        const padImg = paddle.image;

        // Snapshot velocity FIRST — body.reset() zeroes it, so we must read before any mutation
        const vx = ball.body.velocity.x;
        const vy = ball.body.velocity.y;
        const speed = Math.sqrt(vx * vx + vy * vy);

        // Skip if ball has no velocity yet (pre-launch window)
        if (speed < 10) return;

        // Use physics body centre for accurate overlap detection
        const bx = ball.body.center.x;
        const by = ball.body.center.y;
        const px = padImg.x, py = padImg.y;

        // Paddle half-extents (texture 14×80)
        const halfW = 7;
        const halfH = 40;

        // Paddle local axes in world space (Phaser angle: 0=up, clockwise positive)
        const angleRad = Phaser.Math.DegToRad(padImg.angle);
        const cosA = Math.cos(angleRad), sinA = Math.sin(angleRad);

        // Project ball-to-paddle vector onto paddle's local axes
        const dx = bx - px, dy = by - py;
        const localX =  dx * cosA + dy * sinA;   // along paddle width
        const localY = -dx * sinA + dy * cosA;   // along paddle length

        // Check overlap (expanded by ball radius)
        const overlapX = (halfW + BALL_R) - Math.abs(localX);
        const overlapY = (halfH + BALL_R) - Math.abs(localY);
        if (overlapX <= 0 || overlapY <= 0) return;

        // Surface normal — axis of minimum overlap determines contact face
        let nx, ny, pushDist;
        if (overlapX < overlapY) {
            // Hit the wide face (side of paddle)
            const sign = localX > 0 ? 1 : -1;
            nx = cosA * sign;
            ny = sinA * sign;
            pushDist = overlapX;
        } else {
            // Hit the long face (end of paddle)
            const sign = localY > 0 ? 1 : -1;
            nx = -sinA * sign;
            ny =  cosA * sign;
            pushDist = overlapY;
        }

        // Push ball out by moving body.position directly — avoids body.reset() which zeroes velocity
        ball.body.position.x += nx * pushDist;
        ball.body.position.y += ny * pushDist;
        // Sync the display object to the new body position
        ball.x = ball.body.center.x;
        ball.y = ball.body.center.y;

        // Set cooldown immediately (before any early return) to prevent re-entry next frame
        if (id === 1) this._p1HitCooldown = 8;
        else          this._p2HitCooldown = 8;

        // If already moving away from the surface, don't change velocity
        const dot = vx * nx + vy * ny;
        if (dot > 0) return;

        // Reflect velocity off the surface normal using the saved (pre-mutation) velocity
        let rvx = vx - 2 * dot * nx;
        let rvy = vy - 2 * dot * ny;

        // Spin: hit position along long axis deflects the exit angle slightly
        const hitOffset = Phaser.Math.Clamp(localY / halfH, -1, 1);
        const perpX = -ny, perpY = nx;
        rvx += perpX * hitOffset * 100;
        rvy += perpY * hitOffset * 100;

        // Normalise and set speed
        const isDash = paddle.isDashing;
        const newSpeed = Math.min(speed + 18, 720);
        const mag = Math.sqrt(rvx * rvx + rvy * rvy) || 1;
        rvx = (rvx / mag) * newSpeed;
        rvy = (rvy / mag) * newSpeed;

        ball.setVelocity(rvx, rvy);
        this._ball.speed = newSpeed;

        if (isDash) this._ball.dashBoost();

        try { this.sound.play('pingSFX', { volume: isDash ? 0.6 : 0.4, detune: isDash ? 400 : 0 }); } catch(_) {}
    }

    //  GOAL DETECTION — uses ball edge, not center
    _checkGoal() {
        if (this._goalCooldown > 0) return;

        const bx = this._ball.x, by = this._ball.y;
        const cy = this._H / 2;

        // Ball edge positions
        const ballLeft  = bx - BALL_R;
        const ballRight = bx + BALL_R;

        // Check if the ball's center Y is within the goal opening
        const inOpening = Math.abs(by - cy) < GOAL_H / 2 - BALL_R;

        if (ballLeft <= GOAL_W && inOpening) {
            this._scoreGoal(1);   // P2 scores
        } else if (ballRight >= this._W - GOAL_W && inOpening) {
            this._scoreGoal(0);   // P1 scores
        }
    }

    _scoreGoal(scorer) {
        this._goalCooldown = 1200; // prevent re-trigger
        this._scores[scorer]++;
        this._updateScoreDisplay();
        this._flash(scorer === 0 ? 0x00f5ff : 0xff2d78, 250);
        this._ball.reset(this._W / 2, this._H / 2);
        if (this._scores[scorer] >= WINNING_SCORE) {
            this._triggerWin(scorer);
        } else {
            this.time.delayedCall(900, () => this._ball.launch(scorer === 0 ? -1 : 1));
        }
    }

    //  HUD
    _buildHUD(W, H) {
        this._p1ScoreTxt = this.add.text(W / 2 - 80, 10, '0', {
            fontFamily: '"Courier New", Courier, monospace',
            fontSize: '40px', fontStyle: 'bold', color: '#00f5ff',
            stroke: '#00f5ff', strokeThickness: 1,
        }).setOrigin(0.5, 0).setDepth(20);

        this._p2ScoreTxt = this.add.text(W / 2 + 80, 10, '0', {
            fontFamily: '"Courier New", Courier, monospace',
            fontSize: '40px', fontStyle: 'bold', color: '#ff2d78',
            stroke: '#ff2d78', strokeThickness: 1,
        }).setOrigin(0.5, 0).setDepth(20);

        this.add.text(W / 2, 12, ':', {
            fontFamily: '"Courier New", Courier, monospace', fontSize: '30px', color: '#ffffff',
        }).setOrigin(0.5, 0).setDepth(20);

        this.add.text(W / 2, H - 10,
            'P1: WASD MOVE  Q/E ROTATE  SHIFT DASH  F QUAKE  I/K GOALIE  |  ' +
            'P2: ARROWS MOVE  ,/. ROTATE  / DASH  L QUAKE  NUM8/5 GOALIE  |  ESC PAUSE',
            { fontFamily: '"Courier New", Courier, monospace', fontSize: '9px', color: '#442233' }
        ).setOrigin(0.5, 1).setDepth(20);

        // ── Top-screen dash cooldown bars
        // P1 bar: left of centre, P2 bar: right of centre
        const barW = 120, barH = 4, barY = 6;
        const p1BarX = W / 2 - 160;
        const p2BarX = W / 2 + 40;

        // Backgrounds
        const barBg = this.add.graphics().setDepth(21);
        barBg.fillStyle(0x000000, 0.45);
        barBg.fillRect(p1BarX, barY, barW, barH);
        barBg.fillRect(p2BarX, barY, barW, barH);

        // P1 dash fill (cyan)
        this._p1DashBarGfx = this.add.graphics().setDepth(22);
        // P2 dash fill (pink)
        this._p2DashBarGfx = this.add.graphics().setDepth(22);

        this._dashBarMeta = { barW, barH, barY, p1BarX, p2BarX };

        // Pause button top-right
        const pauseGfx = this.add.graphics().setDepth(25);
        const drawPauseBtn = (hover) => {
            pauseGfx.clear();
            pauseGfx.lineStyle(1, 0x443355, hover ? 1 : 0.8);
            pauseGfx.strokeRect(W - 110, 8, 100, 26);
            if (hover) { pauseGfx.fillStyle(0x443355, 0.3); pauseGfx.fillRect(W - 110, 8, 100, 26); }
        };
        drawPauseBtn(false);
        const pauseTxt = this.add.text(W - 60, 21, '⏸  PAUSE', {
            fontFamily: '"Courier New", Courier, monospace', fontSize: '12px', color: '#443355',
        }).setOrigin(0.5).setDepth(25);
        const pauseZone = this.add.zone(W - 60, 21, 100, 26).setInteractive({ useHandCursor: true }).setDepth(25);
        pauseZone.on('pointerover', () => { pauseTxt.setColor('#00f5ff'); drawPauseBtn(true); });
        pauseZone.on('pointerout',  () => { pauseTxt.setColor('#443355'); drawPauseBtn(false); });
        pauseZone.on('pointerdown', () => this._togglePause());
    }

    _updateScoreDisplay() {
        this._p1ScoreTxt.setText(String(this._scores[0]));
        this._p2ScoreTxt.setText(String(this._scores[1]));
        [this._p1ScoreTxt, this._p2ScoreTxt].forEach(t =>
            this.tweens.add({ targets: t, scaleX: 1.5, scaleY: 1.5, duration: 90, yoyo: true })
        );
    }

    //  WIN SCREEN
    _triggerWin(winner) {
        this._gameOver = true;
        if (this._beatLoop) this._beatLoop.remove();
        if (this._music)    this._music.stop();

        const W = this._W, H = this._H;
        const label  = winner === 0 ? 'P1 WINS!' : 'P2 WINS!';
        const color  = winner === 0 ? '#00f5ff'  : '#ff2d78';
        const hexCol = winner === 0 ? 0x00f5ff   : 0xff2d78;
        const r = (hexCol >> 16) & 0xff;
        const g = (hexCol >> 8)  & 0xff;
        const b =  hexCol        & 0xff;

        // ── 1. Dim overlay fades in
        const overlay = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0).setDepth(50);
        this.tweens.add({ targets: overlay, alpha: 0.80, duration: 500, ease: 'Quad.easeIn' });

        // ── 2. Victory music starts immediately
        try {
            if (this.cache.audio.exists('clearSFX')) {
                this._clearMusic = this.sound.add('clearSFX', { loop: false, volume: 0.75 });
                this._clearMusic.play();
            }
        } catch(_) {}

        // ── 3. Camera flash after short delay
        this.time.delayedCall(250, () => {
            this.cameras.main.flash(500, r, g, b);
        });

        // ── 4. Particle burst from centre
        this.time.delayedCall(300, () => {
            for (let i = 0; i < 28; i++) {
                const angle = (i / 28) * Math.PI * 2;
                const dist = Phaser.Math.Between(80, 340);
                const col = i % 3 === 0 ? 0xffffff : hexCol;
                const p = this.add.graphics().setDepth(55);
                const sz = Phaser.Math.Between(3, 9);
                p.fillStyle(col, 1);
                p.fillRect(-sz / 2, -sz / 2, sz, sz);
                p.setPosition(W / 2, H / 2);
                this.tweens.add({
                    targets: p,
                    x: W / 2 + Math.cos(angle) * dist,
                    y: H / 2 + Math.sin(angle) * dist,
                    alpha: 0,
                    angle: Phaser.Math.Between(-360, 360),
                    duration: Phaser.Math.Between(500, 1100),
                    ease: 'Quad.easeOut',
                    onComplete: () => p.destroy(),
                });
            }
        });

        // ── 5. Winner text drops in from above
        const winTxt = this.add.text(W / 2, -100, label, {
            fontFamily: '"Courier New", Courier, monospace',
            fontSize: '88px', fontStyle: 'bold', color,
            stroke: color, strokeThickness: 2,
            shadow: { offsetX: 0, offsetY: 0, color, blur: 30, fill: true },
        }).setOrigin(0.5).setDepth(56).setAlpha(0);

        this.time.delayedCall(400, () => {
            this.tweens.add({
                targets: winTxt,
                y: H / 2 - 90, alpha: 1,
                duration: 500, ease: 'Back.easeOut',
            });
        });

        // ── 6. Score slides up from below
        const scoreTxt = this.add.text(W / 2, H + 50, `${this._scores[0]}  :  ${this._scores[1]}`, {
            fontFamily: '"Courier New", Courier, monospace',
            fontSize: '44px', color: '#ffffff',
            shadow: { offsetX: 0, offsetY: 0, color, blur: 12, fill: true },
        }).setOrigin(0.5).setDepth(56).setAlpha(0);

        this.time.delayedCall(750, () => {
            this.tweens.add({
                targets: scoreTxt,
                y: H / 2 + 8, alpha: 1,
                duration: 420, ease: 'Back.easeOut',
            });
        });

        // ── 7. Neon divider sweeps across
        const divLine = this.add.graphics().setDepth(56).setAlpha(0);
        this.time.delayedCall(1000, () => {
            divLine.lineStyle(2, hexCol, 0.6);
            divLine.strokeLineShape(new Phaser.Geom.Line(W * 0.15, H / 2 + 42, W * 0.85, H / 2 + 42));
            this.tweens.add({ targets: divLine, alpha: 1, duration: 280 });
        });

        // ── 8. Buttons fade up
        this.time.delayedCall(1200, () => {
            this._makeWinBtn(W / 2 - 150, H / 2 + 118, 'REMATCH', 0x00f5ff, () => {
                if (this._clearMusic) this._clearMusic.stop();
                this.scene.restart();
            });
            this._makeWinBtn(W / 2 + 150, H / 2 + 118, 'MENU', 0xff2d78, () => {
                if (this._clearMusic) this._clearMusic.stop();
                this.scene.start('ModeSelect');
            });
        });

        // ── 9. Subtle pulsing glow behind title
        const glow = this.add.rectangle(W / 2, H / 2 - 90, W * 0.85, 120, hexCol, 0).setDepth(51);
        this.time.delayedCall(700, () => {
            this.tweens.add({
                targets: glow, alpha: 0.08,
                duration: 700, ease: 'Sine.easeIn',
                yoyo: true, repeat: -1,
            });
        });
    }

    _makeWinBtn(x, y, label, color, cb) {
        const gfx = this.add.graphics().setDepth(52);
        gfx.lineStyle(2, color, 1); gfx.strokeRect(x - 110, y - 28, 220, 56);
        gfx.fillStyle(color, 0.12); gfx.fillRect(x - 110, y - 28, 220, 56);
        this.add.text(x, y, label, {
            fontFamily: '"Courier New", Courier, monospace', fontSize: '22px', fontStyle: 'bold', color: '#ffffff',
        }).setOrigin(0.5).setDepth(53);
        const zone = this.add.zone(x, y, 220, 56).setInteractive({ useHandCursor: true }).setDepth(53);
        zone.on('pointerover', () => {
            gfx.clear(); gfx.lineStyle(2, color, 1); gfx.strokeRect(x - 110, y - 28, 220, 56);
            gfx.fillStyle(color, 0.35); gfx.fillRect(x - 110, y - 28, 220, 56);
        });
        zone.on('pointerdown', cb);
    }

    //  PAUSE MENU (Needs to be slightly fixed when pause on ball spawn)
    _buildPauseMenu(W, H) {
        this._pauseGroup = this.add.container(W / 2, H / 2).setDepth(80).setVisible(false);
        const overlay   = this.add.rectangle(0, 0, W, H, 0x000000, 0.82);
        const title     = this.add.text(0, -90, 'PAUSED', {
            fontFamily: '"Courier New", Courier, monospace', fontSize: '60px', fontStyle: 'bold', color: '#00f5ff',
            stroke: '#ff2d78', strokeThickness: 2,
        }).setOrigin(0.5);
        const resumeTxt = this.add.text(0, 20, '▶  RESUME', {
            fontFamily: '"Courier New", Courier, monospace', fontSize: '24px', color: '#00f5ff',
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });
        const menuTxt   = this.add.text(0, 72, '⬅  MAIN MENU', {
            fontFamily: '"Courier New", Courier, monospace', fontSize: '24px', color: '#ff2d78',
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        resumeTxt.on('pointerover',  () => resumeTxt.setAlpha(0.7));
        resumeTxt.on('pointerout',   () => resumeTxt.setAlpha(1));
        resumeTxt.on('pointerdown',  () => this._togglePause());
        menuTxt.on('pointerover',    () => menuTxt.setAlpha(0.7));
        menuTxt.on('pointerout',     () => menuTxt.setAlpha(1));
        menuTxt.on('pointerdown',    () => { if (this._music) this._music.stop(); this.scene.start('ModeSelect'); });

        this._pauseGroup.add([overlay, title, resumeTxt, menuTxt]);
    }

    _togglePause() {
        this._paused = !this._paused;
        this._pauseGroup.setVisible(this._paused);
        if (this._paused) {
            this._savedVel = { ...this._ball.body.velocity };
            this._ball.image.setVelocity(0, 0);
        } else {
            this._ball.image.setVelocity(this._savedVel?.x ?? 300, this._savedVel?.y ?? 200);
        }
    }

    //  DASH COOLDOWN BARS (top of screen)
    _updateDashBars() {
        if (!this._dashBarMeta) return;
        const { barW, barH, barY, p1BarX, p2BarX } = this._dashBarMeta;
        const DASH_COOLDOWN = 1200;

        const p1Fill = 1 - Phaser.Math.Clamp(this._p1Paddle.dashCooldown / DASH_COOLDOWN, 0, 1);
        this._p1DashBarGfx.clear();
        this._p1DashBarGfx.fillStyle(0x00f5ff, 0.85);
        this._p1DashBarGfx.fillRect(p1BarX, barY, barW * p1Fill, barH);

        const p2Fill = 1 - Phaser.Math.Clamp(this._p2Paddle.dashCooldown / DASH_COOLDOWN, 0, 1);
        this._p2DashBarGfx.clear();
        this._p2DashBarGfx.fillStyle(0xff2d78, 0.85);
        this._p2DashBarGfx.fillRect(p2BarX, barY, barW * p2Fill, barH);
    }

    //  HELPERS
    _flash(color, duration = 80) {
        const f = this.add.rectangle(this._W / 2, this._H / 2, this._W, this._H, color, 0.15).setDepth(60);
        this.tweens.add({ targets: f, alpha: 0, duration, onComplete: () => f.destroy() });
    }

    _startMusic() {
        try {
            if (this.cache.audio.exists('battleOST')) {
                this._music = this.sound.add('battleOST', { loop: true, volume: 0.35 });
                this._music.play();
            }
        } catch (_) {}
    }
}
