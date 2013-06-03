var log4js = require('log4js');
var logger = log4js.getLogger();
var ws = require('ws');

function UserCache() {
    // user online
    this.opening = {};
    this.waiting = {};
    this.fighting = {};
}

UserCache.prototype.pushOpening = function(user) {
    if (!user || !user.uid) {
        logger.warn("UserCache.pushOpening:not found userId");
        return;
    }

    var userId = user.uid;

    delete this.waiting[userId];
    delete this.fighting[userId];

    this.opening[userId] = user;

    this.printCacheInfo('pushOpening');
}

UserCache.prototype.pushWaiting = function(user) {
    if (!user || !user.uid) {
        logger.warn("UserCache.pushWaiting:not found userId");
        return;
    }

    var userId = user.uid;

    delete this.opening[userId];
    delete this.fighting[userId];

    this.waiting[userId] = user;

    this.printCacheInfo('pushWaiting');
}

UserCache.prototype.pushFighting = function(user) {
    if (!user || !user.uid) {
        logger.warn("UserCache.pushFighting:not found userId");
        return;
    }

    var userId = user.uid;

    delete this.opening[userId];
    delete this.waiting[userId];

    this.fighting[userId] = user;

    this.printCacheInfo('pushFighting');
}

UserCache.prototype.getOpening = function(userId) {
    return this.opening[userId];
}

UserCache.prototype.getWaiting = function(userId) {
    return this.waiting[userId];
}

UserCache.prototype.getFighting = function(userId) {
    return this.fighting[userId];
}

UserCache.prototype.removeUser = function(userId) {
    delete this.opening[userId];
    delete this.waiting[userId];
    delete this.fighting[userId];

    this.printCacheInfo('removeUser');
}

UserCache.prototype.removeBot = function(botId) {
    delete this.fighting[botId];

    this.printCacheInfo('removeBot');
}

UserCache.prototype.getWatingEnemy = function(userId) {
    var waiting = this.waiting;
    for (var enemyId in waiting) {
        if (!waiting.hasOwnProperty(enemyId)) {
            continue;
        }

        // 본인 vs 본인은 피할 것
        if (enemyId === userId) {
            continue;
        }

        var enemy = waiting[enemyId];

        // 커넥션이 끊어져 있는 경우는 피할 것
        if (enemy.conn.readyState !== ws.OPEN) {
            this.removeUser(enemyId);
            continue;
        }

        return enemy;
    }
}

UserCache.prototype.searchUser = function(userId) {
    var user = this.getOpening(userId);
    if (user) {
        return user;
    }

    user = this.getWaiting(userId);
    if (user) {
        return user;
    }

    user = this.getFighting(userId);
    if (user) {
        return user;
    }
}

UserCache.prototype.printCacheInfo = function(msg) {
    msg = msg || '';

    logger.debug(
        '【' + msg + '】' +
        'opening:[' + Object.keys(this.opening) + ']' +
        ' waiting:[' + Object.keys(this.waiting) + ']' +
        ' fighting:[' + Object.keys(this.fighting) + ']');
}

module.exports = new UserCache();
