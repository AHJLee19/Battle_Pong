// src/game/objects/PowerUp.js
// Only QUAKE powerups spawn. Collected by touching — stored on paddle.

const TYPES = {
  QUAKE: { color: 0xff6600, label: 'QUAKE', key: 'quake' },
};
const POWERUP_RADIUS = 20;
const PICKUP_DIST = 48;
const LIFETIME_MS = 9000;

export class PowerUp {
  constructor(scene, x, y, type = 'QUAKE') {
    this.scene = scene;
    this.type = type;
    this.def = TYPES[type] ?? TYPES.QUAKE;
    this.collected = false;
    this._age = 0;
    this._buildSprite(x, y);
  }

  update(delta, p1Paddle, p2Paddle) {
    if (this.collected) return;
    this._age += delta;
    this._sprite.angle += 0.4;

    if (this._age > LIFETIME_MS - 2000)
      this._sprite.setAlpha(Math.sin(this._age * 0.015) * 0.5 + 0.5);

    if (this._age >= LIFETIME_MS) { this._despawn(); return; }

    this._checkPickup(p1Paddle);
    this._checkPickup(p2Paddle);
  }

  get alive() { return !this.collected; }

  destroy() {
    this._sprite?.destroy();
    this._ring?.destroy();
    this._labelTxt?.destroy();
  }

  _checkPickup(paddle) {
    if (!paddle) return;
    const dist = Phaser.Math.Distance.Between(
      paddle.x, paddle.y, this._sprite.x, this._sprite.y
    );
    if (dist < PICKUP_DIST) this._collect(paddle);
  }

  _collect(paddle) {
    this.collected = true;
    this._showBurst();
    paddle.storePowerUp(this.type);
    this._sprite.setVisible(false);
    this._ring?.setVisible(false);
    this._labelTxt?.setVisible(false);
  }

  _buildSprite(x, y) {
    const color  = this.def.color;
    const texKey = 'powerup_quake';

    if (!this.scene.textures.exists(texKey)) {
      const R = POWERUP_RADIUS, dim = (R + 6) * 2;
      const gfx = this.scene.make.graphics({ add: false });
      gfx.fillStyle(color, 0.2);  gfx.fillCircle(R + 6, R + 6, R + 6);
      const pts = Array.from({ length: 6 }, (_, i) => ({
        x: (R + 6) + Math.cos((i / 6) * Math.PI * 2 - Math.PI / 6) * R,
        y: (R + 6) + Math.sin((i / 6) * Math.PI * 2 - Math.PI / 6) * R,
      }));
      gfx.fillStyle(color, 0.25); gfx.fillPoints(pts, true);
      gfx.lineStyle(2, color, 1); gfx.strokePoints(pts, true);
      gfx.fillStyle(0xffffff, 0.85); gfx.fillCircle(R + 6, R + 6, 7);
      gfx.generateTexture(texKey, dim, dim);
      gfx.destroy();
    }

    this._sprite = this.scene.add.image(x, y, texKey).setDepth(20).setScale(0).setAlpha(0);
    this.scene.tweens.add({ targets: this._sprite, scale: 1, alpha: 1, duration: 350, ease: 'Back.easeOut' });
    this.scene.tweens.add({ targets: this._sprite, y: y - 8, duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // const ringGfx = this.scene.add.graphics().setDepth(19);
    // ringGfx.lineStyle(1, color, 0.4);
    // ringGfx.strokeCircle(x, y, POWERUP_RADIUS + 10);
    // this._ring = ringGfx;
    // this.scene.tweens.add({ targets: this._ring, angle: 360, duration: 3000, repeat: -1 });

    const hex = '#' + color.toString(16).padStart(6, '0');
    this._labelTxt = this.scene.add.text(x, y + POWERUP_RADIUS + 16, 'QUAKE', {
      fontFamily: '"Courier New", Courier, monospace', fontSize: '11px', color: hex, letterSpacing: 2,
    }).setOrigin(0.5).setDepth(21);
  }

  _showBurst() {
    const color = this.def.color, x = this._sprite.x, y = this._sprite.y;
    const burst = this.scene.add.graphics().setDepth(30);
    this.scene.tweens.addCounter({
      from: POWERUP_RADIUS, to: POWERUP_RADIUS * 3.5, duration: 280,
      onUpdate: t => {
        burst.clear();
        burst.lineStyle(3, color, 1 - t.getValue() / (POWERUP_RADIUS * 3.5));
        burst.strokeCircle(x, y, t.getValue());
      },
      onComplete: () => burst.destroy(),
    });
  }

  _despawn() {
    this.collected = true;
    const targets = [this._sprite, this._ring, this._labelTxt].filter(Boolean);
    this.scene.tweens.add({
      targets,
      alpha: 0, scale: 0, duration: 300,
      onComplete: () => this.destroy(),
    });
  }
}
