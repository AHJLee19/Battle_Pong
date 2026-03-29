// src/game/scenes/MainMenu.js
// ─────────────────────────────────────────────────────────────
//  BATTLE PONG – Title Screen
//  Muse Dash / osu! style visualizer
//
//  Audio analysis baked into visualizer_data.json:
//    BPM          129.2
//    Beat         464ms
//    First beat   580ms offset
//    Bands        24 (log-spaced 50Hz–10kHz, all active)
//    Frame rate   ~93ms per frame (sampled from STFT)
//
//  Music persists across scenes via global this.sound manager.
// ─────────────────────────────────────────────────────────────
import { Scene } from 'phaser';

const BPM           = 132;
const BEAT_MS       = 60000 / BPM;   // ~464ms
const FIRST_BEAT_MS = 580;
const NUM_BARS      = 24;
const BAR_GAP       = 6;             // px gap between bars

// Retrowave palette
const C_PINK   = 0xff2d78;
const C_CYAN   = 0x00f5ff;
const C_PURPLE = 0x9d00ff;
const C_YELLOW = 0xffe600;

// One colour per bar, bass (pink) → treble (yellow-green)
const BAR_COLS = [
    0xff1a6e, 0xff2d78, 0xff3d88, 0xff5599,
    0xcc00ff, 0xaa00ee, 0x8800dd, 0x6600cc,
    0x4444ff, 0x2266ff, 0x0088ff, 0x00aaff,
    0x00bbff, 0x00ccff, 0x00ddff, 0x00eeff,
    0x00f5ff, 0x00f5ff, 0x33ffee, 0x66ffdd,
    0x99ffcc, 0xbbffaa, 0xddff88, 0xffff66,
];

export class TitleScene extends Scene {
    constructor() {
        super('MainMenu');
        this._beatCount    = 0;
        this._vizFrame     = 0;
        this._vizData      = null;
        this._barHeights   = new Array(NUM_BARS).fill(0);
        this._barTargets   = new Array(NUM_BARS).fill(0);
        this._peakY        = new Array(NUM_BARS).fill(0);
        this._frameTimer   = 0;
        this._titleBounce  = 0;
        this._titleSquishX = 1;
        this._titleSquishY = 1;
    }

    // ── preload ──────────────────────────────────────────────
    preload() {
        this.load.setPath('assets');
        // Only load audio if not already in the global sound manager
        if (!this.sound.get('titleOST')) {
            this.load.audio('titleOST', 'Title_Screen_OST.mp3');
        }
        if (!this.cache.audio.exists('clickSFX')) {
            this.load.audio('clickSFX', 'Click_Button.wav');
        }
        this.load.json('vizData', 'visualizer_data.json');
    }

    // ── create ──────────────────────────────────────────────
    create() {
        const { width: W, height: H } = this.scale;
        this._W = W; this._H = H;

        this._vizData = this.cache.json.get('vizData');

        // Compute bar dimensions once — integer widths for pixel-perfect spacing
        const totalW    = W * 0.94;
        this._barW      = Math.floor((totalW - BAR_GAP * (NUM_BARS - 1)) / NUM_BARS);
        this._barStartX = Math.floor((W - (this._barW * NUM_BARS + BAR_GAP * (NUM_BARS - 1))) / 2);
        this._bottomBarY = H - 1;
        this._topBarY    = 1;
        this._maxBarH    = H * 0.30;
        this._maxTopH    = H * 0.095;

        this._buildBackground(W, H);
        this._buildScanlines(W, H);
        this._buildVisualizer(W, H);
        this._buildTitle(W, H);
        this._buildButtons(W, H);

        this._startMusic();
        this._animateIn(W, H);

        // Beat clock — phase-locked to track offset
        this.time.delayedCall(FIRST_BEAT_MS, () => {
            this._onBeat();
            this._beatLoop = this.time.addEvent({
                delay: BEAT_MS, callback: this._onBeat,
                callbackScope: this, loop: true,
            });
        });

        this.input.keyboard.on('keydown-ENTER', () => this._onPlay());
    }

    // ── update ──────────────────────────────────────────────
    update(time, delta) {
        this._updateVisualizerFrame(delta);
        this._updateBars(delta);
        this._updateTitleBounce(time);

        // Scrolling background grid
        if (this._grid) {
            this._grid.tilePositionY = time * 0.02;
            this._grid.tilePositionX = time * 0.005;
        }
    }

