// src/game/scenes/ModeSelect.js
// Music continues from MainMenu — no audio start/stop here.
// Only stops music when launching the game (battle OST takes over).
import { Scene } from 'phaser';

export class ModeSelectScene extends Scene {
  constructor() {
    super('ModeSelect');
  }

  preload() {
    // clickSFX should already be cached; load as fallback only
    if (!this.cache.audio.exists('clickSFX')) {
      this.load.setPath('assets');
      this.load.audio('clickSFX', 'Click_Button.wav');
    }
  }

  create() {
    const { width: W, height: H } = this.scale;
    // Title OST continues playing from MainMenu — no action needed.
    // Visualizer keeps animating implicitly since music is still running.

    this._buildBackground(W, H);
    this._buildHeader(W, H);
    this._buildModeCards(W, H);
    this._buildBackButton(W, H);
    this._animateIn();
  }

  update(time) {
    if (this._grid) this._grid.tilePositionY = time * 0.015;
  }

  // ════════════════════════════════════════════════════════════

  _buildBackground(W, H) {
    this.add.rectangle(W / 2, H / 2, W, H, 0x050010);

    if (!this.textures.exists('gridTileMag')) {
      const g = this.make.graphics({ add: false });
      g.lineStyle(1, 0xff2d78, 0.18); g.strokeRect(0, 0, 64, 64);
      g.generateTexture('gridTileMag', 64, 64); g.destroy();
    }
    this._grid = this.add.tileSprite(W / 2, H / 2, W, H, 'gridTileMag').setAlpha(0.45);

    // Radial centre glow
    const glow = this.add.graphics();
    glow.fillStyle(0x1a0040, 1);
    glow.fillCircle(W / 2, H / 2, H * 0.55);
    glow.setAlpha(0.35);

    if (!this.textures.exists('scanlines')) {
      const sl = this.make.graphics({ add: false });
      for (let y = 0; y < H; y += 3) { sl.fillStyle(0x000000, 0.09); sl.fillRect(0, y, W, 1); }
      sl.generateTexture('scanlines', W, H); sl.destroy();
    }
    this.add.image(W / 2, H / 2, 'scanlines').setDepth(100);

    // Horizon line
    const hLine = this.add.graphics().setDepth(2);
    hLine.lineStyle(2, 0xff2d78, 0.5);
    hLine.strokeLineShape(new Phaser.Geom.Line(0, H * 0.82, W, H * 0.82));
  }

  _buildHeader(W, H) {
    // Glow behind header
    const g = this.add.graphics().setDepth(2);
    g.fillStyle(0xff2d78, 0.07);
    g.fillRoundedRect(W * 0.1, H * 0.08, W * 0.8, 72, 8);
    g.lineStyle(1, 0xff2d78, 0.5);
    g.strokeRoundedRect(W * 0.1, H * 0.08, W * 0.8, 72, 8);

    this.add.text(W / 2, H * 0.12, 'SELECT  MODE', {
      fontFamily: '"Courier New", Courier, monospace',
      fontSize: '40px', fontStyle: 'bold',
      color: '#ffffff', stroke: '#ff2d78', strokeThickness: 2,
      shadow: { offsetX: 0, offsetY: 0, color: '#ff2d78', blur: 14, fill: true },
    }).setOrigin(0.5).setDepth(3);

    const div = this.add.graphics().setDepth(3);
    div.lineStyle(1, 0x00f5ff, 0.35);
    div.strokeLineShape(new Phaser.Geom.Line(W * 0.18, H * 0.21, W * 0.82, H * 0.21));
  }

  _buildModeCards(W, H) {
    const modes = [
      { key: '1P',     icon: '👾', title: '1  PLAYER',  sub: 'VS COMPUTER',  color: 0x00f5ff, enabled: false, x: W * 0.22 },
      { key: '2P',     icon: '⚔',  title: '2  PLAYERS', sub: 'LOCAL VERSUS', color: 0xff2d78, enabled: true,  x: W * 0.50 },
      { key: 'ONLINE', icon: '🌐', title: 'ONLINE',     sub: 'COMING SOON',  color: 0x9d00ff, enabled: false, x: W * 0.78 },
    ];
    this._cards = modes.map(m => this._makeCard(m.x, H * 0.53, m));
  }

