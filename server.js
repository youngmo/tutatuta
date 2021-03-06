var log4js = require('log4js');
var logger = log4js.getLogger();

var crypto = require('crypto');
var ws = require('ws');
var mongodb = require('mongodb');

var WebSocketServer = ws.Server;
var wss = new WebSocketServer({port: 18080});

var mongoServer = new mongodb.Server('127.0.0.1', 27017, {});
var db = new mongodb.Db('tuta', mongoServer, {w:1});

// Service
var Common = require('./common');
var LoginService = require('./service/login');
var ReadyService = require('./service/ready');
var ScoreService = require('./service/score');
var RecordService = require('./service/record');
var CreateUserService = require('./service/create');

var common = new Common(db);
var loginService = new LoginService(db);
var readyService = new ReadyService(db);
var scoreService = new ScoreService(db);
var recordService = new RecordService(db);
var createUserService = new CreateUserService(db);

var userCache = require('./cache/user');

db.open(function(err, client) {
    if (err) {
        logger.error(err);
        throw err;
    }
});

wss.on('error', function (error) {
    logger.debug('_error_');
    logger.debug(error);
});

wss.on('headers', function (headers) {
    logger.debug('_headers_ :' + this._server._connections);
    logger.debug(headers);
});

wss.on('connection', function (conn) {
    logger.debug('__connection__ :' + this._server._connections);

    conn.on('message', function (message) {
        logger.debug('__message__');

        try {
            var ms = JSON.parse(message);
            for (var request in ms) {

                logger.debug('【req】' + JSON.stringify(ms));
                userCache.printCacheInfo('req');

                switch (request) {
                    case 'login':
                        var userId = ms[request].uid;
                        loginService.login(conn, userId, function(err, result) {
                            if (err) {
                                logger.error(err);
                                conn.send(err);
                            }
                        });
                        break;

                    case 'create':
                        // 유저 정보
                        var createId = ms[request].uid;
                        var userName = ms[request].id;
                        var userCatId = ms[request].catId;

                        createUserService.create(conn, createId, userName, userCatId, function(err, result) {
                            if (err) {
                                logger.error(err);
                                conn.send(err);
                            }
                        });
                        break;

                    case 'ready':
                        readyService.ready(conn, function(err, result) {
                            if (err) {
                                logger.error(err);
                                conn.send(err);
                            }
                        });
                        break;

                    case 'score':
                        // 제출된 점수
                        var comboCount = ms[request].combo || 0;
                        var lastCount = ms[request].count || 0;

                        scoreService.submit(conn, comboCount, lastCount, function(err, result) {
                            if (err) {
                                logger.error(err);
                                conn.send(err);
                            }
                        });
                        break;

                    case 'record':
                        recordService.getUserRecord(conn, function(err, result) {
                            if (err) {
                                logger.error(err);
                                conn.send(err);
                            }
                        });
                        break;

                    case 'close':
                        common.ban(conn);
                        break;

                    default :
                        conn.send('{"error":"illegal request"}');
                } // switch
            }
        } catch (e) {
            logger.error(e);
            conn.send('{"error":"unexpected error"}');
        }
    });

    conn.on('error', function (error) {
        logger.debug('__error__');
        logger.debug(error);
    });

    conn.on('close', function (code, message) {
        logger.debug('__close__ :' + this.upgradeReq.connection.server._connections);
        logger.debug(code + ',' + message);

        common.ban(conn);
    });

    conn.on('ping', function (data, flags) {
        logger.debug('__ping__');
        logger.debug(data);
        logger.debug(flags);
    });

    conn.on('pong', function (data, flags) {
        logger.debug('__pong__');
        logger.debug(data);
        logger.debug(flags);
    });

    conn.on('open', function () {
        logger.debug('__open__');
    });

    conn.send('{"open":true}');
});

process.on('uncaughtException', function (err) {
    logger.error(err);
});

process.on('exit', function () {
    db.on("close", function(err){
        if (err) {
            logger.error(err);
        }
    });
});
