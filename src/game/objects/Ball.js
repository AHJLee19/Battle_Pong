// src/game/objects/Ball.js
const BASE_SPEED  = 380;
const MAX_SPEED   = 720;
const SPEED_DELTA = 18;
const DASH_BOOST  = 160;   // extra speed added on dash hit
const DECAY_RATE  = 60;    // px/s² decay back toward normal speed

export class Ball {
  constructor(scene, x, y) {
    this.scene       = scene;
    this._speed      = BASE_SPEED;
    this._trail      = [];
    this._trailTimer = 0;
    this._buildSprite(x, y);
    this._buildGlow();
  }

  launch(direction = 1) {
    const angle = Phaser.Math.Between(-25, 25) * (Math.PI / 180);
    this.image.setVelocity(
      Math.cos(angle) * this._speed * direction,
      Math.sin(angle) * this._speed
    );
  }

  accelerate(multiplier = 1) {
    this._speed = Math.min(this._speed + SPEED_DELTA * multiplier, MAX_SPEED);
    const vel = this.image.body.velocity;
    const mag = Math.sqrt(vel.x * vel.x + vel.y * vel.y);
    if (mag > 0) this.image.setVelocity((vel.x / mag) * this._speed, (vel.y / mag) * this._speed);
  }

  /** Apply a dash speed boost — decays back to BASE_SPEED over time */
  dashBoost() {
    this._speed = Math.min((isFinite(this._speed) ? this._speed : BASE_SPEED) + DASH_BOOST, MAX_SPEED);
    const vel = this.image.body.velocity;
    const mag = Math.sqrt(vel.x * vel.x + vel.y * vel.y);
    if (mag > 10) this.image.setVelocity((vel.x / mag) * this._speed, (vel.y / mag) * this._speed);
  }

  reset(x, y) {
    this._speed = BASE_SPEED;
    this.image.setPosition(x, y).setVelocity(0, 0);
    // Kill tweens on trail ghosts before destroying to prevent onComplete firing on dead objects
    this._trail.forEach(t => {
      this.scene.tweens.killTweensOf(t);
      t.destroy();
    });
    this._trail = [];
  }

  update(delta) {
    this._decaySpeed(delta);
    this._updateTrail();
    this._updateGlow();
  }

  /** Gradually decay speed back toward BASE_SPEED */
  _decaySpeed(delta) {
    if (!delta || this._speed <= BASE_SPEED + 1) return;
    const dt = delta / 1000;
    this._speed = Math.max(BASE_SPEED, this._speed - DECAY_RATE * dt);
    // Only rescale velocity if the ball is actually moving
    const vel = this.image.body.velocity;
    const mag = Math.sqrt(vel.x * vel.x + vel.y * vel.y);
    if (mag > 10) {
      this.image.setVelocity((vel.x / mag) * this._speed, (vel.y / mag) * this._speed);
    }
  }

  get body()  { return this.image.body; }
  get x()     { return this.image.x; }
  get y()     { return this.image.y; }
  get speed() { return this._speed; }
  set speed(v){ this._speed = isFinite(v) ? v : BASE_SPEED; }

  destroy() {
    this.image.destroy();
    this._glow?.destroy();
    this._trail.forEach(t => t.destroy());
  }

  _buildSprite(x, y) {
    const key = 'ball_tex';
    if (!this.scene.textures.exists(key)) {
      const R = 10;
      const gfx = this.scene.make.graphics({ add: false });
      gfx.fillStyle(0x00ffcc, 0.3); gfx.fillCircle(R + 4, R + 4, R + 4);
      gfx.fillStyle(0xffffff, 1);   gfx.fillCircle(R + 4, R + 4, R);
      gfx.fillStyle(0x00ffff, 0.7); gfx.fillCircle(R, R + 2, 4);
      gfx.generateTexture(key, (R + 4) * 2, (R + 4) * 2);
      gfx.destroy();
    }
    this.image = this.scene.physics.add.image(x, y, key);
    this.image.setCircle(10, 4, 4);
    this.image.setBounce(1).setCollideWorldBounds(true);
    this.image.body.allowGravity = false;
    this.image.setDepth(15);
  }

  _buildGlow() {
    this._glow = this.scene.add.image(this.image.x, this.image.y, 'ball_tex');
    this._glow.setScale(1.8).setAlpha(0.25).setTint(0x00ffcc).setDepth(14);
  }

  _updateTrail() {
    this._trailTimer += 16;
    if (this._trailTimer >= 30) {
      this._trailTimer = 0;
      const ghost = this.scene.add.image(this.image.x, this.image.y, 'ball_tex');
      ghost.setScale(0.7).setAlpha(0.3).setTint(0x00ffcc).setDepth(13);
      this._trail.push(ghost);
      this.scene.tweens.add({
        targets: ghost, alpha: 0, scale: 0.3, duration: 120,
        onComplete: () => {
          ghost.destroy();
          this._trail = this._trail.filter(t => t !== ghost);
        },
      });
    }
  }

  _updateGlow() {
    this._glow.setPosition(this.image.x, this.image.y);
    this._glow.setAlpha(0.2 + 0.1 * Math.sin(this.scene.time.now * 0.01));
  }
}
