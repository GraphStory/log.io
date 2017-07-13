#!/usr/bin/env node
// TODO: This file was created by bulk-decaffeinate.
// Sanity-check the conversion and remove this comment.
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
const homeDir = process.env["HOME"];
const conf = require(homeDir + '/.log.io/harvester.conf').config;
conf.logging = logging;
let harvester = require('../index.js');
harvester = new harvester.LogHarvester(conf);
harvester.run();
