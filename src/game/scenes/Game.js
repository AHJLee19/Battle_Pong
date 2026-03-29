// src/game/scenes/Game.js
// ─────────────────────────────────────────────────────────────
//  BATTLE PONG – Game Arena
//
//  Changes from original:
//  • Goal = small zone in the centre of each wall (not full wall)
//  • Paddles roam freely in their half (no rail)
//  • Dash — active key, bursts paddle in its facing direction
//    and gives ball a speed bonus on impact
//  • Quake — active key on paddle, pushes opponent away
//  • Beat-synced arena pulse (152 BPM battle OST)
//  • Retrowave colour palette
// ─────────────────────────────────────────────────────────────
// src/game/scenes/Game.js
import { Scene }          from 'phaser';
import { Paddle }         from '../objects/Paddle.js';
import { Ball }           from '../objects/Ball.js';
import { Goalie }         from '../objects/Goalie.js';
import { PowerUpManager } from '../objects/PowerUpManager.js';

const WINNING_SCORE = 7;

const BATTLE_BPM        = 152;
const BATTLE_BEAT_MS    = 60000 / BATTLE_BPM;
const BATTLE_FIRST_BEAT = 116;

const GOAL_W = 5;
const GOAL_H = 180;

export class GameScene extends Scene {
    constructor() {
        super('Game');
        this._scores   = [0, 0];
        this._paused   = false;
        this._gameOver = false;
        this._beatCount = 0;
    }

