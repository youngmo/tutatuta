
function Game() {
}

// game property
Game.ROUND_COUNT = 16;
Game.MAX_HP = 100;
Game.MAX_STAGE = 3;

Game.BOT = 'Mr.ネコペコ';
Game.BOT_APPEAR = 5000;
Game.BOT_COMBO_MAX = 3;

// Global Lock
var lockReady = false;
var lockCreate = false;

module.exports = Game;