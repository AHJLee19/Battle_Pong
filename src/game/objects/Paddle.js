// src/game/objects/Paddle.js
// ─────────────────────────────────────────────────────────────
//  Changes:
//  • Paddles can roam the FULL arena (minX/maxX cover whole screen)
//  • Dash goes straight right (P1) or straight left (P2), only when not moving
//  • Power-ups are STORED and activated on command (dashKey / quakeKey)
//    — player can hold one power-up at a time
//  • Rotation physics: ball bounce angle reflects paddle angle
//  • Quake built-in (key-triggered, separate cooldown)
// ─────────────────────────────────────────────────────────────
import { PowerUp } from './PowerUp.js';

const ROTATE_SPEED    = 120;   // deg/s
const DASH_SPEED      = 900;   // px/s during built-in dash
const DASH_DURATION   = 180;   // ms
const DASH_COOLDOWN   = 1200;  // ms — for the built-in dash (no power-up needed)
const QUAKE_COOLDOWN  = 5000;  // ms
const QUAKE_RADIUS    = 340;
const QUAKE_PUSH      = 180;

export class Paddle {
  constructor(scene, opts) {
    this.scene  = scene;
    this.opts   = opts;
    this.tint   = opts.tint  ?? 0x00ffcc;
    this.speed  = opts.speed ?? 300;
    this.side   = opts.side  ?? 'left';

    // Full-arena bounds
    this.minX = opts.minX ?? 40;
    this.maxX = opts.maxX ?? scene.scale.width  - 40;
    this.minY = opts.minY ?? 40;
    this.maxY = opts.maxY ?? scene.scale.height - 40;

    // Built-in dash / quake state
    this._dashing       = false;
    this._dashCooldown  = 0;
    this._dashVelX      = 0;
    this._dashTimer     = 0;
    this._quakeCooldown = 0;
    this._trail         = [];
    this._trailTimer    = 0;

    // Stored power-up slot
    this._storedPowerUp = null;   // 'DASH' | 'QUAKE' | null
    this._playerIndex   = opts.side === 'left' ? 0 : 1;

    this._buildSprite(opts.x, opts.y);
    this._setupKeys(opts);
    this._buildLabel(opts.label, opts.side);
    this._buildCooldownBars(opts);
    this._buildStoredPowerUpDisplay(opts);
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
    this._updateCooldownBars();
    this._updateLabelPos();
    this._updateStoredDisplay();
  }

  /** Store a collected power-up (overrides previous if any) */
  storePowerUp(type, playerIndex) {
    this._storedPowerUp = type;
    this._playerIndex   = playerIndex;
    this._showLabel('GOT ' + type + '!', type === 'DASH' ? 0x00ffcc : 0xff6600, 900);
  }

  /** Returns true if the paddle is currently moving via keys */
  _isMoving() {
    return (this._keys.up?.isDown  || this._keys.down?.isDown ||
            this._keys.left?.isDown || this._keys.right?.isDown) ?? false;
  }

  get isDashing() { return this._dashing; }
  get body()      { return this.image.body; }
  get x()         { return this.image.x; }
  get y()         { return this.image.y; }
  get angle()     { return this.image.angle; }

  // Compat stubs for PowerUp.js
  get railX()    { return this.image.x; }
  get railMinY() { return this.minY; }
  get railMaxY() { return this.maxY; }

  destroy() {
    this.image.destroy();
    this._label?.destroy();
    this._dashBar?.destroy();
    this._quakeBar?.destroy();
    this._dashBg?.destroy();
    this._quakeBg?.destroy();
    this._storedIcon?.destroy();
    this._storedBg?.destroy();
    this._trail.forEach(t => t.destroy());
  }

  // ── Movement ──────────────────────────────────────────────

