// src/game/objects/Paddle.js
// Dash is always available (recharges). No DASH powerup.
// Only QUAKE powerup can be stored (max 1).
// Cooldown bars live in the HUD (Game.js), not on the paddle.

const ROTATE_SPEED = 120;   // deg/s
const DASH_SPEED = 900;   // px/s
const DASH_DURATION = 180;   // ms
const DASH_COOLDOWN = 1200;  // ms
const QUAKE_COOLDOWN = 5000;  // ms
const QUAKE_RADIUS = 180;
const QUAKE_PUSH = 140;

export class Paddle {
  constructor(scene, opts) {
    this.scene = scene;
    this.opts = opts;
    this.tint = opts.tint ?? 0x00ffcc;
    this.speed = opts.speed ?? 300;
    this.side = opts.side  ?? 'left';

    this.minX = opts.minX ?? 40;
    this.maxX = opts.maxX ?? scene.scale.width  - 40;
    this.minY = opts.minY ?? 40;
    this.maxY = opts.maxY ?? scene.scale.height - 40;

    this._dashing = false;
    this._dashCooldown  = 0;
    this._dashVelX = 0;
    this._dashVelY = 0;
    this._dashTimer = 0;
    this._quakeCooldown = 0;
    this._trail = [];
    this._trailTimer = 0;

    // Only QUAKE can be stored
    this._storedQuake = false;

    // Last movement direction for dash
    this._lastVx = opts.side === 'left' ? 1 : -1;
    this._lastVy = 0;

    this._buildSprite(opts.x, opts.y);
    this._setupKeys(opts);
    this._buildLabel(opts.label, opts.side);
    this._buildQuakeIcon(opts);
  }

  // ── Public API ────────────────────────────────────────────

  update(delta) {
    if (this._dashing) {
      this._tickDash(delta);
    } else {
      this._handleMovement(delta);
    }
    this._handleRotation(delta);
    this._tickCooldowns(delta);
    this._updateTrail();
    this._updateLabelPos();
    this._updateQuakeIcon();
  }

  /** Called when player touches a QUAKE powerup. Max 1 stored. */
  storePowerUp(type) {
    if (type === 'QUAKE') {
      if (this._storedQuake) return;
      this._storedQuake = true;
      this._showLabel('GOT QUAKE!', 0xff6600, 900);
    }
  }

  /** Expose cooldowns so Game.js HUD bars can read them */
  get dashCooldown() { return this._dashCooldown; }
  get quakeCooldown() { return this._quakeCooldown; }
  get hasQuake() { return this._storedQuake; }
  get isDashing() { return this._dashing; }
  get body() { return this.image.body; }
  get x() { return this.image.x; }
  get y() { return this.image.y; }
  get angle() { return this.image.angle; }

  get railX() { return this.image.x; }
  get railMinY() { return this.minY; }
  get railMaxY() { return this.maxY; }

  destroy() {
    this.image.destroy();
    this._label?.destroy();
    this._quakeIconBg?.destroy();
    this._quakeIconTxt?.destroy();
    this._trail.forEach(t => {
      this.scene.tweens.killTweensOf(t);
      t.destroy();
    });
  }

  // ── Movement ──────────────────────────────────────────────

  _handleMovement(delta) {
    const dt = delta / 1000;
    let vx = 0, vy = 0;

    if (this._keys.up?.isDown) vy = -this.speed;
    if (this._keys.down?.isDown) vy =  this.speed;
    if (this._keys.left?.isDown) vx = -this.speed;
    if (this._keys.right?.isDown) vx =  this.speed;

    if (vx !== 0 && vy !== 0) { vx *= 0.707; vy *= 0.707; }

    if (vx !== 0 || vy !== 0) {
      this._lastVx = vx;
      this._lastVy = vy;
    }

    const nx = Phaser.Math.Clamp(this.image.x + vx * dt, this.minX, this.maxX);
    const ny = Phaser.Math.Clamp(this.image.y + vy * dt, this.minY, this.maxY);
    this.image.setPosition(nx, ny);
    this.image.body.reset(nx, ny);
  }

