var log4js = require('log4js');
var logger = log4js.getLogger();
var crypto = require('crypto');

var userCache = require('../cache/user');
var Common = require('../common');
var common;

function Login(db) {
    this.db = db;
    common = new Common(db);
}

Login.prototype.getUser = function(userId, callback) {

    if (!userId) {
        return callback('{"error":"please send uid"}');
    }

    var self = this;
    this.db.collection('User', function(err, col) {
        if (err) {
            return callback(err);
        }

        col.findOne({_id:userId}, function(err, doc) {
            if (err) {
                return callback(err);
            }

            // 기존유저
            if (doc) {
                var user = {
                    uid:doc._id,
                    name:doc.name,
                    cat:doc.cat.id,
                    point:doc.point,
                    record:doc.record,
                    time:Date.now()
                };
                return callback(null, user);

                // 신규가입
            } else {
                return callback('{"login":"false"}');
            }
        });
    });
}

Login.prototype.login = function(conn, userId, callback) {

    this.getUser(userId, function(err, user) {
        if (err) {
            return callback(err);
        }

        common.killPreFighting(user, function(err, isBanUser) {
            if (err) {
                return callback(err);
            }

            if (isBanUser) {
                // 이전 게임이 비정상 종료였을 경우
                return callback(null, false);
            }

            // 암호화(미사용)
            var token = crypto.createHash('md5').update(Date.now() + '').digest('hex');
            user.token = token;

            conn.user = userId;
            user.conn = conn;

            // 캐쉬
            userCache.pushOpening(user);

            var loginMsg = {
                login:true,
                record:{
                    win:user.record.win,
                    lose:user.record.lose,
                    draw:user.record.draw
                },
                point:user.point
            };
            conn.send(JSON.stringify(loginMsg));

            return callback(null, true);
        });
    });
};

module.exports = Login;