  _handleMovement(delta) {
    const dt = delta / 1000;
    let vx = 0, vy = 0;

    if (this._keys.up?.isDown)    vy = -this.speed;
    if (this._keys.down?.isDown)  vy =  this.speed;
    if (this._keys.left?.isDown)  vx = -this.speed;
    if (this._keys.right?.isDown) vx =  this.speed;

    if (vx !== 0 && vy !== 0) { vx *= 0.707; vy *= 0.707; }

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

    // Built-in dash — only fires if no stored power-up occupying the slot
    if (this._storedPowerUp === null && this._dashCooldown <= 0 &&
        Phaser.Input.Keyboard.JustDown(this._keys.dash)) {
      this._startBuiltinDash();
    }

    // Use stored power-up
    if (this._storedPowerUp && Phaser.Input.Keyboard.JustDown(this._keys.dash)) {
      if (this._storedPowerUp === 'DASH')  this._useStoredDash();
      if (this._storedPowerUp === 'QUAKE') this._useStoredQuake();
      this._storedPowerUp = null;
    }

    // Built-in quake
    if (this._quakeCooldown <= 0 && Phaser.Input.Keyboard.JustDown(this._keys.quake)) {
      this._startQuake();
    }
  }

  // ── Built-in Dash ─────────────────────────────────────────
  // Always goes straight horizontally (right for P1, left for P2)
  // Only dashes if player is NOT pressing any movement key

