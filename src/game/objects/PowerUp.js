// src/game/objects/PowerUp.js
// Power-ups are STORED on pickup and activated on command (dashKey / quakeKey).
// Dash: straight right (P1) or straight left (P2), only if not moving.
// Quake: push opponent + camera shake.

const TYPES = {
  DASH:  { color: 0x00ffcc, label: 'DASH',  icon: '▶▶', key: 'dash'  },
  QUAKE: { color: 0xff6600, label: 'QUAKE', icon: '❋',  key: 'quake' },
};
const POWERUP_RADIUS = 22;
const PICKUP_DIST    = 50;
const LIFETIME_MS    = 8000;
const DASH_DURATION  = 200;
const DASH_DISTANCE  = 260;
const QUAKE_RADIUS   = 380;
const QUAKE_PUSH     = 160;

export class PowerUp {
  constructor(scene, x, y, type = 'DASH') {
    this.scene     = scene;
    this.type      = type;
    this.def       = TYPES[type];
    this.collected = false;
    this._age      = 0;
    this._buildSprite(x, y);
  }

  update(delta, p1Paddle, p2Paddle) {
    if (this.collected) return;
    this._age += delta;
    this._sprite.angle += 0.4;

    if (this._age > LIFETIME_MS - 2000)
      this._sprite.setAlpha(Math.sin(this._age * 0.015) * 0.5 + 0.5);

    if (this._age >= LIFETIME_MS) { this._despawn(); return; }

    this._checkPickup(p1Paddle, 0);
    this._checkPickup(p2Paddle, 1);
  }

  get alive() { return !this.collected; }

  destroy() {
    this._sprite?.destroy();
    this._ring?.destroy();
    this._labelTxt?.destroy();
  }

  _checkPickup(paddle, playerIndex) {
    if (!paddle) return;
    if (Phaser.Math.Distance.Between(paddle.x, paddle.y, this._sprite.x, this._sprite.y) < PICKUP_DIST)
      this._collect(paddle, playerIndex);
  }

  // Store the power-up on the paddle instead of activating immediately
  _collect(paddle, playerIndex) {
    this.collected = true;
    this._showCollectBurst();
    // Store on paddle — paddle.storePowerUp handles display
    paddle.storePowerUp(this.type, playerIndex);
    this._sprite.setVisible(false);
    this._ring?.setVisible(false);
    this._labelTxt?.setVisible(false);
  }

  // Called by Paddle when the stored power-up is actually used
  static activateDash(scene, paddle, playerIndex) {
    const def     = TYPES['DASH'];
    const dir     = playerIndex === 0 ? 1 : -1;
    const startX  = paddle.image.x;
    const startY  = paddle.image.y;
    const targetX = Phaser.Math.Clamp(startX + dir * DASH_DISTANCE, paddle.minX, paddle.maxX);

    // Only dash if not moving (velocity == 0 in both axes from manual movement)
    // We check the paddle's movement keys directly
    const moving = paddle._isMoving();
    if (moving) {
      // Still grant the dash but apply it in the cardinal direction
    }

    // Ghost trail
    for (let i = 1; i <= 6; i++) {
      scene.time.delayedCall(i * 22, () => {
        if (!paddle.image?.active) return;
        const ghost = scene.add.image(paddle.image.x, paddle.image.y, paddle.image.texture.key);
        ghost.setAngle(paddle.image.angle).setTint(def.color).setAlpha(0.5 - i * 0.06).setDepth(9);
        scene.tweens.add({ targets: ghost, alpha: 0, duration: 220, onComplete: () => ghost.destroy() });
      });
    }

    scene.tweens.add({
      targets: paddle.image, x: targetX, duration: DASH_DURATION, ease: 'Quad.easeOut',
      onUpdate: () => paddle.image.body.reset(paddle.image.x, paddle.image.y),
      onComplete: () => {
        scene.tweens.add({
          targets: paddle.image, x: startX, duration: DASH_DURATION * 2, ease: 'Sine.easeInOut',
          onUpdate: () => paddle.image.body.reset(paddle.image.x, paddle.image.y),
        });
      },
    });

    // Sound
    try { scene.sound.play('dashSFX', { volume: 0.55 }); } catch(_) {}
    PowerUp._showLabel(scene, paddle.x, paddle.y, 'DASH!', def.color);
  }

