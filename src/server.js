// TODO: This file was created by bulk-decaffeinate.
// Sanity-check the conversion and remove this comment.
/*
 * decaffeinate suggestions:
 * DS001: Remove Babel/TypeScript constructor workaround
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS201: Simplify complex destructure assignments
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
/* Log.io Log Server

Relays inbound log messages to web clients

LogServer receives log messages via TCP:
"+log|my_stream|my_server_host|info|this is a log message\r\n"

Announce a node, optionally with stream associations
"+node|my_server_host\r\n"
"+node|my_server_host|my_stream1,my_stream2,my_stream3\r\n"

Announce a stream, optionally with node associations
"+stream|my_stream1\r\n"
"+stream|my_stream1|my_server_host1,my_host_server2\r\n"

Remove a node or stream
"-node|my_server_host1\r\n"
"-stream|stream2\r\n"

WebServer listens for events emitted by LogServer and
forwards them to web clients via socket.io

* Usage:
logServer = new LogServer port: 28777
webServer = new WebServer logServer, port: 28778
webServer.run()

*/

const fs = require('fs');
const net = require('net');
const http = require('http');
const https = require('https');
let io = require('socket.io');
const events = require('events');
const winston = require('winston');
const express = require('express');

class _LogObject {
  static initClass() {
    this.prototype._type = 'object';
  }
  _pclass() {}
  _pcollection() {}
  constructor(logServer, name, _pairs) {
    this.logServer = logServer;
    this.name = name;
    if (_pairs == null) { _pairs = []; }
    this.logServer.emit(`add_${this._type}`, this);
    this.pairs = {};
    this.pclass = this._pclass();
    this.pcollection = this._pcollection();
    for (let pname of Array.from(_pairs)) { this.addPair(pname); }
  }

  addPair(pname) {
    let pair;
    if (!(pair = this.pairs[pname])) {
      if (!(pair = this.pcollection[pname])) {
        pair = (this.pcollection[pname] = new this.pclass(this.logServer, pname));
      }
      pair.pairs[this.name] = this;
      this.pairs[pname] = pair;
      return this.logServer.emit(`add_${this._type}_pair`, this, pname);
    }
  }

  remove() {
    this.logServer.emit(`remove_${this._type}`, this);
    return (() => {
      const result = [];
      for (let name in this.pairs) {
        const p = this.pairs[name];
        result.push(delete p.pairs[this.name]);
      }
      return result;
    })();
  }

  toDict() {
    let name;
    return {
      name: this.name,
      pairs: ((() => {
        const result = [];
        for (name in this.pairs) {
          const obj = this.pairs[name];
          result.push(name);
        }
        return result;
      })())
    };
  }
}
_LogObject.initClass();

class LogNode extends _LogObject {
  static initClass() {
    this.prototype._type = 'node';
  }
  _pclass() { return LogStream; }
  _pcollection() { return this.logServer.logStreams; }
}
LogNode.initClass();

class LogStream extends _LogObject {
  static initClass() {
    this.prototype._type = 'stream';
  }
  _pclass() { return LogNode; }
  _pcollection() { return this.logServer.logNodes; }
}
LogStream.initClass();

/*
LogServer listens for TCP connections.  It parses & validates
inbound TCP messages, and emits events.

*/
class LogServer extends events.EventEmitter {
  constructor(config) {
    {
      // Hack: trick Babel/TypeScript into allowing this before super.
      if (false) { super(); }
      let thisFn = (() => { this; }).toString();
      let thisName = thisFn.slice(thisFn.indexOf('{') + 1, thisFn.indexOf(';')).trim();
      eval(`${thisName} = this;`);
    }
    this._receive = this._receive.bind(this);
    this._flush = this._flush.bind(this);
    if (config == null) { config = {}; }
    ({host: this.host, port: this.port} = config);
    this._log = config.logging != null ? config.logging : winston;
    this._delimiter = config.delimiter != null ? config.delimiter : '\r\n';
    this.logNodes = {};
    this.logStreams = {};
  }

  run() {
    // Create TCP listener socket
    this.listener = net.createServer(socket => {
      socket._buffer = '';
      socket.on('data', data => this._receive(data, socket));
      socket.on('error', () => this._tearDown(socket));
      return socket.on('close', () => this._tearDown(socket));
    });
    return this.listener.listen(this.port, this.host);
  }

  _tearDown(socket) {
    // Destroy a client socket
    this._log.error('Lost TCP connection...');
    if (socket.node) {
      this._removeNode(socket.node.name);
      return delete socket.node;
    }
  }

  _receive(data, socket) {
    const part = data.toString();
    socket._buffer += part;
    this._log.debug(`Received TCP message: ${part}`);
    if (socket._buffer.indexOf(this._delimiter >= 0)) { return this._flush(socket); }
  }

  _flush(socket) {
    // Handle messages in socket buffer
    // Pause socket while modifying buffer
    let adjustedLength, array, msgs;
    socket.pause();
    array = socket._buffer.split(this._delimiter),
      adjustedLength = Math.max(array.length, 1),
      msgs = array.slice(0, adjustedLength - 1),
      socket._buffer = array[adjustedLength - 1];
    socket.resume();
    return Array.from(msgs).map((msg) => this._handle(socket, msg));
  }

  _handle(socket, msg) {
    this._log.debug(`Handling message: ${msg}`);
    const [mtype, ...args] = Array.from(msg.split('|'));
    switch (mtype) {
      case '+log': return this._newLog(...Array.from(args || []));
      case '+node': return this._addNode(...Array.from(args || []));
      case '+stream': return this._addStream(...Array.from(args || []));
      case '-node': return this._removeNode(...Array.from(args || []));
      case '-stream': return this._removeStream(...Array.from(args || []));
      case '+bind': return this._bindNode(socket, ...Array.from(args));
      default: return this._log.error(`Invalid TCP message: ${msg}`);
    }
  }