  _startBuiltinDash() {
    if (this._isMoving()) return;  // no dash while moving

    this._dashing     = true;
    this._dashTimer   = DASH_DURATION;
    this._dashCooldown= DASH_COOLDOWN;

    // Straight horizontal direction based on side
    this._dashVelX = this.side === 'left' ? DASH_SPEED : -DASH_SPEED;
    this._dashVelY = 0;

    this.image.setTint(0xffffff);
    this.scene.time.delayedCall(DASH_DURATION, () => this.image.clearTint());
    try { this.scene.sound.play('dashSFX', { volume: 0.5 }); } catch(_) {}
    this._showLabel('DASH!', this.tint, 600);
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

  // ── Stored power-up activation ────────────────────────────

  _useStoredDash() {
    // PowerUp.activateDash handles trail + tween + sound
    PowerUp.activateDash(this.scene, this, this._playerIndex);
  }

  _useStoredQuake() {
    PowerUp.activateQuake(this.scene, this, this._playerIndex);
  }

  // ── Built-in Quake ────────────────────────────────────────

  _startQuake() {
    this._quakeCooldown = QUAKE_COOLDOWN;
    const scene = this.scene, ox = this.image.x, oy = this.image.y;

    // Shockwave ring
    const ring = scene.add.graphics().setDepth(30);
    scene.tweens.addCounter({
      from: 0, to: QUAKE_RADIUS, duration: 500, ease: 'Quad.easeOut',
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
      from: 0, to: 1, duration: 450, ease: 'Quad.easeOut',
      onUpdate: t => {
        const s = t.getValue(), r = s * QUAKE_RADIUS * 0.85;
        hexGfx.clear();
        hexGfx.lineStyle(2, 0xff6600, (1-s)*0.8);
        const pts = Array.from({ length: 6 }, (_, i) => ({
          x: ox + Math.cos((i/6)*Math.PI*2 - Math.PI/6)*r,
          y: oy + Math.sin((i/6)*Math.PI*2 - Math.PI/6)*r,
        }));
        hexGfx.strokePoints(pts, true);
      },
      onComplete: () => hexGfx.destroy(),
    });

    for (let i = 0; i < 14; i++) {
      const a = (i/14)*Math.PI*2, spd = Phaser.Math.Between(80, 240);
      const p = scene.add.graphics().setDepth(28);
      const sz = Phaser.Math.Between(3, 8);
      p.fillStyle(0xff6600, 1); p.fillRect(-sz/2, -sz/2, sz, sz); p.setPosition(ox, oy);
      scene.tweens.add({ targets: p, x: ox+Math.cos(a)*spd*0.6, y: oy+Math.sin(a)*spd*0.6,
        alpha: 0, angle: Phaser.Math.Between(-180,180),
        duration: Phaser.Math.Between(300,600), ease: 'Quad.easeOut',
        onComplete: () => p.destroy() });
    }

    scene.cameras.main.shake(300, 0.014);
    try { scene.sound.play('quakeSFX', { volume: 0.7 }); } catch(_) {}

    const opponent = (scene._p1Paddle === this) ? scene._p2Paddle : scene._p1Paddle;
    if (opponent) {
      const dx = opponent.x - ox, dy = opponent.y - oy;
      const dist = Math.sqrt(dx*dx + dy*dy) || 1;
      const pushX = (dx/dist)*QUAKE_PUSH, pushY = (dy/dist)*QUAKE_PUSH;
      const sX = opponent.image.x, sY = opponent.image.y;
      const endX = Phaser.Math.Clamp(sX+pushX, opponent.minX, opponent.maxX);
      const endY = Phaser.Math.Clamp(sY+pushY, opponent.minY, opponent.maxY);
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

    this._showLabel('QUAKE!', 0xff6600, 900);
  }

  // ── Cooldown bars ─────────────────────────────────────────

  _buildCooldownBars(opts) {
    const offset = opts.side === 'left' ? 20 : -20;
    const barW = 4, barH = 60;

    this._dashBg = this.scene.add.graphics().setDepth(11);
    this._dashBg.fillStyle(0x000000, 0.5);
    this._dashBg.fillRect(0, 0, barW, barH);

    this._dashBar = this.scene.add.graphics().setDepth(12);

    this._quakeBg = this.scene.add.graphics().setDepth(11);
    this._quakeBg.fillStyle(0x000000, 0.5);
    this._quakeBg.fillRect(0, 0, barW, barH);

    this._quakeBar = this.scene.add.graphics().setDepth(12);

    this._barOffset = offset;
    this._barWidth  = barW;
    this._barHeight = barH;
  }

  _updateCooldownBars() {
    const x = this.image.x + this._barOffset;
    const y = this.image.y - this._barHeight / 2;
    const barW = this._barWidth, barH = this._barHeight;

    const dashFill = 1 - Phaser.Math.Clamp(this._dashCooldown / DASH_COOLDOWN, 0, 1);
    this._dashBg.setPosition(x - barW - 2, y);
    this._dashBar.clear();
    this._dashBar.fillStyle(0x00ffcc, 0.9);
    this._dashBar.fillRect(x - barW - 2, y + barH * (1 - dashFill), barW, barH * dashFill);

    const quakeFill = 1 - Phaser.Math.Clamp(this._quakeCooldown / QUAKE_COOLDOWN, 0, 1);
    this._quakeBg.setPosition(x + 2, y);
    this._quakeBar.clear();
    this._quakeBar.fillStyle(0xff6600, 0.9);
    this._quakeBar.fillRect(x + 2, y + barH * (1 - quakeFill), barW, barH * quakeFill);
  }

  // ── Stored power-up icon (shown above paddle) ─────────────

  _buildStoredPowerUpDisplay(opts) {
    this._storedBg   = this.scene.add.graphics().setDepth(13);
    this._storedIcon = this.scene.add.text(0, 0, '', {
      fontFamily: '"Courier New", Courier, monospace',
      fontSize: '11px', color: '#ffffff',
    }).setOrigin(0.5).setDepth(14);
  }

  _updateStoredDisplay() {
    const x  = this.image.x;
    const y  = this.image.y - 55;
    this._storedBg.clear();
    if (this._storedPowerUp) {
      const col = this._storedPowerUp === 'DASH' ? 0x00ffcc : 0xff6600;
      this._storedBg.fillStyle(col, 0.25);
      this._storedBg.fillRoundedRect(x - 22, y - 9, 44, 18, 4);
      this._storedBg.lineStyle(1, col, 0.8);
      this._storedBg.strokeRoundedRect(x - 22, y - 9, 44, 18, 4);
      const hex = '#' + col.toString(16).padStart(6, '0');
      this._storedIcon.setPosition(x, y).setText(this._storedPowerUp).setColor(hex);
    } else {
      this._storedIcon.setText('');
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
