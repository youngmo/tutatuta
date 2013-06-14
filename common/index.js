var log4js = require('log4js');
var logger = log4js.getLogger();
var ws = require('ws');

var userCache = require('../cache/user');

var Game = require('../service/index');

function Common(db) {
    this.db = db;
}

Common.prototype._reward = function(user, inc, callback) {

    // 전적 갱신
    this.db.collection('User', function(err, col) {
        if (err) {
            return callback(err);
        }

        // 유저정보 DB갱신
        if (user) {
            var userId = user.uid;

            col.update({_id:userId}, inc, {upsert:true}, function(err) {
                if (err) {
                    return callback(err);
                }

                // 전적
                col.findOne({_id:userId}, function(err, doc) {
                    if (err) {
                        return callback(err);
                    }

                    // 메시지
                    var msg = {
                        record: {
                            win:doc.record.win || 0,
                            lose:doc.record.lose || 0,
                            draw:doc.record.draw || 0
                        }
                    };

                    if (user.conn.readyState !== ws.OPEN) {
                        user.conn.send(JSON.stringify(msg));

                    } else {
                        logger.debug('ws.OPEN fail');
                    }

                    return callback(null, true);
                });
            });
        }
    });
};

Common.prototype.rewardWinner = function(user, callback) {
    var inc = {$inc:{'record.win':1}};

    this._reward(user, inc, function(err, result) {
        if (err) {
            return callback(err);
        }
        return callback(null, true);
    });
}

Common.prototype.rewardLoser = function(user, callback) {
    var inc = {$inc:{'record.lose':1}};

    this._reward(user, inc, function(err, result) {
        if (err) {
            return callback(err);
        }
        return callback(null, true);
    });
}

/**
 * 유저가 대전상태이면 대전을 종료시킨다.
 * 유저상태를 변경하거나 커넥션을 끊지는 않음.
 * 대전중의 상대유저는 승리처리후 대기준비 상태로 이동
 */
Common.prototype.killPreFighting = function(userId, callback) {

    var user = userCache.getFighting(userId);

    // 유저가 대전 중인지 확인
    if(!user) {
        return callback(null, false);
    }

    var enemyId = user.enemy;
    var enemy = userCache.getFighting(enemyId);
    var self = this;

    // 유저는 패배처리
    this.rewardLoser(user, function(err, result) {
        if (err) {
            return callback(err);
        }

        user.conn.send('{"error":"previous game was abnormal"}');

        if (!enemy) {
            // 상대가 없을 경우(어떤 이유인지간에;)
            return callback(null, false);
        }

        if (enemy.name !== Game.BOT) {

            // 상대는 승리처리
            self.rewardWinner(enemy, function(err, result) {
                if (err) {
                    return callback(err);
                }

                // 대기전 상태로 이동
                userCache.pushOpening(enemy);

                // 비정상 종료 메시지 전송
                enemy.conn.send('{"error":"enemy disconnected"}');

                return callback(null, true);
            });

        } else {
            // 상대가 봇일 경우에는 메모리에서만 삭제해줌
            userCache.removeBot(enemy.uid);
            return callback(null, true);
        }
    });
};

/**
 * 유저를 완전히 삭제한다.
 */
Common.prototype.ban = function(conn) {
    var userId = conn.user;
    if (userId) {
        this.killPreFighting(userId, function(err, result) {

            // 캐쉬 청소
            userCache.removeUser(userId);

            // 커넥션 끊기
            conn.close();

            logger.debug('ban:'+ userId);
        });
    } else {
        conn.close();
    }
};

module.exports = Common;