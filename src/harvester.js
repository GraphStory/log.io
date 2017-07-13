// TODO: This file was created by bulk-decaffeinate.
// Sanity-check the conversion and remove this comment.
/*
 * decaffeinate suggestions:
 * DS001: Remove Babel/TypeScript constructor workaround
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
/* Log.io Log Harvester

Watches local files and sends new log message to server via TCP.

* Sample configuration:
config =
  nodeName: 'my_server01'
  logStreams:
    web_server: [
      '/var/log/nginx/access.log',
      '/var/log/nginx/error.log'
    ],
  server:
    host: '0.0.0.0',
    port: 28777

* Sends the following TCP messages to the server:
"+node|my_server01|web_server\r\n"
"+bind|node|my_server01\r\n"
"+log|web_server|my_server01|info|this is log messages\r\n"

* Usage:
harvester = new LogHarvester config
harvester.run()

*/

const fs = require('fs');
const net = require('net');
const events = require('events');
const winston = require('winston');

/*
LogStream is a group of local files paths.  It watches each file for
changes, extracts new log messages, and emits 'new_log' events.

*/
class LogStream extends events.EventEmitter {
  constructor(name, paths, _log) {
    {
      // Hack: trick Babel/TypeScript into allowing this before super.
      if (false) { super(); }
      let thisFn = (() => { this; }).toString();
      let thisName = thisFn.slice(thisFn.indexOf('{') + 1, thisFn.indexOf(';')).trim();
      eval(`${thisName} = this;`);
    }
    this.name = name;
    this.paths = paths;
    this._log = _log;
  }

  watch() {
    this._log.info(`Starting log stream: '${this.name}'`);
    for (let path of Array.from(this.paths)) { this._watchFile(path); }
    return this;
  }

  _watchFile(path) {
      let watcher;
      if (!fs.existsSync(path)) {
        this._log.error(`File doesn't exist: '${path}'`);
        setTimeout((() => this._watchFile(path)), 1000);
        return;
      }
      this._log.info(`Watching file: '${path}'`);
      let currSize = fs.statSync(path).size;
      return watcher = fs.watch(path, (event, filename) => {
        if (event === 'rename') {
          // File has been rotated, start new watcher
          watcher.close();
          this._watchFile(path);
        }
        if (event === 'change') {
          // Capture file offset information for change event
          return fs.stat(path, (err, stat) => {
            this._readNewLogs(path, stat.size, currSize);
            return currSize = stat.size;
          });
        }
      });
    }

  _readNewLogs(path, curr, prev) {
    // Use file offset information to stream new log lines from file
    if (curr < prev) { return; }
    const rstream = fs.createReadStream(path, {
      encoding: 'utf8',
      start: prev,
      end: curr
    }
    );
    // Emit 'new_log' event for every captured log line
    return rstream.on('data', data => {
      const lines = data.split("\n");
      return Array.from(lines).filter((line) => line).map((line) => this.emit('new_log', line));
    });
  }
}

/*
LogHarvester creates LogStreams and opens a persistent TCP connection to the server.

On startup it announces itself as Node with Stream associations.
Log messages are sent to the server via string-delimited TCP messages

*/
class LogHarvester {
  constructor(config) {
    ({nodeName: this.nodeName, server: this.server} = config);
    this.delim = config.delimiter != null ? config.delimiter : '\r\n';
    this._log = config.logging != null ? config.logging : winston;
    this.logStreams = ((() => {
      const result = [];
      for (let s in config.logStreams) {
        const paths = config.logStreams[s];
        result.push(new LogStream(s, paths, this._log));
      }
      return result;
    })());
  }

  run() {
    this._connect();
    return this.logStreams.forEach(stream => {
      return stream.watch().on('new_log', msg => {
        if (this._connected) { return this._sendLog(stream, msg); }
      });
    });
  }

  _connect() {
    // Create TCP socket
    this.socket = new net.Socket;
    this.socket.on('error', error => {
      this._connected = false;
      this._log.error("Unable to connect server, trying again...");
      return setTimeout((() => this._connect()), 2000);
    });
    this._log.info("Connecting to server...");
    return this.socket.connect(this.server.port, this.server.host, () => {
      this._connected = true;
      return this._announce();
    });
  }

  _sendLog(stream, msg) {
    this._log.debug(`Sending log: (${stream.name}) ${msg}`);
    return this._send('+log', stream.name, this.nodeName, 'info', msg); 
  }

  _announce() {
    const snames = (Array.from(this.logStreams).map((l) => l.name)).join(",");
    this._log.info(`Announcing: ${this.nodeName} (${snames})`);
    this._send('+node', this.nodeName, snames);
    return this._send('+bind', 'node', this.nodeName);
  }

  _send(mtype, ...args) {
    return this.socket.write(`${mtype}|${args.join('|')}${this.delim}`);
  }
}

exports.LogHarvester = LogHarvester;