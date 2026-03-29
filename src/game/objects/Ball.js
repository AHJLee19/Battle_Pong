// src/game/objects/Ball.js
const BASE_SPEED  = 380;
const MAX_SPEED   = 720;
const SPEED_DELTA = 18;

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
    const angle = Phaser.Math.Between(-30, 30) * (Math.PI / 180);
    this.image.setVelocity(Math.cos(angle) * this._speed * direction, Math.sin(angle) * this._speed);
  }

  accelerate(multiplier = 1) {
    this._speed = Math.min(this._speed + SPEED_DELTA * multiplier, MAX_SPEED);
    const vel = this.image.body.velocity;
    const mag = Math.sqrt(vel.x * vel.x + vel.y * vel.y);
    if (mag > 0) this.image.setVelocity((vel.x/mag)*this._speed, (vel.y/mag)*this._speed);
  }

  reset(x, y) {
    this._speed = BASE_SPEED;
    this.image.setPosition(x, y).setVelocity(0, 0);
    this._trail.forEach(t => t.destroy());
    this._trail = [];
  }

  update() {
    this._updateTrail();
    this._updateGlow();
  }

  get body() { return this.image.body; }
  get x()    { return this.image.x; }
  get y()    { return this.image.y; }

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
      gfx.fillStyle(0x00ffcc, 0.3); gfx.fillCircle(R+4,R+4,R+4);
      gfx.fillStyle(0xffffff, 1);   gfx.fillCircle(R+4,R+4,R);
      gfx.fillStyle(0x00ffff, 0.7); gfx.fillCircle(R, R+2, 4);
      gfx.generateTexture(key, (R+4)*2, (R+4)*2);
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
      this.scene.tweens.add({ targets: ghost, alpha: 0, scale: 0.3, duration: 120, onComplete: () => {
        ghost.destroy();
        this._trail = this._trail.filter(t => t !== ghost);
      }});
    }
  }

  _updateGlow() {
    this._glow.setPosition(this.image.x, this.image.y);
    this._glow.setAlpha(0.2 + 0.1 * Math.sin(this.scene.time.now * 0.01));
  }
}