  _addNode(nname, snames) {
    if (snames == null) { snames = ''; }
    return this.__add(nname, snames, this.logNodes, LogNode, 'node');
  }

  _addStream(sname, nnames) {
    if (nnames == null) { nnames = ''; }
    return this.__add(sname, nnames, this.logStreams, LogStream, 'stream');
  }

  _removeNode(nname) {
    return this.__remove(nname, this.logNodes, 'node');
  }

  _removeStream(sname) {
    return this.__remove(sname, this.logStreams, 'stream');
  }

  _newLog(sname, nname, logLevel, ...message) {
    message = message.join('|');
    this._log.debug(`Log message: (${sname}, ${nname}, ${logLevel}) ${message}`);
    const node = this.logNodes[nname] || this._addNode(nname, sname);
    const stream = this.logStreams[sname] || this._addStream(sname, nname);
    return this.emit('new_log', stream, node, logLevel, message);
  }

  __add(name, pnames, _collection, _objClass, objName) {
    this._log.info(`Adding ${objName}: ${name} (${pnames})`);
    pnames = pnames.split(',');
    const obj = (_collection[name] = _collection[name] || new _objClass(this, name, pnames));
    return Array.from(pnames).filter((p) => !obj.pairs[p]).map((p) => obj.addPair(p));
  }

  __remove(name, _collection, objType) {
    let obj;
    if (obj = _collection[name]) {
      this._log.info(`Removing ${objType}: ${name}`);
      obj.remove();
      return delete _collection[name];
    }
  }

  _bindNode(socket, obj, nname) {
    let node;
    if (node = this.logNodes[nname]) {
      this._log.info(`Binding node '${nname}' to TCP socket`);
      socket.node = node;
      return this._ping(socket);
    }
  }

  _ping(socket) {
    if (socket.node) {
      socket.write('ping');
      return setTimeout((() => this._ping(socket)), 2000);
    }
  }
}



/*
WebServer relays LogServer events to web clients via socket.io.

*/

class WebServer {
  constructor(logServer, config) {
    this.logServer = logServer;
    ({host: this.host, port: this.port, auth: this.auth} = config);
    ({logNodes: this.logNodes, logStreams: this.logStreams} = this.logServer);
    this.restrictSocket = config.restrictSocket != null ? config.restrictSocket : '*:*';
    this._log = config.logging != null ? config.logging : winston;
    // Create express server
    const app = this._buildServer(config);
    this.http = this._createServer(config, app);
  }

  _buildServer(config) {
    const app = express();
    if (this.auth != null) {
      app.use(express.basicAuth(this.auth.user, this.auth.pass));
    }
    if (config.restrictHTTP) {
      const ips = new RegExp(config.restrictHTTP.join('|'));
      app.all('/', (req, res, next) => {
        if (!req.ip.match(ips)) {
          return res.send(403, `Your IP (${req.ip}) is not allowed.`);
        }
        return next();
      });
    }
    const staticPath = config.staticPath != null ? config.staticPath : __dirname + '/../';
    return app.use(express.static(staticPath));
  }

  _createServer(config, app) {
    if (config.ssl) {
      return https.createServer({
        key: fs.readFileSync(config.ssl.key),
        cert: fs.readFileSync(config.ssl.cert)
      }, app);
    } else {
      return http.createServer(app);
    }
  }

  run() {
    this._log.info('Starting Log.io Web Server...');
    this.logServer.run();
    io = io.listen(this.http.listen(this.port, this.host));
    io.set('log level', 1);
    io.set('origins', this.restrictSocket);
    this.listener = io.sockets;

    const _on = (...args) => this.logServer.on(...Array.from(args || []));
    const _emit = (_event, msg) => {
      this._log.debug(`Relaying: ${_event}`);
      return this.listener.emit(_event, msg);
    };

    // Bind events from LogServer to web client
    _on('add_node', node => _emit('add_node', node.toDict()));
    _on('add_stream', stream => _emit('add_stream', stream.toDict()));
    _on('add_stream_pair', (stream, nname) => _emit('add_pair', {stream: stream.name, node: nname}));
    _on('add_node_pair', (node, sname) => _emit('add_pair', {stream: sname, node: node.name}));
    _on('remove_node', node => _emit('remove_node', node.toDict()));
    _on('remove_stream', stream => _emit('remove_stream', stream.toDict()));

    // Bind new log event from Logserver to web client
    _on('new_log', (stream, node, level, message) => {
      _emit('ping', {stream: stream.name, node: node.name});
      // Only send message to web clients watching logStream
      return this.listener.in(`${stream.name}:${node.name}`).emit('new_log', {
        stream: stream.name,
        node: node.name,
        level,
        message
      }
      );
    });

    // Bind web client connection, events to web server
    this.listener.on('connection', wclient => {
      let node, stream;
      for (var n in this.logNodes) { node = this.logNodes[n]; wclient.emit('add_node', node.toDict()); }
      for (var s in this.logStreams) { stream = this.logStreams[s]; wclient.emit('add_stream', stream.toDict()); }
      for (n in this.logNodes) {
        node = this.logNodes[n];
        for (s in node.pairs) {
          stream = node.pairs[s];
          wclient.emit('add_pair', {stream: s, node: n});
        }
      }
      wclient.emit('initialized');
      wclient.on('watch', pid => wclient.join(pid));
      return wclient.on('unwatch', pid => wclient.leave(pid));
    });
    return this._log.info('Server started, listening...');
  }
}

exports.LogServer = LogServer;
exports.WebServer = WebServer;
