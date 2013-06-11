var log4js = require('log4js');
var logger = log4js.getLogger();
var ws = require('ws');

var userCache = require('../cache/user');
var Common = require('../common');
var common;

var Game = require('./index');

function Record(db) {
    this.db = db;
    common = new Common(db);
}

Record.prototype.getUserRecord = function(conn, callback) {
    var userId = conn.user;
    if (!userId) {
        return callback('{"error":"no login"}');
    }

    this.db.collection('User', function(err, col) {
        if (err) {
            return callback(err);
        }

        // 전적 확인
        col.findOne({_id:userId}, function(err, doc) {
            if (err) {
                return callback(err);
            }

            var infoMsg = {
                record: {
                    win:doc.record.win || 0,
                    lose:doc.record.lose || 0,
                    draw:doc.record.draw || 0
                }
            };
            conn.send(JSON.stringify(infoMsg));

            logger.debug('record: win' + doc.record.win + ',lose:' + doc.record.lose + ',draw:' + doc.record.draw);
            return callback(null, true);
        });
    });
}

module.exports = Record;