  _handleRotation(delta) {
    const dt = delta / 1000;
    let dAngle = 0;
    if (this._keys.rotateCW?.isDown)  dAngle =  ROTATE_SPEED * dt;
    if (this._keys.rotateCCW?.isDown) dAngle = -ROTATE_SPEED * dt;
    if (dAngle !== 0) this.image.setAngle(this.image.angle + dAngle);

    // Dash key
    if (Phaser.Input.Keyboard.JustDown(this._keys.dash) && this._dashCooldown <= 0) {
      this._startDash();
    }

    // Quake key — only fires if we have a stored quake
    if (Phaser.Input.Keyboard.JustDown(this._keys.quake) && this._storedQuake) {
      this._storedQuake = false;
      this._startQuake();
    }
  }

  // ── Dash ──────────────────────────────────────────────────

  _computeDashDirection() {
    let vx = 0, vy = 0;
    if (this._keys.up?.isDown) vy = -1;
    if (this._keys.down?.isDown) vy =  1;
    if (this._keys.left?.isDown) vx = -1;
    if (this._keys.right?.isDown) vx =  1;

    if (vx === 0 && vy === 0) {
      vx = this._lastVx || (this.side === 'left' ? 1 : -1);
      vy = this._lastVy || 0;
    }

    const mag = Math.sqrt(vx * vx + vy * vy) || 1;
    this._dashVelX = (vx / mag) * DASH_SPEED;
    this._dashVelY = (vy / mag) * DASH_SPEED;
  }

  _startDash() {
    this._dashing = true;
    this._dashTimer = DASH_DURATION;
    this._dashCooldown = DASH_COOLDOWN;
    this._computeDashDirection();

    this.image.setTint(0xffffff);
    this.scene.time.delayedCall(DASH_DURATION, () => this.image.clearTint());
    try { this.scene.sound.play('dashSFX', { volume: 0.5 }); } catch(_) {}
    this._showLabel('DASH!', this.tint, 500);
  }

  _tickDash(delta) {
    this._dashTimer -= delta;
    if (this._dashTimer <= 0) { this._dashing = false; return; }
    const dt = delta / 1000;
    const nx = Phaser.Math.Clamp(this.image.x + this._dashVelX * dt, this.minX, this.maxX);
    const ny = Phaser.Math.Clamp(this.image.y + this._dashVelY * dt, this.minY, this.maxY);
    this.image.setPosition(nx, ny);
    this.image.body.reset(nx, ny);
  }

  // ── Quake ─────────────────────────────────────────────────

  _startQuake() {
    this._quakeCooldown = QUAKE_COOLDOWN;
    const scene = this.scene, ox = this.image.x, oy = this.image.y;

    const ring = scene.add.graphics().setDepth(30);
    scene.tweens.addCounter({
      from: 0, to: QUAKE_RADIUS, duration: 400, ease: 'Quad.easeOut',
      onUpdate: t => {
        const r = t.getValue();
        ring.clear();
        ring.lineStyle(3, 0xff6600, 1 - r / QUAKE_RADIUS);
        ring.strokeCircle(ox, oy, r);
        ring.lineStyle(2, 0xffffff, (1 - r / QUAKE_RADIUS) * 0.4);
        ring.strokeCircle(ox, oy, r * 0.6);
      },
      onComplete: () => ring.destroy(),
    });

    const hexGfx = scene.add.graphics().setDepth(29);
    scene.tweens.addCounter({
      from: 0, to: 1, duration: 360, ease: 'Quad.easeOut',
      onUpdate: t => {
        const s = t.getValue(), r = s * QUAKE_RADIUS * 0.85;
        hexGfx.clear();
        hexGfx.lineStyle(2, 0xff6600, (1 - s) * 0.8);
        const pts = Array.from({ length: 6 }, (_, i) => ({
          x: ox + Math.cos((i / 6) * Math.PI * 2 - Math.PI / 6) * r,
          y: oy + Math.sin((i / 6) * Math.PI * 2 - Math.PI / 6) * r,
        }));
        hexGfx.strokePoints(pts, true);
      },
      onComplete: () => hexGfx.destroy(),
    });

    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2, spd = Phaser.Math.Between(60, 160);
      const p = scene.add.graphics().setDepth(28);
      const sz = Phaser.Math.Between(3, 6);
      p.fillStyle(0xff6600, 1); p.fillRect(-sz/2, -sz/2, sz, sz); p.setPosition(ox, oy);
      scene.tweens.add({
        targets: p, x: ox + Math.cos(a) * spd * 0.6, y: oy + Math.sin(a) * spd * 0.6,
        alpha: 0, angle: Phaser.Math.Between(-180, 180),
        duration: Phaser.Math.Between(250, 450), ease: 'Quad.easeOut',
        onComplete: () => p.destroy(),
      });
    }

