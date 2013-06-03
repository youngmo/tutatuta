var log4js = require('log4js');
var logger = log4js.getLogger();
var ws = require('ws');

var userCache = require('../cache/user');
var Common = require('../common');
var common;

var Game = require('./index');

function Ready(db) {
    this.db = db;
    common = new Common(db);
}

Ready.prototype._initScore = function(user) {
    user.score = {
        lock:false,
        hp:Game.MAX_HP,
        point:user.point,
        combo:0,
        step:0,
        attack:0
    };
}

Ready.prototype._sendStartFighting = function(user, enemy) {
    var msg = {
        ready:true,
        enemy:{
            name:enemy.name,
            cat:enemy.cat,
            point:enemy.point
        }
    };

    // 메시지 전송
    user.conn.send(JSON.stringify(msg));
}

Ready.prototype._selectEnemy = function(user, isNpc, callback) {

    var userId = user.uid;
    if (!userCache.getWaiting(userId)) {
        return callback('{"error":"no waiting"}');
    }

    if (!Game.lockReady) {
        Game.lockReady = true;   // 상대편고르기는 일단 록을 걸자

        var enemy, enemyId;
        if (isNpc) {
            // 적이 Mr.네코페코일 경우
            enemyId = Game.BOT + '_' + userId + '_' + Date.now();
            enemy = {
                uid:enemyId,
                name:Game.BOT,
                cat:1,
                token:null,
                point:0
            };
        } else {
            // 적이 일반 유저일 경우
            enemy = userCache.getWatingEnemy(userId);

            if (!enemy) {
                // 접속중인 유저가 없었을 경우
                Game.lockReady = false;
                return callback(null, false);
            }

            enemyId = enemy.uid;
        }

        // fighting에 저장할 초기 데이터 작성
        user.enemy = enemyId;
        this._initScore(user);

        enemy.enemy = userId;
        this._initScore(enemy);

        // fighting에 저장
        userCache.pushFighting(user);
        userCache.pushFighting(enemy);

        // 대결 시작 메시지 전송
        this._sendStartFighting(user, enemy);

        if (!isNpc) {
            // 적의 경우엔 봇이 아닐 경우에만 대결 시작 메시지를 전송
            this._sendStartFighting(enemy, user);
        }

        Game.lockReady = false;

        return callback(null, true);
    }

    return callback(null, false);
}

Ready.prototype.ready = function(conn, callback) {
    var userId = conn.user;
    if (!userId) {
        return callback('{"error":"no login"}');
    }

    // 대전중인지 확인
    var user = userCache.getFighting(userId);
    if (user) {
        return callback('{"error":"already fighting"}')
    }

    // 이미 적을 찾는 중인지 확인
    user = userCache.getWaiting(userId);
    if (user) {
        return callback('{"error":"enemy searching"}')
    }

    // 정상 로그인인지 확인
    user = userCache.getOpening(userId);
    if (!user) {
        userCache.removeUser(userId);
        return callback('{"error":"no login"}');
    }

    var self = this;

    common.killPreFighting(user, function(err, isBanUser) {
        if (err) {
            return callback(err);
        }

        if (isBanUser) {
            // 이전 게임이 비정상 종료였을 경우
            return callback(null, false);
        }

        // status를 '대기중'으로 설정
        if (!userCache.getWaiting(userId)) {
            userCache.pushWaiting(user);
        }

        self._selectEnemy(user, false, function(err, result) {
            if (err) {
                return callback(err);
            }

            if (!result) {
                conn.send('{"ready":"false"}');

                // ready후 일정시간(BOT_APPEAR)이 경과되었을 경우, 봇을 상대방으로 설정
                setTimeout(function() {
                    // 대기중인지 확인
                    if (!userCache.getWaiting(userId)) {
                        return;
                    }

                    self._selectEnemy(user, true, function(err, result) {
                        if (err) {
                            return callback(err);
                        }

                        if (!result) {
                            conn.send('{"error":"please re-ready"}');
                        }
                    });

                }, Game.BOT_APPEAR, userId);
            }
        });
    });
}

module.exports = Ready;