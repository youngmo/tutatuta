var log4js = require('log4js');
var logger = log4js.getLogger();
var ws = require('ws');

var userCache = require('../cache/user');
var Common = require('../common');
var common;

var Game = require('./index');

function Score(db) {
    this.db = db;
    common = new Common(db);
}

Score.prototype.sendMsg = function(user, enemy) {
    var userPoint = user.score.point;
    var userHp = user.score.hp;
    var userCombo = user.score.combo;
    var userAttack = user.score.attack;

    var enemyPoint = enemy.score.point;
    var enemyHp = enemy.score.hp;
    var enemyCombo = enemy.score.combo;
    var enemyAttack = enemy.score.attack;

    // 유저 전송 메시지 작성
    var userScore = {
        score:{
            hp:userHp,
            point:userPoint,
            combo:userCombo,
            attack:userAttack
        },
        enemy:{
            hp:enemyHp,
            point:enemyPoint,
            combo:enemyCombo,
            attack:enemyAttack
        }
    };

    // 상대편 전송 메시지 작성
    var enemyScore = {
        score:{
            hp:enemyHp,
            point:enemyPoint,
            combo:enemyCombo,
            attack:enemyAttack
        },
        enemy:{
            hp:userHp,
            point:userPoint,
            combo:userCombo,
            attack:userAttack
        }
    };

    // 집계 메시지 전송
    user.conn.send(JSON.stringify(userScore));

    // 집계 메시지 전송(상대방의 경우, 봇이 아닐 경우에만 전송)
    if (enemy.name !== Game.BOT) {
        enemy.conn.send(JSON.stringify(enemyScore));
    }
}

Score.prototype.rewardDraw = function(user, enemy, callback) {
    // 전적 갱신
    this.db.collection('User', function(err, col) {
        if (err) {
            return callback(err);
        }

        // 유저와 상대편 모두 DB갱신
        var playerList = [];
        if (enemy.name === Game.BOT) {
            playerList.push(user.uid);
        } else {
            playerList.push(user.uid);
            playerList.push(enemy.uid);
        }

        playerList.forEach(function(target) {
            // 전적 갱신
            col.update({_id:target}, {$inc:{'record.draw':1}}, {upsert:true}, function(err) {
                if (err) {
                    return callback(err);
                }

                // 전적 확인
                col.findOne({_id:target}, function(err, doc) {
                    if (err) {
                        return callback(err);
                    }

                    // 게임 무승부 메시지
                    var targetMsg = {
                        record: {
                            win:doc.record.win || 0,
                            lose:doc.record.lose || 0,
                            draw:doc.record.draw || 0
                        }
                    };
                    var user = userCache.getFighting(target);
                    user.conn.send(JSON.stringify(targetMsg));

                    // 게임 대기상태로 이동
                    userCache.pushOpening(target);

                    return callback(null, true);
                });
            });
        });
    });
}

Score.prototype.submit = function(conn, comboCount, lastCount, callback) {
    var userId = conn.user;
    if (!userId) {
        return callback('{"error":"no login"}');
    }

    // 대전중인지 확인
    var user = userCache.getFighting(userId);
    if (!user) {
        return callback('{"error":"not ready"}')
    }

    // 집계 계산
    var hp = (comboCount * Game.ROUND_COUNT) + lastCount;
    var point = hp * comboCount;

    var enemyId = user.enemy;
    var enemy = userCache.getFighting(enemyId);

    if (enemy.name === Game.BOT) {

        // 봇의 경우, 랜덤 점수 생성
        var botCombo = Math.floor(Math.random() * Game.BOT_COMBO_MAX);
        var botLast = Math.floor(Math.random() * Game.ROUND_COUNT);
        var botHp = (botCombo * Game.ROUND_COUNT) + botLast;
        var boptPoint = botHp * botCombo;

        enemy.score.lock = true;
        enemy.score.point += boptPoint;
        enemy.score.combo = botCombo;
        user.score.hp -= botHp;
        enemy.score.step++;
        enemy.score.attack = botHp;

    } else {
        // 상대편의 커넥션이 끊어져 있는 경우
        if (enemy.conn.readyState !== ws.OPEN) {
            // 유저를 승리처리
            common.rewardWinner(user, function(err, result) {
                if (err) {
                    return callback(err);
                }

                // 대기준비 상태로 이동
                userCache.pushOpening(user);

                // 커넥션이 끊겨있는 상대 유저의 캐쉬 삭제
                userCache.removeUser(enemyId);

                return callback('{"error":"enemy disconnected"}');
            });
        }
    }

    // 유저 집계 제출 & 갱신
    if (user.score.lock) {
        // 이미 집계 제출을 한 경우
        return callback('{"error":"already send point"}');
    }

    user.score.lock = true;
    user.score.point += point;
    user.score.combo = comboCount;
    enemy.score.hp -= hp;
    user.score.step++;
    user.score.attack = hp;

    // 포인트 갱신
    this.db.collection('User', function(err, col) {
        if (err) {
            return callback(err);
        }

        col.update({_id:userId}, {$set:{'record.point':user.score.point}}, {upsert:true}, function(err) {
            if (err) {
                return callback(err);
            }
        });
    });

    // 상대편 집계 갱신(상대편이 이미 집계 제출을 마쳤을 경우만)
    if (!enemy.score.lock) {
        // 상대편 집계가 아직 미제출일 경우
        return callback('{"score":"false"}');
    }

    // 유저와 상대편의 스테이지 수가 일치인지 화인
    if (user.score.step !== enemy.score.step) {
        return callback('{"error":"game error #01"}');
    }

    this.sendMsg(user, enemy);

    user.score.lock = false;
    enemy.score.lock = false;

    // 대전 종료일 경우
    var userHp = user.score.hp;
    var enemyHp = enemy.score.hp;

    if (userHp <= 0 ||
        enemyHp <= 0 ||
        Game.MAX_STAGE <= user.score.step) {

        // 승자판단
        var winner;
        var loser;
        if (enemyHp < userHp) {
            winner = user;

            // 봇이 아닐 경우에만 패자를 저장
            if (enemy.name === Game.BOT) {
                userCache.removeBot(enemyId);
            } else {
                loser = enemy;
            }
        } else if (userHp < enemyHp) {
            loser = user;

            // 봇이 아닐 경우에만 승자를 저장
            if (enemy.name === Game.BOT) {
                userCache.removeBot(enemyId);
            } else {
                winner = enemy;
            }
        }

        if (!winner && !loser) {

            // 무승부일 경우
            this.rewardDraw(user, enemy, function() {
                if (err) {
                    return callback(err);
                }
            });

        } else {
            // 무승부가 아닐 경우
            common.rewardWinner(winner, function(err, result) {
                if (err) {
                    return callback(err);
                }

                // 대기준비 상태로 이동
                userCache.pushOpening(winner);
            });

            common.rewardLoser(loser, function(err, result) {
                if (err) {
                    return callback(err);
                }

                // 대기준비 상태로 이동
                userCache.pushOpening(loser);
            });
        }
    }
}

module.exports = Score;