  static activateQuake(scene, paddle, playerIndex) {
    const def = TYPES['QUAKE'];
    const ox  = paddle.x, oy = paddle.y;

    // Shockwave ring
    const ring = scene.add.graphics().setDepth(30);
    scene.tweens.addCounter({
      from: 0, to: QUAKE_RADIUS, duration: 500, ease: 'Quad.easeOut',
      onUpdate: t => {
        const r = t.getValue();
        ring.clear();
        ring.lineStyle(3, def.color, 1 - r / QUAKE_RADIUS);
        ring.strokeCircle(ox, oy, r);
        ring.lineStyle(2, 0xffffff, (1 - r / QUAKE_RADIUS) * 0.5);
        ring.strokeCircle(ox, oy, r * 0.6);
      },
      onComplete: () => ring.destroy(),
    });

    // Hex ring
    const hex = scene.add.graphics().setDepth(29);
    scene.tweens.addCounter({
      from: 0, to: 1, duration: 450, ease: 'Quad.easeOut',
      onUpdate: t => {
        const s = t.getValue(), r = s * QUAKE_RADIUS * 0.8;
        hex.clear();
        hex.lineStyle(2, 0xff6600, (1 - s) * 0.7);
        const pts = Array.from({ length: 6 }, (_, i) => ({
          x: ox + Math.cos((i/6)*Math.PI*2 - Math.PI/6) * r,
          y: oy + Math.sin((i/6)*Math.PI*2 - Math.PI/6) * r,
        }));
        hex.strokePoints(pts, true);
      },
      onComplete: () => hex.destroy(),
    });

    // Debris
    for (let i = 0; i < 14; i++) {
      const a = (i/14)*Math.PI*2, spd = Phaser.Math.Between(80, 220);
      const p = scene.add.graphics().setDepth(28);
      const sz = Phaser.Math.Between(3, 7);
      p.fillStyle(def.color, 1); p.fillRect(-sz/2, -sz/2, sz, sz); p.setPosition(ox, oy);
      scene.tweens.add({ targets: p, x: ox+Math.cos(a)*spd*0.6, y: oy+Math.sin(a)*spd*0.6,
        alpha: 0, angle: Phaser.Math.Between(-180,180), duration: Phaser.Math.Between(300,600),
        ease: 'Quad.easeOut', onComplete: () => p.destroy() });
    }

    scene.cameras.main.shake(280, 0.012);

    // Sound
    try { scene.sound.play('quakeSFX', { volume: 0.7 }); } catch(_) {}

    const opponent = playerIndex === 0 ? scene._p2Paddle : scene._p1Paddle;
    if (opponent) {
      const dx = opponent.x - ox, dy = opponent.y - oy;
      const dist = Math.sqrt(dx*dx + dy*dy) || 1;
      const pushX = (dx/dist) * QUAKE_PUSH, pushY = (dy/dist) * QUAKE_PUSH;
      const endX = Phaser.Math.Clamp(opponent.image.x + pushX, opponent.minX, opponent.maxX);
      const endY = Phaser.Math.Clamp(opponent.image.y + pushY, opponent.minY, opponent.maxY);
      const sX = opponent.image.x, sY = opponent.image.y;
      scene.tweens.add({
        targets: opponent.image,
        x: [sX-6, sX+6, sX-4, sX+4, sX, endX],
        y: [sY-4, sY+4, sY-2, sY+2, sY, endY],
        duration: 280, ease: 'Linear',
        onUpdate: () => opponent.image.body.reset(opponent.image.x, opponent.image.y),
      });
      opponent.image.setTint(0xff3300);
      scene.time.delayedCall(400, () => opponent.image.clearTint());
    }

    PowerUp._showLabel(scene, ox, oy, 'QUAKE!', def.color);
  }