    // ════════════════════════════════════════════════════════
    //  BACKGROUND
    // ════════════════════════════════════════════════════════

    _buildBackground(W, H) {
        const gfx = this.add.graphics().setDepth(0);
        gfx.fillGradientStyle(0x0a0020, 0x0a0020, 0x120030, 0x120030, 1);
        gfx.fillRect(0, 0, W, H);

        if (!this.textures.exists('gridTile')) {
            const g = this.make.graphics({ add: false });
            g.lineStyle(1, 0x00ffff, 0.6);
            g.strokeRect(0, 0, 64, 64);
            g.generateTexture('gridTile', 64, 64);
            g.destroy();
        }
        this._grid = this.add.tileSprite(W / 2, H / 2, W, H, 'gridTile')
            .setAlpha(0.5).setDepth(1);
    }

    // ════════════════════════════════════════════════════════
    //  SCANLINES  (single definition — drawn on top of everything)
    // ════════════════════════════════════════════════════════

    _buildScanlines(W, H) {
        if (!this.textures.exists('scanlines')) {
            const sl = this.make.graphics({ add: false });
            for (let y = 0; y < H; y += 3) {
                sl.fillStyle(0x000000, 0.09);
                sl.fillRect(0, y, W, 1);
            }
            sl.generateTexture('scanlines', W, H);
            sl.destroy();
        }
        this.add.image(W / 2, H / 2, 'scanlines').setDepth(200);
    }

    // ════════════════════════════════════════════════════════
    //  VISUALIZER BARS
    // ════════════════════════════════════════════════════════

    _buildVisualizer(W, H) {
        this._vizGfx = this.add.graphics().setDepth(20);
        // _barW / _barStartX / _bottomBarY etc. already set in create()
    }

    _updateVisualizerFrame(delta) {
        if (!this._vizData) return;
        this._frameTimer += delta;
        if (this._frameTimer >= this._vizData.frameIntervalMs) {
            this._frameTimer -= this._vizData.frameIntervalMs;
            this._vizFrame = (this._vizFrame + 1) % this._vizData.frames.length;
            const frame = this._vizData.frames[this._vizFrame];
            for (let i = 0; i < NUM_BARS; i++) {
                this._barTargets[i] = frame[i] ?? 0;
            }
        }
    }

    _updateBars(delta) {
        const dt       = delta / 1000;
        const riseSpd  = 9.0;
        const fallSpd  = 3.0;
        const peakFall = 0.9;

        for (let i = 0; i < NUM_BARS; i++) {
            const target = this._barTargets[i];
            if (this._barHeights[i] < target) {
                this._barHeights[i] = Math.min(this._barHeights[i] + riseSpd * dt, target);
            } else {
                this._barHeights[i] = Math.max(this._barHeights[i] - fallSpd * dt, 0);
            }
            // Peak hold: rises instantly with bar, falls slowly
            const curPx = this._barHeights[i] * this._maxBarH;
            if (curPx >= this._peakY[i]) {
                this._peakY[i] = curPx;
            } else {
                this._peakY[i] = Math.max(this._peakY[i] - peakFall * this._maxBarH * dt, 0);
            }
        }

        this._drawBars();
    }