  _makeCard(x, y, mode) {
    const CW    = 260, CH = 300;
    const color = mode.color;
    const hex   = '#' + color.toString(16).padStart(6, '0');
    const dim   = !mode.enabled;
    const ctr   = this.add.container(x, y).setDepth(3).setAlpha(0);

    const bg = this.add.graphics();
    const drawBg = (hover) => {
      bg.clear();
      bg.fillStyle(0x0a0020, dim ? 0.5 : hover ? 0.95 : 0.8);
      bg.fillRoundedRect(-CW/2, -CH/2, CW, CH, 10);
      bg.lineStyle(2, color, dim ? 0.3 : hover ? 1 : 0.6);
      bg.strokeRoundedRect(-CW/2, -CH/2, CW, CH, 10);
      if (!dim) {
        bg.fillStyle(color, hover ? 0.18 : 0.07);
        bg.fillRoundedRect(-CW/2, -CH/2, CW, CH, 10);
      }
      // Left accent stripe
      bg.fillStyle(color, dim ? 0.2 : 0.85);
      bg.fillRoundedRect(-CW/2, -CH/2, 5, CH, { tl:10, bl:10, tr:0, br:0 });
    };
    drawBg(false);

    const icon  = this.add.text(0, -CH/2 + 55, mode.icon, { fontSize: '44px' }).setOrigin(0.5).setAlpha(dim ? 0.4 : 1);
    const title = this.add.text(0, -10, mode.title, {
      fontFamily: '"Courier New", Courier, monospace',
      fontSize: '24px', fontStyle: 'bold', color: dim ? '#554466' : '#ffffff',
    }).setOrigin(0.5);
    const sub = this.add.text(0, 34, mode.sub, {
      fontFamily: '"Courier New", Courier, monospace',
      fontSize: '13px', color: dim ? '#443355' : hex, letterSpacing: 2,
    }).setOrigin(0.5);
    const sep = this.add.graphics();
    sep.lineStyle(1, color, dim ? 0.12 : 0.35);
    sep.strokeLineShape(new Phaser.Geom.Line(-CW/2+20, 58, CW/2-20, 58));
    const sel = this.add.text(0, CH/2 - 30, mode.enabled ? '[ SELECT ]' : '[ LOCKED ]', {
      fontFamily: '"Courier New", Courier, monospace',
      fontSize: '12px', color: dim ? '#332244' : hex, letterSpacing: 3,
    }).setOrigin(0.5);

    ctr.add([bg, icon, title, sub, sep, sel]);

    if (mode.enabled) {
      const zone = this.add.zone(x, y, CW, CH).setInteractive({ useHandCursor: true }).setDepth(3);
      zone.on('pointerover', () => { drawBg(true);  this.tweens.add({ targets: ctr, scaleX: 1.04, scaleY: 1.04, duration: 100 }); });
      zone.on('pointerout',  () => { drawBg(false); this.tweens.add({ targets: ctr, scaleX: 1,    scaleY: 1,    duration: 100 }); });
      zone.on('pointerdown', () => { this._playClick(); this._launch(mode.key); });
    }

    return ctr;
  }

  _buildBackButton(W, H) {
    const btn = this.add.container(90, H - 44).setDepth(3);
    const gfx = this.add.graphics();
    gfx.lineStyle(1, 0xff2d78, 0.6);
    gfx.strokeRoundedRect(-70, -20, 140, 40, 5);
    const txt = this.add.text(0, 0, '◀  BACK', {
      fontFamily: '"Courier New", Courier, monospace', fontSize: '15px', color: '#ff2d78',
    }).setOrigin(0.5);
    btn.add([gfx, txt]);

    const zone = this.add.zone(90, H - 44, 140, 40).setInteractive({ useHandCursor: true }).setDepth(3);
    zone.on('pointerover', () => { gfx.clear(); gfx.lineStyle(1,0xff2d78,1); gfx.fillStyle(0xff2d78,0.12); gfx.fillRoundedRect(-70,-20,140,40,5); gfx.strokeRoundedRect(-70,-20,140,40,5); });
    zone.on('pointerout',  () => { gfx.clear(); gfx.lineStyle(1,0xff2d78,0.6); gfx.strokeRoundedRect(-70,-20,140,40,5); });
    zone.on('pointerdown', () => {
      this._playClick();
      this.cameras.main.fadeOut(250, 0, 0, 16);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('MainMenu'));
    });

    this.input.keyboard.on('keydown-ESC', () => {
      this._playClick();
      this.scene.start('MainMenu');
    });
  }

  _animateIn() {
    this._cards.forEach((card, i) => {
      this.tweens.add({
        targets: card, alpha: 1, y: card.y,
        duration: 380, delay: 80 + i * 110, ease: 'Back.easeOut',
      });
    });
  }

  _playClick() {
    try { this.sound.play('clickSFX', { volume: 0.6 }); } catch (_) {}
  }

  _launch(key) {
    // NOW stop the title music — battle OST is about to start
    const titleMusic = this.sound.get('titleOST');
    if (titleMusic) titleMusic.stop();

    this.cameras.main.fadeOut(300, 0, 0, 16);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Game', { mode: key }));
  }
}