    scene.cameras.main.shake(250, 0.010);
    try { scene.sound.play('quakeSFX', { volume: 0.7 }); } catch(_) {}

    const opponent = (scene._p1Paddle === this) ? scene._p2Paddle : scene._p1Paddle;
    if (opponent) {
      const dx = opponent.x - ox, dy = opponent.y - oy;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      if (dist <= QUAKE_RADIUS) {
        const pushX = (dx / dist) * QUAKE_PUSH, pushY = (dy / dist) * QUAKE_PUSH;
        const sX = opponent.image.x, sY = opponent.image.y;
        const endX = Phaser.Math.Clamp(sX + pushX, opponent.minX, opponent.maxX);
        const endY = Phaser.Math.Clamp(sY + pushY, opponent.minY, opponent.maxY);
        scene.tweens.add({
          targets: opponent.image,
          x: [sX - 6, sX + 6, sX - 4, sX + 4, sX, endX],
          y: [sY - 4, sY + 4, sY - 2, sY + 2, sY, endY],
          duration: 250, ease: 'Linear',
          onUpdate: () => opponent.image.body.reset(opponent.image.x, opponent.image.y),
        });
        opponent.image.setTint(0xff3300);
        scene.time.delayedCall(350, () => opponent.image.clearTint());
      }
    }