    _drawBars() {
        const gfx = this._vizGfx;
        gfx.clear();

        for (let i = 0; i < NUM_BARS; i++) {
            // Integer x — pixel-perfect, even spacing
            const x   = this._barStartX + i * (this._barW + BAR_GAP);
            const bh  = Math.max(2, this._barHeights[i] * this._maxBarH);
            const col = BAR_COLS[i];

            // ── Bottom bar (grows upward) ─────────────────────
            // Glow shadow
            gfx.fillStyle(col, 0.22);
            gfx.fillRect(x - 2, this._bottomBarY - bh, this._barW + 4, bh);
            // Main body
            gfx.fillStyle(col, 0.88);
            gfx.fillRect(x, this._bottomBarY - bh, this._barW, bh);
            // Bright top-edge cap
            gfx.fillStyle(0xffffff, 0.85);
            gfx.fillRect(x, this._bottomBarY - bh, this._barW, 2);

            // // Peak-hold line
            // if (this._peakY[i] > 2) {
            //     const py = this._bottomBarY - this._peakY[i];
            //     gfx.fillStyle(col, 1);
            //     gfx.fillRect(x, py - 3, this._barW, 3);
            //     gfx.fillStyle(0xffffff, 0.7);
            //     gfx.fillRect(x, py - 3, this._barW, 1);
            // }

            // ── Top bar (grows downward) ──────────────────────
            const topH = this._barHeights[i] * this._maxTopH;
            if (topH >= 1) {
                gfx.fillStyle(col, 0.18);
                gfx.fillRect(x - 1, this._topBarY, this._barW + 2, topH + 2);
                gfx.fillStyle(col, 0.6);
                gfx.fillRect(x, this._topBarY, this._barW, topH);
                gfx.fillStyle(0xffffff, 0.5);
                gfx.fillRect(x, this._topBarY + topH - 2, this._barW, 2);
            }
        }

        // Floor / ceiling rules aligned to actual bar edges
        const endX = this._barStartX + NUM_BARS * (this._barW + BAR_GAP) - BAR_GAP;
        gfx.lineStyle(1, C_PINK, 0.45);
        gfx.strokeLineShape(new Phaser.Geom.Line(this._barStartX, this._bottomBarY, endX, this._bottomBarY));
        gfx.lineStyle(1, C_PINK, 0.25);
        gfx.strokeLineShape(new Phaser.Geom.Line(this._barStartX, this._topBarY, endX, this._topBarY));
    }

    // ════════════════════════════════════════════════════════
    //  TITLE CARD  (osu!-style, bounces on beat)
    // ════════════════════════════════════════════════════════

    _buildTitle(W, H) {
        const titleY     = H * 0.32;
        this._titleBaseY = titleY;

        // Card background
        this._titleCard = this.add.graphics().setDepth(10);
        this._drawTitleCard(W, titleY, 0, 1);

        // Chromatic aberration glow layers
        this._titleGlows = [];
        [{ ox: -4, col: '#ff2d78', a: 0.5 },
         { ox:  4, col: '#00f5ff', a: 0.5 },
         { ox:  0, col: '#9d00ff', a: 0.35 }]
            .forEach(({ ox, col, a }) => {
                const g = this.add.text(W / 2 + ox, titleY, 'BATTLE PONG', {
                    fontFamily: '"Courier New", Courier, monospace',
                    fontSize: '84px', fontStyle: 'bold', color: col,
                }).setOrigin(0.5).setAlpha(a).setDepth(11);
                this._titleGlows.push(g);
            });

        // Main title
        this._titleText = this.add.text(W / 2, titleY, 'BATTLE PONG', {
            fontFamily: '"Courier New", Courier, monospace',
            fontSize: '84px', fontStyle: 'bold', color: '#ffffff',
            stroke: '#ff2d78', strokeThickness: 4,
            shadow: { offsetX: 0, offsetY: 3, color: '#9d00ff', blur: 16, fill: true },
        }).setOrigin(0.5).setDepth(12);

        // Separator lines
        const sep = this.add.graphics().setDepth(12);
        sep.lineStyle(1, C_PINK, 0.7);
        sep.strokeLineShape(new Phaser.Geom.Line(W * 0.08, titleY + 76, W * 0.92, titleY + 76));
        sep.lineStyle(1, C_CYAN, 0.25);
        sep.strokeLineShape(new Phaser.Geom.Line(W * 0.12, titleY + 80, W * 0.88, titleY + 80));
    }

    _drawTitleCard(W, cy, bounceOff, alpha) {
        const gfx   = this._titleCard;
        const cardW = W * 0.88;
        const cardH = 110;
        const x     = (W - cardW) / 2;
        const y     = cy - cardH / 2 + bounceOff;

        gfx.clear();
        gfx.fillStyle(0x0a0020, alpha * 0.85);
        gfx.fillRoundedRect(x, y, cardW, cardH, 8);
        gfx.lineStyle(2, C_PINK, alpha * 0.9);
        gfx.strokeRoundedRect(x, y, cardW, cardH, 8);
        // Left accent stripe
        gfx.fillStyle(C_PINK, alpha * 0.9);
        gfx.fillRoundedRect(x, y, 5, cardH, { tl: 8, bl: 8, tr: 0, br: 0 });
        // Right accent stripe
        gfx.fillStyle(C_CYAN, alpha * 0.6);
        gfx.fillRoundedRect(x + cardW - 5, y, 5, cardH, { tl: 0, bl: 0, tr: 8, br: 8 });
        // Inner tint
        gfx.fillStyle(C_PURPLE, 0.06 * alpha);
        gfx.fillRoundedRect(x + 5, y, cardW - 10, cardH, 6);
    }

