// src/game/scenes/Settings.js
import { Scene } from 'phaser';

export class SettingsScene extends Scene {
    constructor() {
        super('Settings');
        this._musicOn = true;
        this._sfxOn   = true;
    }

    create() {
        const { width: W, height: H } = this.scale;

        this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.88).setDepth(0);

        // Panel
        const PW = 860, PH = 700;
        const px = (W - PW) / 2, py = (H - PH) / 2;
        const panel = this.add.graphics().setDepth(1);
        panel.fillStyle(0x05000f, 0.97);
        panel.fillRect(px, py, PW, PH);
        panel.lineStyle(2, 0xff2d78, 0.9);
        panel.strokeRect(px, py, PW, PH);
        // Left accent bar
        panel.fillStyle(0xff2d78, 0.9);
        panel.fillRect(px, py, 5, PH);
        // Right accent bar
        panel.fillStyle(0x00f5ff, 0.6);
        panel.fillRect(px + PW - 5, py, 5, PH);

        // Title
        this.add.text(W / 2, py + 36, '⚙  SETTINGS', {
            fontFamily: '"Courier New", Courier, monospace',
            fontSize: '32px', fontStyle: 'bold', color: '#ff2d78',
            stroke: '#9d00ff', strokeThickness: 2,
        }).setOrigin(0.5).setDepth(2);

        // Divider
        const div = this.add.graphics().setDepth(2);
        div.lineStyle(1, 0xff2d78, 0.5);
        div.strokeLineShape(new Phaser.Geom.Line(px + 30, py + 66, px + PW - 30, py + 66));
        div.lineStyle(1, 0x00f5ff, 0.2);
        div.strokeLineShape(new Phaser.Geom.Line(px + 30, py + 70, px + PW - 30, py + 70));

