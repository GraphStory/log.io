// TODO: This file was created by bulk-decaffeinate.
// Sanity-check the conversion and remove this comment.
/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
/* Log.io Functional tests
 *
 * Stands up all 3 components, verifies that writing to a file
 * ends up populating a client collection.
 *
 * TODO(msmathers): Write more complete test coverage.
 */

const fs = require('fs');
const chai = require('chai');
const _ = require('underscore');
const winston = require('winston');
const sinon_chai = require('sinon-chai');
chai.use(sinon_chai);
const should = chai.should();

const {LogHarvester} = require('../../lib/harvester.js');
const {LogServer, WebServer} = require('../../lib/server.js');
const {WebClient} = require('../../lib/client.js');
const logging = new winston.Logger({
  transports: [ new winston.transports.Console({level: 'error'})]});

// Configuration

const TEST_FILES = [
  '/tmp/stream1a.log',
  '/tmp/stream1b.log',
  '/tmp/stream2a.log',
  '/tmp/stream2b.log',
  '/tmp/stream3a.log',
  '/tmp/stream3b.log',
  '/tmp/stream4a.log',
  '/tmp/stream4b.log'
];

const HARVESTER1_CONFIG = {
  logging,
  nodeName: 'server01',
  logStreams: {
    stream1: TEST_FILES.slice(0, 2),
    stream2: TEST_FILES.slice(2, 4)
  },
  server: {
    host: '0.0.0.0',
    port: 28771
  }
};

const HARVESTER2_CONFIG = {
  logging,
  nodeName: 'server02',
  logStreams: {
    stream2: TEST_FILES.slice(4, 6),
    stream3: TEST_FILES.slice(6, 8)
  },
  server: {
    host: '0.0.0.0',
    port: 28771
  }
};

const LOG_SERVER_CONFIG = {
  logging,
  port: 28771
};
const WEB_SERVER_CONFIG = {
  logging,
  port: 28772
};

// Drop empty test files

for (let fpath of Array.from(TEST_FILES)) { fs.writeFile(fpath, ''); }

// Initialize servers

const logServer = new LogServer(LOG_SERVER_CONFIG);
const webServer = new WebServer(logServer, WEB_SERVER_CONFIG);
webServer.run();

describe('LogServer', () =>
  it('should have no nodes or streams initially', function() {
    _.keys(logServer.logNodes).should.have.length(0);
    _.keys(logServer.logStreams).should.have.length(0);

    // Connect harvesters
    const harvester1 = new LogHarvester(HARVESTER1_CONFIG);
    const harvester2 = new LogHarvester(HARVESTER2_CONFIG);
    harvester1.run();
    harvester2.run();

    return describe('Log Server registration', () =>
      it('should have registered nodes & streams once connected', function() {
        logServer.logNodes.should.have.keys('server01', 'server02');
        return logServer.logStreams.should.have.keys('stream1', 'stream2', 'stream3');
      })
    );
  })
);

// Initialize client

const webClient = new WebClient({host: 'http://0.0.0.0:28772'});

// Write to watched files, verify end-to-end propagation

describe('WebClient', () =>
  it('waits for server connection...', connected =>
    webClient.socket.on('initialized', function() {

      describe('WebClient state', function() {
        it('should be notified of registered nodes & streams', function() {
          webClient.logNodes.should.have.length(2);
          return webClient.logStreams.should.have.length(3);
        });

        return it('creates a log screen and actives a node/stream pair', function() {
          const screen1 = webClient.createScreen('Screen 1');
          const stream1 = webClient.logStreams.get('stream1');
          const node1 = webClient.logNodes.get('server01');
          screen1.addPair(stream1, node1);
          screen1.logMessages.should.have.length(0);

          return describe('log message propagation', () =>
            it('should populate client backbone collection on file writes', function(done) {
              const msg1 = "log message 1";
              const msg2 = "log message 2";
              // This file is a member of the watched stream
              fs.appendFileSync(TEST_FILES[0], `${msg1}\n`);
              // This file is not a member of the watched stream
              fs.appendFileSync(TEST_FILES[2], `${msg2}\n`);
              return webClient.socket.once('new_log', function() {
                screen1.logMessages.should.have.length(1);
                screen1.logMessages.at(0).get('message').should.equal(msg1);
                return done();
              });
            })
          );
        });
      });

      return connected();
    })
  )
);