    _updateTitleBounce(_time) {
        if (!this._titleText) return;

        this._titleBounce  *= 0.85;
        this._titleSquishX += (1 - this._titleSquishX) * 0.18;
        this._titleSquishY += (1 - this._titleSquishY) * 0.18;

        const newY = this._titleBaseY + this._titleBounce;
        this._drawTitleCard(this._W, this._titleBaseY, this._titleBounce, 1);
        this._titleText.setY(newY).setScale(this._titleSquishX, this._titleSquishY);
        this._subTitle?.setY(newY + 58);
        this._titleGlows.forEach(g => g.setY(newY));
    }

    // ════════════════════════════════════════════════════════
    //  BUTTONS
    // ════════════════════════════════════════════════════════

    _buildButtons(W, H) {
        this._btnGfxList = [];
        const btnY = H * 0.51;

        const [bg1] = this._makeButton(W / 2, btnY,      '▶  PLAY',     C_PINK,   () => this._onPlay());
        const [bg2] = this._makeButton(W / 2, btnY + 72, '⚙  SETTINGS', C_PURPLE, () => this._onSettings());
        this._btnGfxList.push(bg1, bg2);

        this._hint = this.add.text(W / 2, H * 0.45, 'PRESS  ENTER  TO  START', {
            fontFamily: '"Courier New", Courier, monospace',
            fontSize: '13px', color: '#ff2d78', letterSpacing: 5,
        }).setOrigin(0.5).setDepth(15);

        this.time.delayedCall(FIRST_BEAT_MS, () => {
            this.time.addEvent({
                delay: BEAT_MS * 2,
                callback: () => {
                    this.tweens.add({
                        targets: this._hint,
                        alpha: { from: 1, to: 0.1 },
                        duration: BEAT_MS * 2, ease: 'Sine.easeInOut', yoyo: true,
                    });
                },
                loop: true,
            });
        });
    }

    _makeButton(x, y, label, color, callback) {
        const hex = '#' + color.toString(16).padStart(6, '0');
        const BW  = 300, BH = 48;

        const bg = this.add.graphics().setDepth(14);
        const drawBg = (hover) => {
            bg.clear();
            bg.fillStyle(0x0a0020, hover ? 0.95 : 0.8);
            bg.fillRoundedRect(x - BW/2, y - BH/2, BW, BH, 6);
            bg.lineStyle(2, color, hover ? 1 : 0.7);
            bg.strokeRoundedRect(x - BW/2, y - BH/2, BW, BH, 6);
            bg.fillStyle(color, hover ? 0.35 : 0.1);
            bg.fillRoundedRect(x - BW/2, y - BH/2, BW, BH, 6);
            bg.fillStyle(color, 0.9);
            bg.fillRoundedRect(x - BW/2, y - BH/2, 4, BH, { tl:6, bl:6, tr:0, br:0 });
        };
        drawBg(false);

        const txt = this.add.text(x + 4, y, label, {
            fontFamily: '"Courier New", Courier, monospace',
            fontSize: '18px', fontStyle: 'bold', color: '#ffffff',
            shadow: { offsetX: 0, offsetY: 0, color: hex, blur: 6, fill: true },
        }).setOrigin(0.5).setDepth(15);

        const zone = this.add.zone(x, y, BW, BH).setInteractive({ useHandCursor: true }).setDepth(15);
        zone.on('pointerover',  () => { drawBg(true);  txt.setColor(hex); this.tweens.add({ targets: txt, x: x + 8, duration: 80 }); });
        zone.on('pointerout',   () => { drawBg(false); txt.setColor('#ffffff'); this.tweens.add({ targets: txt, x: x + 4, duration: 80 }); });
        zone.on('pointerdown',  () => { this._playClick(); callback(); });

        return [bg, txt];
    }