        this._buildKeyTable(W, H, px, py, PW, PH);
        // this._buildToggle(W, py + PH - 130, 'MUSIC', this._musicOn, v => { this._musicOn = v; });
        // this._buildToggle(W, py + PH - 80,  'SFX',   this._sfxOn,  v => { this._sfxOn   = v; });
        this._buildCloseButton(W, py + PH - 30);
    }

    // ─────────────────────────────────────────────────────────
    //  KEY TABLE
    // ─────────────────────────────────────────────────────────
    _buildKeyTable(W, H, px, py, PW, PH) {
        const startY   = py + 90;
        const rowH     = 32;
        // Three columns: action | P1 key | P2 key
        const colAction = px + 60;
        const colP1     = px + PW * 0.46;
        const colP2     = px + PW * 0.73;

        // Column headers
        const headerStyle = {
            fontFamily: '"Courier New", Courier, monospace',
            fontSize: '13px', fontStyle: 'bold', color: '#ff2d78', letterSpacing: 2,
        };
        this.add.text(colAction, startY, 'ACTION',   headerStyle).setOrigin(0, 0.5).setDepth(3);
        this.add.text(colP1,     startY, 'PLAYER 1', headerStyle).setOrigin(0.5, 0.5).setDepth(3);
        this.add.text(colP2,     startY, 'PLAYER 2', headerStyle).setOrigin(0.5, 0.5).setDepth(3);

        // Header underline
        const hul = this.add.graphics().setDepth(3);
        hul.lineStyle(1, 0xff2d78, 0.3);
        hul.strokeLineShape(new Phaser.Geom.Line(px + 40, startY + 14, px + PW - 40, startY + 14));

        // Section dividers & rows
        const sections = [
            {
                label: 'MOVEMENT',
                rows: [
                    ['Move Up',         'W',         '↑'],
                    ['Move Down',       'S',         '↓'],
                    ['Move Left',       'A',         '←'],
                    ['Move Right',      'D',         '→'],
                ],
            },
            {
                label: 'ROTATION',
                rows: [
                    ['Rotate Clockwise',     'E',   '.'],
                    ['Rotate Counter-CW',    'Q',   ','],
                ],
            },
            {
                label: 'ABILITIES',
                rows: [
                    ['Dash / Use Power-Up', 'SHIFT',  '/'],
                    ['Quake (built-in)', 'F', 'L'],
                    ['Goalie Up',  'T',  'I'],
                    ['Goalie Down','G',  'K'],
                ],
            },
            {
                label: 'GENERAL',
                rows: [
                    ['Pause / Resume', 'ESC', 'ESC'],
                    ['Menu',           '—',   '—'],
                ],
            },
        ];

        let y = startY + 28;
        sections.forEach(section => {
            // Section label
            this.add.text(colAction, y, section.label, {
                fontFamily: '"Courier New", Courier, monospace',
                fontSize: '11px', fontStyle: 'bold', color: '#00f5ff', letterSpacing: 3,
            }).setOrigin(0, 0.5).setDepth(3);
            y += rowH - 6;

            section.rows.forEach(([action, p1, p2]) => {
                // Action label
                this.add.text(colAction + 10, y, action, {
                    fontFamily: '"Courier New", Courier, monospace',
                    fontSize: '13px', color: '#ccbbdd',
                }).setOrigin(0, 0.5).setDepth(3);

                // Key badges
                this._makeKeyBadge(colP1, y, p1, 0x00f5ff);
                this._makeKeyBadge(colP2, y, p2, 0xff2d78);

                y += rowH;
            });

            y += 4; // extra gap between sections
        });
    }

    _makeKeyBadge(x, y, label, color = 0x00f5ff) {
        const hex  = '#' + color.toString(16).padStart(6, '0');
        const bw   = Math.max(44, label.length * 10 + 20);
        const bh   = 24;
        const gfx  = this.add.graphics().setDepth(3);
        gfx.lineStyle(1, color, 0.85);
        gfx.strokeRoundedRect(x - bw / 2, y - bh / 2, bw, bh, 4);
        gfx.fillStyle(color, 0.1);
        gfx.fillRoundedRect(x - bw / 2, y - bh / 2, bw, bh, 4);
        // Left accent pip
        gfx.fillStyle(color, 0.8);
        gfx.fillRoundedRect(x - bw / 2, y - bh / 2, 3, bh, { tl: 4, bl: 4, tr: 0, br: 0 });

        this.add.text(x + 1, y, label, {
            fontFamily: '"Courier New", Courier, monospace',
            fontSize:   '13px', fontStyle: 'bold', color: hex,
        }).setOrigin(0.5).setDepth(4);
    }

    // ─────────────────────────────────────────────────────────
    //  TOGGLES
    // ─────────────────────────────────────────────────────────
    _buildToggle(W, y, label, initial, onChange) {
        const lx = W / 2 - 160;
        this.add.text(lx, y, label, {
            fontFamily: '"Courier New", Courier, monospace',
            fontSize: '14px', color: '#ccbbdd',
        }).setOrigin(0, 0.5).setDepth(3);

        let state = initial;
        const tw = 52, th = 24, tx = W / 2 + 60;
        const gfx  = this.add.graphics().setDepth(3);
        const knob = this.add.graphics().setDepth(4);
        const stTxt = this.add.text(tx + tw + 16, y, '', {
            fontFamily: '"Courier New", Courier, monospace',
            fontSize: '12px', color: '#00f5ff',
        }).setOrigin(0, 0.5).setDepth(4);

        const draw = () => {
            gfx.clear(); knob.clear();
            const col = state ? 0x00f5ff : 0x442255;
            gfx.lineStyle(1, col, 0.9);
            gfx.strokeRoundedRect(tx - tw / 2, y - th / 2, tw, th, th / 2);
            gfx.fillStyle(col, 0.15);
            gfx.fillRoundedRect(tx - tw / 2, y - th / 2, tw, th, th / 2);
            const kx = state ? tx + tw / 2 - th / 2 : tx - tw / 2 + th / 2;
            knob.fillStyle(col, 1);
            knob.fillCircle(kx, y, th / 2 - 3);
            stTxt.setText(state ? 'ON' : 'OFF').setColor(state ? '#00f5ff' : '#442255');
        };
        draw();

        this.add.zone(tx, y, tw + 80, th + 10)
            .setInteractive({ useHandCursor: true }).setDepth(5)
            .on('pointerdown', () => { state = !state; onChange(state); draw(); });
    }

    // ─────────────────────────────────────────────────────────
    //  CLOSE BUTTON
    // ─────────────────────────────────────────────────────────
    _buildCloseButton(W, by) {
        const bx  = W / 2;
        const gfx = this.add.graphics().setDepth(3);

        const drawBtn = (hover) => {
            gfx.clear();
            gfx.lineStyle(2, 0xff2d78, hover ? 1 : 0.8);
            gfx.strokeRoundedRect(bx - 110, by - 22, 220, 44, 6);
            gfx.fillStyle(0xff2d78, hover ? 0.3 : 0.08);
            gfx.fillRoundedRect(bx - 110, by - 22, 220, 44, 6);
        };
        drawBtn(false);

        this.add.text(bx, by, '✕  CLOSE', {
            fontFamily: '"Courier New", Courier, monospace',
            fontSize: '18px', fontStyle: 'bold', color: '#ffffff',
            shadow: { offsetX: 0, offsetY: 0, color: '#ff2d78', blur: 6, fill: true },
        }).setOrigin(0.5).setDepth(4);

        const zone = this.add.zone(bx, by, 220, 44)
            .setInteractive({ useHandCursor: true }).setDepth(5);
        zone.on('pointerover',  () => drawBtn(true));
        zone.on('pointerout',   () => drawBtn(false));
        zone.on('pointerdown',  () => { this.scene.resume('MainMenu'); this.scene.stop(); });

        this.input.keyboard.on('keydown-ESC', () => {
            this.scene.resume('MainMenu');
            this.scene.stop();
        });
    }
}