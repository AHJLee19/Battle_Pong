// src/game/objects/Goalie.js
// Player-controlled goalie — moves on a vertical rail near the goal.
// Keys passed in via opts.upKey / opts.downKey (Phaser KeyCodes).

export class Goalie {
  constructor(scene, opts) {
    this.scene = scene;
    this.railX = opts.x;
    this.railMinY = opts.railMinY ?? 80;
    this.railMaxY = opts.railMaxY ?? (scene.scale.height - 80);
    this.speed = opts.speed ?? 220;
    this.tint = opts.tint ?? 0xffcc00;

    this._buildSprite(opts.x, opts.startY);
    this._setupKeys(opts);
  }

  _setupKeys(opts) {
    const kb = this.scene.input.keyboard;
    this._upKey   = kb.addKey(opts.upKey);
    this._downKey = kb.addKey(opts.downKey);
  }

  update(delta) {
    const dt = delta / 1000;
    let vy = 0;
    if (this._upKey.isDown)   vy = -this.speed;
    if (this._downKey.isDown) vy =  this.speed;

    const ny = Phaser.Math.Clamp(this.image.y + vy * dt, this.railMinY, this.railMaxY);
    this.image.setY(ny);
    this.image.body.reset(this.railX, ny);
  }

  get body() { return this.image.body; }
  get x() { return this.image.x; }
  get y() { return this.image.y; }
  destroy()  { this.image.destroy(); }

  _buildSprite(x, y) {
    const texKey = 'goalie_' + this.tint.toString(16);
    if (!this.scene.textures.exists(texKey)) {
      const GW = 10, GH = 48;
      const gfx = this.scene.make.graphics({ add: false });
      gfx.fillStyle(this.tint, 1); gfx.fillRect(0, 0, GW, GH);
      gfx.fillStyle(0xffffff, 0.4); gfx.fillRect(2, 4, 3, GH - 8);
      gfx.lineStyle(1, 0xffffff, 0.5); gfx.strokeRect(0, 0, GW, GH);
      gfx.fillStyle(0x000000, 0.25);
      for (let dy = 6; dy < GH; dy += 10) gfx.fillRect(0, dy, GW, 4);
      gfx.generateTexture(texKey, GW, GH);
      gfx.destroy();
    }
    this.image = this.scene.physics.add.image(x, y, texKey);
    this.image.setImmovable(true);
    this.image.body.allowGravity = false;
    this.image.setDepth(10);
  }
}