    // ════════════════════════════════════════════════════════
    //  BEAT ENGINE
    // ════════════════════════════════════════════════════════

    _onBeat() {
        this._beatCount++;
        const b      = this._beatCount;
        const isBar  = b % 4 === 0;
        const isHalf = b % 2 === 0;

        // 1. Title card bounce + squish
        this._titleBounce  = isBar ? 14 : isHalf ? 7 : 3;
        this._titleSquishX = isBar ? 1.06 : isHalf ? 1.03 : 1.015;
        this._titleSquishY = isBar ? 0.94 : isHalf ? 0.97 : 0.985;

        // 2. Chromatic aberration burst on bar downbeat
        if (isBar && this._titleGlows) {
            this._titleGlows.forEach((g, i) => {
                const ox = [- 8, 8, 0][i];
                this.tweens.add({
                    targets: g,
                    x: this._W / 2 + ox,
                    alpha: { from: 0.7, to: 0.3 },
                    duration: BEAT_MS * 0.6,
                    ease: 'Expo.easeOut',
                });
            });
        }

        // 3. Subtitle colour cycle on half-beat
        if (isHalf && this._subTitle) {
            const cols = ['#ff2d78','#00f5ff','#9d00ff','#ffe600','#ff00cc'];
            this._subTitle.setColor(cols[(b / 2) % cols.length]);
        }

        // 4. Grid speed burst on bar (tileSprite scroll, no separate _gridSpeed)
        if (isBar && this._grid) {
            const baseAlpha = 0.5;
            this.tweens.add({
                targets: this._grid,
                alpha: { from: 0.85, to: baseAlpha },
                duration: BEAT_MS * 0.5,
                ease: 'Expo.easeOut',
            });
        }
        
        // 6. Button pulse on half-beat
        if (isHalf && this._btnGfxList) {
            this._btnGfxList.forEach((bg, i) => {
                this.time.delayedCall(i * 50, () => {
                    this.tweens.add({
                        targets: bg,
                        alpha: { from: 1, to: 0.45 },
                        duration: BEAT_MS * 0.4, ease: 'Expo.easeOut',
                    });
                });
            });
        }

        // 7. Hint text colour cycle every beat
        if (this._hint) {
            this._hint.setTint([C_PINK, C_CYAN, C_PURPLE, C_YELLOW][b % 4]);
        }
    }

    // ════════════════════════════════════════════════════════
    //  AUDIO  (global sound manager — music persists across scenes)
    // ════════════════════════════════════════════════════════

    _startMusic() {
        // Re-use existing instance if already playing (e.g. returning from ModeSelect)
        let music = this.sound.get('titleOST');
        if (music) {
            if (!music.isPlaying) music.play();
            this._music = music;
            return;
        }
        try {
            this._music = this.sound.add('titleOST', { loop: true, volume: 0.45 });
            this._music.play();
        } catch (_) {}
    }

    _playClick() {
        try { this.sound.play('clickSFX', { volume: 0.6 }); } catch (_) {}
    }

    // ════════════════════════════════════════════════════════
    //  ENTRANCE ANIMATION
    // ════════════════════════════════════════════════════════

    _animateIn(W, H) {
        this._titleText.setAlpha(0).setY(this._titleBaseY - 50);
        this._titleCard.setAlpha(0);
        this.tweens.add({
            targets: [this._titleText, ...this._titleGlows],
            y: this._titleBaseY, alpha: 1,
            duration: 800, ease: 'Back.easeOut', delay: 300,
        });
        this.tweens.add({
            targets: this._titleCard, alpha: 1,
            duration: 600, delay: 200,
        });
    }

    // ════════════════════════════════════════════════════════
    //  TRANSITIONS
    // ════════════════════════════════════════════════════════

    _onPlay() {
        if (this._beatLoop) this._beatLoop.remove();
        // Do NOT stop music — it persists into ModeSelect
        this.time.delayedCall(200, () => {
            this.cameras.main.fadeOut(250, 0, 0, 16);
            this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('ModeSelect'));
        });
    }

    _onSettings() {
        this.scene.launch('Settings');
    }
}