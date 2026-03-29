// src/game/objects/PowerUpManager.js
import { PowerUp } from './PowerUp.js';

const TYPES        = ['DASH', 'QUAKE'];
const SPAWN_MIN_MS = 8000;
const SPAWN_MAX_MS = 14000;
const MAX_ACTIVE   = 2;

export class PowerUpManager {
  constructor(scene) {
    this.scene       = scene;
    this._active     = [];
    this._timer      = 0;
    this._nextSpawn  = this._randomInterval();
    this._margin     = 160;
  }

  update(delta) {
    for (let i = this._active.length - 1; i >= 0; i--) {
      const pu = this._active[i];
      pu.update(delta, this.scene._p1Paddle, this.scene._p2Paddle);
      if (!pu.alive) this._active.splice(i, 1);
    }
    this._timer += delta;
    if (this._timer >= this._nextSpawn && this._active.length < MAX_ACTIVE) {
      this._spawn();
      this._timer     = 0;
      this._nextSpawn = this._randomInterval();
    }
  }

  destroy() {
    this._active.forEach(pu => pu.destroy());
    this._active = [];
  }

  _spawn() {
    const { width: W, height: H } = this.scene.scale;
    const m  = this._margin;
    const x  = Phaser.Math.Between(W/2 - 180, W/2 + 180);
    const y  = Phaser.Math.Between(m, H - m);
    if (this._active.some(pu => Phaser.Math.Distance.Between(pu._sprite.x, pu._sprite.y, x, y) < 80)) return;
    const type = TYPES[Math.floor(Math.random() * TYPES.length)];
    this._active.push(new PowerUp(this.scene, x, y, type));
  }

  _randomInterval() {
    return Phaser.Math.Between(SPAWN_MIN_MS, SPAWN_MAX_MS);
  }
}
