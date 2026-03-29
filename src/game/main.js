import Phaser from 'phaser';
import { TitleScene } from './scenes/MainMenu.js';
import { ModeSelectScene } from './scenes/ModeSelect.js';
import { GameScene } from './scenes/Game.js';
import { SettingsScene } from './scenes/Settings.js';

const StartGame = (parent) => {
    const config = {
        type: Phaser.AUTO,
        width: 1280,
        height: 720,
        backgroundColor: '#1a1ac9',
        physics: {
            default: 'arcade',
            arcade: {
            gravity: { y: 0 },
            debug: false,
            },
        },
        scene: [TitleScene, ModeSelectScene, GameScene, SettingsScene],
        parent: 'game-container',
        scale: {
            mode: Phaser.Scale.FIT,
            autoCenter: Phaser.Scale.CENTER_BOTH,
        },
    };

    return new Phaser.Game(config);
};

export default StartGame;