    init(data) {
        this._mode      = data?.mode ?? '2P';
        this._scores    = [0, 0];
        this._gameOver  = false;
        this._paused    = false;
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
            this._powerUpManager.destroy();
            if (this._beatLoop) this._beatLoop.remove();
        });

        this.time.delayedCall(BATTLE_FIRST_BEAT, () => {
            this._onBeat();
            this._beatLoop = this.time.addEvent({
                delay: BATTLE_BEAT_MS, callback: this._onBeat,
                callbackScope: this, loop: true,
            });
        });
    }

    update(_time, delta) {
        if (this._paused || this._gameOver) return;
        this._p1Paddle.update(delta);
        this._p2Paddle.update(delta);
        this._p1Goalie.update(delta);
        this._p2Goalie.update(delta);
        this._powerUpManager.update(delta);
        this._ball.update();
        this._checkGoal();
        if (this._bgGrid) this._bgGrid.tilePositionY = _time * 0.015;
    }

    // ════════════════════════════════════════════════════════
    //  BEAT ENGINE
    // ════════════════════════════════════════════════════════

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
            });
        }
        if (this._goalZoneGlows) {
            this._goalZoneGlows.forEach(g => this.tweens.add({
                targets: g,
                alpha: { from: isBar ? 0.5 : 0.25, to: 0.08 },
                duration: BATTLE_BEAT_MS * 0.8, ease: 'Expo.easeOut',
            }));
        }
        if (this._centreCircle) {
            this.tweens.add({
                targets: this._centreCircle,
                alpha: { from: isBar ? 0.5 : 0.2, to: 0.05 },
                scaleX: { from: isBar ? 1.1 : 1.04, to: 1 },
                scaleY: { from: isBar ? 1.1 : 1.04, to: 1 },
                duration: BATTLE_BEAT_MS * 0.6, ease: 'Expo.easeOut',
            });
        }
        if (isBar && this._bgGrid) {
            this.tweens.add({
                targets: this._bgGrid,
                alpha: { from: 0.7, to: 0.4 },
                duration: BATTLE_BEAT_MS * 0.4, ease: 'Expo.easeOut',
            });
        }
    }

    // ════════════════════════════════════════════════════════
    //  ARENA
    // ════════════════════════════════════════════════════════

    _buildArena(W, H) {
        this.add.rectangle(W/2, H/2, W, H, 0x0a0015);

        if (!this.textures.exists('gridTileMag')) {
            const g = this.make.graphics({ add: false });
            g.lineStyle(1, 0xff2d78, 0.25); g.strokeRect(0,0,64,64);
            g.generateTexture('gridTileMag', 64, 64); g.destroy();
        }
        this._bgGrid = this.add.tileSprite(W/2, H/2, W, H, 'gridTileMag').setAlpha(0.4);

        this._arenaBorder = this.add.graphics().setDepth(5).setAlpha(0.15);
        this._arenaBorder.lineStyle(2, 0x00f5ff, 1);
        this._arenaBorder.strokeRect(40, 40, W-80, H-80);
        this._arenaBorder.lineStyle(3, 0xff2d78, 1);
        [[40,40],[W-40,40],[40,H-40],[W-40,H-40]].forEach(([cx,cy]) => {
            const dx = cx < W/2 ? 20 : -20, dy = cy < H/2 ? 20 : -20;
            this._arenaBorder.strokeLineShape(new Phaser.Geom.Line(cx,cy,cx+dx,cy));
            this._arenaBorder.strokeLineShape(new Phaser.Geom.Line(cx,cy,cx,cy+dy));
        });

        const dash = this.add.graphics().setDepth(5);
        dash.lineStyle(1, 0x00f5ff, 0.2);
        for (let y = 52; y < H-52; y += 20)
            dash.strokeLineShape(new Phaser.Geom.Line(W/2, y, W/2, y+10));

        const circleGfx = this.add.graphics().setDepth(5).setAlpha(0.08);
        circleGfx.lineStyle(1, 0x00f5ff, 1);
        circleGfx.strokeCircle(W/2, H/2, 70);
        this._centreCircle = circleGfx;

        if (!this.textures.exists('scanlines')) {
            const sl = this.make.graphics({ add: false });
            for (let y = 0; y < H; y += 3) { sl.fillStyle(0x000000, 0.10); sl.fillRect(0,y,W,1); }
            sl.generateTexture('scanlines', W, H); sl.destroy();
        }
        this.add.image(W/2, H/2, 'scanlines').setDepth(200);

        this.physics.world.setBoundsCollision(false, false, true, true);
        this.physics.world.setBounds(0, 40, W, H - 80);
    }

    // ════════════════════════════════════════════════════════
    //  GOAL ZONES
    // ════════════════════════════════════════════════════════

    _buildGoalZones(W, H) {
        const cy = H / 2;
        this._goalZoneGlows = [];

        const drawGoal = (x, col) => {
            const wallGfx = this.add.graphics().setDepth(6);
            wallGfx.fillStyle(col, 0.12);
            wallGfx.fillRect(x, 40, GOAL_W, cy - GOAL_H/2 - 40);
            wallGfx.fillRect(x, cy + GOAL_H/2, GOAL_W, H - 40 - (cy + GOAL_H/2));

            const edgeGfx = this.add.graphics().setDepth(7);
            edgeGfx.lineStyle(2, col, 0.9);
            edgeGfx.strokeLineShape(new Phaser.Geom.Line(x, cy - GOAL_H/2, x + GOAL_W, cy - GOAL_H/2));
            edgeGfx.strokeLineShape(new Phaser.Geom.Line(x, cy + GOAL_H/2, x + GOAL_W, cy + GOAL_H/2));

            const glow = this.add.rectangle(x + GOAL_W/2, cy, GOAL_W, GOAL_H, col, 0.08).setDepth(4);
            this._goalZoneGlows.push(glow);

            const topWall = this.physics.add.staticImage(x + GOAL_W/2, 40 + (cy - GOAL_H/2 - 40)/2, null);
            topWall.setDisplaySize(GOAL_W, cy - GOAL_H/2 - 40);
            topWall.refreshBody();
            topWall.setVisible(false);

            const botY = cy + GOAL_H/2, botH = H - 40 - botY;
            const botWall = this.physics.add.staticImage(x + GOAL_W/2, botY + botH/2, null);
            botWall.setDisplaySize(GOAL_W, botH);
            botWall.refreshBody();
            botWall.setVisible(false);

            return { topWall, botWall };
        };

        const left  = drawGoal(0, 0x00f5ff);
        const right = drawGoal(W - GOAL_W, 0xff2d78);

        this._leftGoalWalls  = left;
        this._rightGoalWalls = right;

        this._goalWallGroup = this.physics.add.staticGroup();
        [left.topWall, left.botWall, right.topWall, right.botWall].forEach(w => {
            this._goalWallGroup.add(w);
        });
    }

    // ════════════════════════════════════════════════════════
    //  BARRIERS
    // ════════════════════════════════════════════════════════

    _buildBarriers(W, H) {
        this._barriers = this.physics.add.staticGroup();
        const BW = 16, BH = 56;
        if (!this.textures.exists('barrier_tex')) {
            const gfx = this.make.graphics({ add: false });
            gfx.fillStyle(0xff6600, 1); gfx.fillRect(0,0,BW,BH);
            gfx.fillStyle(0xffffff, 0.3); gfx.fillRect(2,0,4,BH);
            gfx.lineStyle(1, 0xffffff, 0.5); gfx.strokeRect(0,0,BW,BH);
            gfx.generateTexture('barrier_tex', BW, BH); gfx.destroy();
        }
        [{ x: W/2, y: H/2-150 }, { x: W/2, y: H/2+150 }].forEach(pos => {
            const b = this._barriers.create(pos.x, pos.y, 'barrier_tex');
            b.setDepth(8).setImmovable(true);
            this.tweens.add({ targets: b, alpha: { from: 0.6, to: 1 }, duration: 700, yoyo: true, repeat: -1 });
        });
    }

    // ════════════════════════════════════════════════════════
    //  PLAYERS — paddles roam FULL arena
    // ════════════════════════════════════════════════════════

    _buildPlayers(W, H) {
        const margin = 50;

        this._p1Paddle = new Paddle(this, {
            x: 160, y: H/2,
            minX: margin, maxX: W - margin,   // full arena width
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
            x: W - 160, y: H/2,
            minX: margin, maxX: W - margin,   // full arena width
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

    _buildBall(W, H) { this._ball = new Ball(this, W/2, H/2); }

    _buildGoalies(W, H) {
        const cy = H / 2;
        // P1 goalie: I / K   (left side)
        this._p1Goalie = new Goalie(this, {
            x: GOAL_W + 30, startY: cy,
            tint: 0x0088aa,
            railMinY: cy - GOAL_H/2,
            railMaxY: cy + GOAL_H/2,
            speed: 260,
            upKey:   Phaser.Input.Keyboard.KeyCodes.I,
            downKey: Phaser.Input.Keyboard.KeyCodes.K,
        });
        // P2 goalie: NUMPAD_8 / NUMPAD_5   (right side)
        this._p2Goalie = new Goalie(this, {
            x: W - GOAL_W - 30, startY: cy,
            tint: 0xaa0044,
            railMinY: cy - GOAL_H/2,
            railMaxY: cy + GOAL_H/2,
            speed: 260,
            upKey:   Phaser.Input.Keyboard.KeyCodes.NUMPAD_8,
            downKey: Phaser.Input.Keyboard.KeyCodes.NUMPAD_5,
        });
    }

    // ════════════════════════════════════════════════════════
    //  PHYSICS — angle-based ball bounce off paddle
    // ════════════════════════════════════════════════════════

    _setupPhysics() {
        const applyAngledBounce = (ballImg, paddleImg) => {
            // Find which paddle object this is
            const paddle = (this._p1Paddle.image === paddleImg) ? this._p1Paddle : this._p2Paddle;
            const isDash = paddle.isDashing;

            // Paddle surface normal is perpendicular to its angle
            // Paddle angle 0 = vertical bar, so surface faces horizontally.
            // Normal angle = paddle.angle (the direction the face points)
            const paddleAngleRad = Phaser.Math.DegToRad(paddleImg.angle);

            // Current ball velocity
            const vel = ballImg.body.velocity;
            const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y);

            // Surface normal (perpendicular to the paddle's length)
            // Paddle length is along Y axis when angle=0, so normal is along X
            const normalX = Math.cos(paddleAngleRad);
            const normalY = Math.sin(paddleAngleRad);

            // Reflect velocity around the surface normal
            const dot = vel.x * normalX + vel.y * normalY;
            let reflX = vel.x - 2 * dot * normalX;
            let reflY = vel.y - 2 * dot * normalY;

            // Preserve (or boost) speed
            const newSpeed = Math.min(speed + (isDash ? 36 : 18), 720);
            const mag = Math.sqrt(reflX * reflX + reflY * reflY) || 1;
            reflX = (reflX / mag) * newSpeed;
            reflY = (reflY / mag) * newSpeed;

            // Add some spin based on how far off-centre the hit was
            const hitOffsetY = ballImg.y - paddleImg.y;
            const spinFactor = hitOffsetY / 40;  // -1 to 1 range
            reflY += spinFactor * 80;

            ballImg.setVelocity(reflX, reflY);
            this._ball._speed = newSpeed;

            this._flash(0x00f5ff, isDash ? 120 : 55);
            try {
                this.sound.play('pingSFX', { volume: isDash ? 0.6 : 0.4, detune: isDash ? 400 : 0 });
            } catch(_) {}
        };

        this.physics.add.collider(this._ball.image, this._p1Paddle.image, applyAngledBounce);
        this.physics.add.collider(this._ball.image, this._p2Paddle.image, applyAngledBounce);
        this.physics.add.collider(this._ball.image, this._p1Goalie.image, (_b) => {
            this._ball.accelerate(1);
            try { this.sound.play('pingSFX', { volume: 0.3 }); } catch(_) {}
        });
        this.physics.add.collider(this._ball.image, this._p2Goalie.image, (_b) => {
            this._ball.accelerate(1);
            try { this.sound.play('pingSFX', { volume: 0.3 }); } catch(_) {}
        });
        this.physics.add.collider(this._ball.image, this._barriers, () => {
            this._flash(0xff6600, 40);
            try { this.sound.play('pingSFX', { volume: 0.25, detune: -300 }); } catch(_) {}
        });
        this.physics.add.collider(this._ball.image, this._goalWallGroup);
    }

    // ════════════════════════════════════════════════════════
    //  GOAL DETECTION
    // ════════════════════════════════════════════════════════

    _checkGoal() {
        const bx = this._ball.x, by = this._ball.y;
        const cy = this._H / 2;
        const inOpening = Math.abs(by - cy) < GOAL_H / 2;

        if (bx < GOAL_W && inOpening)                this._scoreGoal(1);
        else if (bx > this._W - GOAL_W && inOpening) this._scoreGoal(0);
        else if (bx < 10)           this._ball.image.setVelocityX( Math.abs(this._ball.body.velocity.x));
        else if (bx > this._W - 10) this._ball.image.setVelocityX(-Math.abs(this._ball.body.velocity.x));
    }

    _scoreGoal(scorer) {
        this._scores[scorer]++;
        this._updateScoreDisplay();
        this._flash(scorer === 0 ? 0x00f5ff : 0xff2d78, 250);
        this._ball.reset(this._W/2, this._H/2);
        if (this._scores[scorer] >= WINNING_SCORE) {
            this._triggerWin(scorer);
        } else {
            this.time.delayedCall(900, () => this._ball.launch(scorer === 0 ? -1 : 1));
        }
    }

    // ════════════════════════════════════════════════════════
    //  HUD
    // ════════════════════════════════════════════════════════

    _buildHUD(W, H) {
        this._p1ScoreTxt = this.add.text(W/2 - 80, 10, '0', {
            fontFamily: '"Courier New", Courier, monospace',
            fontSize: '40px', fontStyle: 'bold', color: '#00f5ff',
            stroke: '#00f5ff', strokeThickness: 1,
        }).setOrigin(0.5, 0).setDepth(20);

        this._p2ScoreTxt = this.add.text(W/2 + 80, 10, '0', {
            fontFamily: '"Courier New", Courier, monospace',
            fontSize: '40px', fontStyle: 'bold', color: '#ff2d78',
            stroke: '#ff2d78', strokeThickness: 1,
        }).setOrigin(0.5, 0).setDepth(20);

        this.add.text(W/2, 12, ':', {
            fontFamily: '"Courier New", Courier, monospace',
            fontSize: '30px', color: '#ffffff',
        }).setOrigin(0.5, 0).setDepth(20);

        this.add.text(W/2, H - 10,
            'P1: WASD MOVE  Q/E ROTATE  SHIFT DASH  F QUAKE  I/K GOALIE  |  ' +
            'P2: ARROWS MOVE  ,/. ROTATE  / DASH  L QUAKE  NUM8/5 GOALIE  |  ESC PAUSE',
            { fontFamily: '"Courier New", Courier, monospace', fontSize: '9px', color: '#442233' }
        ).setOrigin(0.5, 1).setDepth(20);

        // Pause button (top-right)
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

        // Back button (top-left)
        const gfx2 = this.add.graphics().setDepth(25);
        gfx2.lineStyle(1, 0x443355, 0.8); gfx2.strokeRect(10, 8, 100, 26);
        const bTxt = this.add.text(60, 21, '◀  MENU', {
            fontFamily: '"Courier New", Courier, monospace', fontSize: '12px', color: '#443355',
        }).setOrigin(0.5).setDepth(25);
        const bZone = this.add.zone(60, 21, 100, 26).setInteractive({ useHandCursor: true }).setDepth(25);
        bZone.on('pointerover', () => bTxt.setColor('#00f5ff'));
        bZone.on('pointerout',  () => bTxt.setColor('#443355'));
        bZone.on('pointerdown', () => { if (this._music) this._music.stop(); this.scene.start('ModeSelect'); });
    }

    _updateScoreDisplay() {
        this._p1ScoreTxt.setText(String(this._scores[0]));
        this._p2ScoreTxt.setText(String(this._scores[1]));
        [this._p1ScoreTxt, this._p2ScoreTxt].forEach(t =>
            this.tweens.add({ targets: t, scaleX: 1.5, scaleY: 1.5, duration: 90, yoyo: true })
        );
    }

    // ════════════════════════════════════════════════════════
    //  WIN SCREEN
    // ════════════════════════════════════════════════════════

    _triggerWin(winner) {
        this._gameOver = true;
        if (this._beatLoop) this._beatLoop.remove();
        if (this._music)    this._music.stop();
        const W = this._W, H = this._H;
        const label  = winner === 0 ? 'P1 WINS!' : 'P2 WINS!';
        const color  = winner === 0 ? '#00f5ff'  : '#ff2d78';
        const hexCol = winner === 0 ? 0x00f5ff   : 0xff2d78;

        this.add.rectangle(W/2, H/2, W, H, 0x000000, 0.75).setDepth(50);
        this.cameras.main.flash(500, hexCol >> 16, (hexCol >> 8) & 0xff, hexCol & 0xff);

        this.add.text(W/2, H/2 - 70, label, {
            fontFamily: '"Courier New", Courier, monospace',
            fontSize: '88px', fontStyle: 'bold', color,
            stroke: color, strokeThickness: 2,
            shadow: { offsetX: 0, offsetY: 0, color, blur: 30, fill: true },
        }).setOrigin(0.5).setDepth(51);

        this.add.text(W/2, H/2 + 24, `${this._scores[0]}  :  ${this._scores[1]}`, {
            fontFamily: '"Courier New", Courier, monospace', fontSize: '44px', color: '#ffffff',
        }).setOrigin(0.5).setDepth(51);

        this._makeWinBtn(W/2-150, H/2+120, 'REMATCH', 0x00f5ff, () => this.scene.restart());
        this._makeWinBtn(W/2+150, H/2+120, 'MENU',    0xff2d78, () => { this.scene.start('ModeSelect'); });
    }

    _makeWinBtn(x, y, label, color, cb) {
        const gfx = this.add.graphics().setDepth(52);
        gfx.lineStyle(2,color,1); gfx.strokeRect(x-110,y-28,220,56);
        gfx.fillStyle(color,0.12); gfx.fillRect(x-110,y-28,220,56);
        this.add.text(x, y, label, {
            fontFamily:'"Courier New", Courier, monospace', fontSize:'22px', fontStyle:'bold', color:'#ffffff'
        }).setOrigin(0.5).setDepth(53);
        const zone = this.add.zone(x, y, 220, 56).setInteractive({ useHandCursor: true }).setDepth(53);
        zone.on('pointerover', () => {
            gfx.clear(); gfx.lineStyle(2,color,1); gfx.strokeRect(x-110,y-28,220,56);
            gfx.fillStyle(color,0.35); gfx.fillRect(x-110,y-28,220,56);
        });
        zone.on('pointerdown', cb);
    }

    // ════════════════════════════════════════════════════════
    //  PAUSE MENU
    // ════════════════════════════════════════════════════════

    _buildPauseMenu(W, H) {
        this._pauseGroup = this.add.container(W/2, H/2).setDepth(80).setVisible(false);
        const overlay   = this.add.rectangle(0, 0, W, H, 0x000000, 0.8);
        const title     = this.add.text(0, -90, 'PAUSED', {
            fontFamily:'"Courier New", Courier, monospace', fontSize:'60px', fontStyle:'bold', color:'#00f5ff',
            stroke:'#ff2d78', strokeThickness:2,
        }).setOrigin(0.5);

        const resumeTxt = this.add.text(0, 20, '▶  RESUME', {
            fontFamily:'"Courier New", Courier, monospace', fontSize:'24px', color:'#00f5ff'
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        const menuTxt = this.add.text(0, 72, '⬅  MAIN MENU', {
            fontFamily:'"Courier New", Courier, monospace', fontSize:'24px', color:'#ff2d78'
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

    // ════════════════════════════════════════════════════════
    //  HELPERS
    // ════════════════════════════════════════════════════════

    _flash(color, duration = 80) {
        const f = this.add.rectangle(this._W/2, this._H/2, this._W, this._H, color, 0.15).setDepth(60);
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
