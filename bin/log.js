#!/usr/bin/env node
/*
 * decaffeinate suggestions:
 * DS104: Avoid inline assignments
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
let left;
const winston = require('winston');
const logging = new winston.Logger({
  transports: [ new winston.transports.Console({
    level: 'error'
  })]
});
const homeDir = process.env[((left = process.platform === 'win32')) != null ? left : {'USERPROFILE' : 'HOME'}];
const webConf = require(homeDir + '/.log.io/web_server.conf').config;
webConf.logging = logging;
const logConf = require(homeDir + '/.log.io/log_server.conf').config;
logConf.logging = logging;
const server = require('../index.js');
const logServer = new server.LogServer(logConf);
const webServer = new server.WebServer(logServer, webConf);
webServer.run();