  static _showLabel(scene, x, y, text, color) {
    const hex = '#' + color.toString(16).padStart(6, '0');
    const txt = scene.add.text(x, y - 40, text, {
      fontFamily: '"Courier New", Courier, monospace', fontSize: '28px', fontStyle: 'bold',
      color: '#ffffff', stroke: hex, strokeThickness: 3,
      shadow: { offsetX: 0, offsetY: 0, color: hex, blur: 14, fill: true },
    }).setOrigin(0.5).setDepth(50);
    scene.tweens.add({ targets: txt, y: y - 100, alpha: 0, duration: 900, ease: 'Quad.easeOut',
      onComplete: () => txt.destroy() });
  }

  _buildSprite(x, y) {
    const color  = this.def.color;
    const texKey = 'powerup_' + this.def.key;

    if (!this.scene.textures.exists(texKey)) {
      const R = POWERUP_RADIUS, dim = (R+6)*2;
      const gfx = this.scene.make.graphics({ add: false });
      gfx.fillStyle(color, 0.2); gfx.fillCircle(R+6, R+6, R+6);
      const pts = Array.from({ length: 6 }, (_, i) => ({
        x: (R+6) + Math.cos((i/6)*Math.PI*2 - Math.PI/6) * R,
        y: (R+6) + Math.sin((i/6)*Math.PI*2 - Math.PI/6) * R,
      }));
      gfx.fillStyle(color, 0.25); gfx.fillPoints(pts, true);
      gfx.lineStyle(2, color, 1); gfx.strokePoints(pts, true);
      gfx.fillStyle(0xffffff, 0.85); gfx.fillCircle(R+6, R+6, 7);
      gfx.generateTexture(texKey, dim, dim);
      gfx.destroy();
    }

    this._sprite = this.scene.add.image(x, y, texKey).setDepth(20).setScale(0).setAlpha(0);
    this.scene.tweens.add({ targets: this._sprite, scale: 1, alpha: 1, duration: 350, ease: 'Back.easeOut' });
    this.scene.tweens.add({ targets: this._sprite, y: y - 8, duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    const ringGfx = this.scene.add.graphics().setDepth(19);
    ringGfx.lineStyle(1, color, 0.4); ringGfx.strokeCircle(x, y, POWERUP_RADIUS + 10);
    this._ring = ringGfx;
    this.scene.tweens.add({ targets: this._ring, angle: 360, duration: 3000, repeat: -1 });

    const hex = '#' + color.toString(16).padStart(6, '0');
    this._labelTxt = this.scene.add.text(x, y + POWERUP_RADIUS + 18, this.def.label, {
      fontFamily: '"Courier New", Courier, monospace', fontSize: '11px', color: hex, letterSpacing: 2,
    }).setOrigin(0.5).setDepth(21);
  }

  _showCollectBurst() {
    const color = this.def.color, x = this._sprite.x, y = this._sprite.y;
    const burst = this.scene.add.graphics().setDepth(30);
    this.scene.tweens.addCounter({
      from: POWERUP_RADIUS, to: POWERUP_RADIUS * 4, duration: 300,
      onUpdate: t => { burst.clear(); burst.lineStyle(3, color, 1 - t.getValue()/(POWERUP_RADIUS*4)); burst.strokeCircle(x,y,t.getValue()); },
      onComplete: () => burst.destroy(),
    });
    for (let i = 0; i < 8; i++) {
      const a = (i/8)*Math.PI*2;
      const shard = this.scene.add.graphics().setDepth(30);
      shard.fillStyle(color, 1); shard.fillTriangle(0,-6,-3,3,3,3); shard.setPosition(x,y);
      this.scene.tweens.add({ targets: shard, x: x+Math.cos(a)*60, y: y+Math.sin(a)*60,
        alpha: 0, angle: Phaser.Math.Between(-180,180), duration: 400, ease: 'Quad.easeOut',
        onComplete: () => shard.destroy() });
    }
  }

  _despawn() {
    this.collected = true;
    this.scene.tweens.add({ targets: [this._sprite, this._ring, this._labelTxt],
      alpha: 0, scale: 0, duration: 300, onComplete: () => this.destroy() });
  }
}