    this._showLabel('QUAKE!', 0xff6600, 900);
  }

  // ── Quake icon (shown above paddle when stored) ───────────

  _buildQuakeIcon(opts) {
    this._quakeIconBg  = this.scene.add.graphics().setDepth(13);
    this._quakeIconTxt = this.scene.add.text(0, 0, '', {
      fontFamily: '"Courier New", Courier, monospace',
      fontSize: '11px', color: '#ff6600',
    }).setOrigin(0.5).setDepth(14);
  }

  _updateQuakeIcon() {
    const x = this.image.x;
    const y = this.image.y - 58;
    this._quakeIconBg.clear();
    if (this._storedQuake) {
      this._quakeIconBg.fillStyle(0xff6600, 0.22);
      this._quakeIconBg.fillRoundedRect(x - 24, y - 9, 48, 18, 3);
      this._quakeIconBg.lineStyle(1, 0xff6600, 0.85);
      this._quakeIconBg.strokeRoundedRect(x - 24, y - 9, 48, 18, 3);
      this._quakeIconTxt.setPosition(x, y).setText('QUAKE').setVisible(true);
    } else {
      this._quakeIconTxt.setVisible(false);
    }
  }

  // ── Keys ──────────────────────────────────────────────────

  _setupKeys(opts) {
    const kb = this.scene.input.keyboard;
    this._keys = {
      up:        opts.upKey        ? kb.addKey(opts.upKey)        : null,
      down:      opts.downKey      ? kb.addKey(opts.downKey)      : null,
      left:      opts.leftKey      ? kb.addKey(opts.leftKey)      : null,
      right:     opts.rightKey     ? kb.addKey(opts.rightKey)     : null,
      rotateCW:  opts.rotateCWKey  ? kb.addKey(opts.rotateCWKey)  : null,
      rotateCCW: opts.rotateCCWKey ? kb.addKey(opts.rotateCCWKey) : null,
      dash:      opts.dashKey      ? kb.addKey(opts.dashKey)      : null,
      quake:     opts.quakeKey     ? kb.addKey(opts.quakeKey)     : null,
    };
  }

  // ── Sprite ────────────────────────────────────────────────

  _buildSprite(x, y) {
    const texKey = 'paddle_' + this.tint.toString(16);
    if (!this.scene.textures.exists(texKey)) {
      const PW = 14, PH = 80;
      const gfx = this.scene.make.graphics({ add: false });
      gfx.fillStyle(this.tint, 1);
      gfx.fillRoundedRect(0, 0, PW, PH, 4);
      gfx.fillStyle(0xffffff, 0.35);
      gfx.fillRoundedRect(2, 4, 4, PH - 8, 2);
      gfx.lineStyle(2, 0xffffff, 0.7);
      gfx.strokeRoundedRect(0, 0, PW, PH, 4);
      gfx.generateTexture(texKey, PW, PH);
      gfx.destroy();
    }
    this.image = this.scene.physics.add.image(x, y, texKey);
    this.image.setImmovable(true);
    this.image.body.allowGravity = false;
    this.image.setDepth(10);
  }

  _buildLabel(label, side) {
    if (!label) return;
    const hex = '#' + this.tint.toString(16).padStart(6, '0');
    this._label = this.scene.add.text(
      this.image.x + (side === 'left' ? -28 : 28),
      this.image.y, label,
      { fontFamily: '"Courier New", Courier, monospace', fontSize: '13px', color: hex }
    ).setOrigin(0.5).setDepth(10);
    this._labelOffsetX = side === 'left' ? -28 : 28;
  }

  _updateLabelPos() {
    if (this._label) this._label.setPosition(this.image.x + this._labelOffsetX, this.image.y);
  }

  // ── Cooldown ticks ────────────────────────────────────────

  _tickCooldowns(delta) {
    if (this._dashCooldown  > 0) this._dashCooldown  -= delta;
    if (this._quakeCooldown > 0) this._quakeCooldown -= delta;
  }

  // ── Trail ─────────────────────────────────────────────────

  _updateTrail() {
    const interval = this._dashing ? 20 : 50;
    this._trailTimer -= 16;
    if (this._trailTimer <= 0) {
      this._trailTimer = interval;
      const ghost = this.scene.add.image(this.image.x, this.image.y, this.image.texture.key);
      ghost.setAngle(this.image.angle)
           .setAlpha(this._dashing ? 0.45 : 0.2)
           .setTint(this._dashing ? 0xffffff : this.tint)
           .setDepth(9);
      this._trail.push(ghost);
      this.scene.tweens.add({
        targets: ghost, alpha: 0, duration: this._dashing ? 150 : 250,
        onComplete: () => {
          ghost.destroy();
          this._trail = this._trail.filter(t => t !== ghost);
        },
      });
    }
  }

  // ── Popup label ───────────────────────────────────────────

  _showLabel(text, color, duration = 700) {
    const hex = '#' + color.toString(16).padStart(6, '0');
    const txt = this.scene.add.text(this.image.x, this.image.y - 50, text, {
      fontFamily: '"Courier New", Courier, monospace',
      fontSize: '22px', fontStyle: 'bold',
      color: '#ffffff', stroke: hex, strokeThickness: 3,
    }).setOrigin(0.5).setDepth(50);
    this.scene.tweens.add({
      targets: txt, y: this.image.y - 110, alpha: 0,
      duration, ease: 'Quad.easeOut',
      onComplete: () => txt.destroy(),
    });
  }
}
