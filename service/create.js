var log4js = require('log4js');
var logger = log4js.getLogger();
var ws = require('ws');

var userCache = require('../cache/user');
var Common = require('../common');
var common;

var LoginService = require('./login');
var loginService;

var Game = require('./index');

function CreateUser(db) {
    this.db = db;
    common = new Common(db);
    loginService = new LoginService(db);
}

CreateUser.prototype.create = function(conn, createId, userName, userCatId, callback) {
    if (!createId || !userName || !userCatId) {
        return callback('{"error":"please send your info"}');
    }

    if (conn.user) {
        return callback('{"error":"already login"}');
    }

    if (Game.lockCreate) {
        return callback('{"create":"false"}');
    }

    Game.lockCreate = true;   // 신규가입은 일단 록을 걸자

    this.db.collection('User', function(err, col) {
        if (err) {
            Game.lockCreate = false;
            return callback(err);
        }

        col.findOne({$or:[{_id:createId}, {name:userName}]}, function(err, doc) {
            if (err) {
                Game.lockCreate = false;
                return callback(err);
            }

            //　닉네임 중복체크
            if (userName === Game.BOT || doc) {
                var msg = '{"error":"please send another text"}';
                if (createId === doc._id) {
                    msg = '{"error":"please send another unique id"}';
                }
                if (userName === doc.name) {
                    msg = '{"error":"please send another name"}';
                }
                Game.lockCreate = false;
                return callback(msg);
            }

            // 가입
            var initDoc = {
                _id:createId,
                name:userName,
                cat:{
                    id:userCatId
                },
                record:{
                    win:0,
                    lose:0,
                    draw:0
                },
                point:0,
                time:{
                    init:Date.now()
                }
            };

            col.insert(initDoc, function(err, doc) {
                if (err) {
                    Game.lockCreate = false;
                    return callback(err);
                }

                Game.lockCreate = false;

                // 로그인까지 진행
                loginService.login(conn, createId, function(err, result) {
                    if (err) {
                        return callback(err);
                    }
                    return callback(null, result);
                });
            });
        });
    });
}

module.exports = CreateUser;