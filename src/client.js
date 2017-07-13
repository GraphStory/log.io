/*
 * decaffeinate suggestions:
 * DS001: Remove Babel/TypeScript constructor workaround
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS103: Rewrite code to no longer use __guard__
 * DS104: Avoid inline assignments
 * DS204: Change includes calls to have a more natural evaluation order
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
/* Log.io Web Client

Listens to server for new log messages, renders them to screen "widgets".

* Usage:
wclient = new WebClient io, host: 'http://localhost:28778'
screen = wclient.createScreen
stream = wclient.logStreams.at 0
node = wclient.logNodes.at 0
screen.addPair stream, node
screen.on 'new_log', (stream, node, level, message) ->

*/

let $;
if (process.browser) {
  $ = require('jquery-browserify');
} else {
  $ = eval("require('jquery')");
}
const backbone = require('backbone');
backbone.$ = $;
const io = require('socket.io-client');
const _ = require('underscore');
const templates = require('./templates');

// Cap LogMessages collection size
const MESSAGE_CAP = 5000;

/*
ColorManager acts as a circular queue for color values.
Every new Stream or Node is assigned a color value on instantiation.

*/

class ColorManager {
  static initClass() {
    this.prototype._max = 20;
  }
  constructor(_index) {
    if (_index == null) { _index = 1; }
    this._index = _index;
  }
  next() {
    if (this._index === this._max) { this._index = 1; }
    return this._index++;
  }
}
ColorManager.initClass();

const colors = new ColorManager;

/*
Backbone models are used to represent nodes and streams.  When nodes
go offline, their LogNode model is destroyed, along with their
stream assocations.

*/

class _LogObject extends backbone.Model {
  static initClass() {
    this.prototype.idAttribute = 'name';
  }
  _pclass() { return new _LogObjects; }
  sync(...args) {}
  constructor(...args) {
    super(...Array.from(args || []));
    this.screens = new LogScreens;
    this.pairs = this._pclass();
    this.color = colors.next();
  }
}
_LogObject.initClass();

class _LogObjects extends backbone.Collection {
  static initClass() {
    this.prototype.model = _LogObject;
  }
  comparator(obj) {
    return obj.get('name');
  }
}
_LogObjects.initClass();

class LogStream extends _LogObject {
  _pclass() { return new LogNodes; }
}

class LogStreams extends _LogObjects {
  static initClass() {
    this.prototype.model = LogStream;
  }
}
LogStreams.initClass();

class LogNode extends _LogObject {
  _pclass() { return new LogStreams; }
}

class LogNodes extends _LogObjects {
  static initClass() {
    this.prototype.model = LogNode;
  }
}
LogNodes.initClass();

var LogMessage = (function() {
  let ROPEN = undefined;
  let RCLOSE = undefined;
  LogMessage = class LogMessage extends backbone.Model {
    static initClass() {
      ROPEN = new RegExp('<','ig');
      RCLOSE = new RegExp('>','ig');
    }
    render_message() {
      return this.get('message').replace(ROPEN, '&lt;').replace(RCLOSE, '&gt;');
    }
  };
  LogMessage.initClass();
  return LogMessage;
})();

class LogMessages extends backbone.Collection {
  static initClass() {
    this.prototype.model = LogMessage;
  }
  constructor(...args) {
    {
      // Hack: trick Babel/TypeScript into allowing this before super.
      if (false) { super(); }
      let thisFn = (() => { this; }).toString();
      let thisName = thisFn.slice(thisFn.indexOf('{') + 1, thisFn.indexOf(';')).trim();
      eval(`${thisName} = this;`);
    }
    this._capped = this._capped.bind(this);
    super(...Array.from(args || []));
    this.on('add', this._capped);
  }

  _capped() {
    if (this.length > MESSAGE_CAP) { return this.remove(this.at((this.length - MESSAGE_CAP))); }
  }
}
LogMessages.initClass();


/*
LogScreen models maintain state for screen widgets in the UI.
When (Stream, Node) pairs are associated with a screen, the pair ID
is stored on the model.  It uses pair ID instead of models themselves
in case a node goes offline, and a new LogNode model is created.

*/
class LogScreen extends backbone.Model {
  static initClass() {
    this.prototype.idAttribute = null;
  }
  defaults() {
    return {pairIds: []};
  }
  constructor(...args) {
    super(...Array.from(args || []));
    this.logMessages = new LogMessages;
  }

  addPair(stream, node) {
    const pairIds = this.get('pairIds');
    const pid = this._pid(stream, node);
    if (!Array.from(pairIds).includes(pid)) { pairIds.push(pid); }
    stream.trigger('lwatch', node, this);
    node.trigger('lwatch', stream, this);
    stream.screens.update(this);
    node.screens.update(this);
    return this.collection.trigger('addPair');
  }

  removePair(stream, node) {
    const pairIds = this.get('pairIds');
    const pid = this._pid(stream, node);
    this.set('pairIds', (Array.from(pairIds).filter((p) => p !== pid)));
    stream.trigger('lunwatch', node, this);
    node.trigger('lunwatch', stream, this);
    stream.screens.remove(this);
    node.screens.remove(this);
    return this.collection.trigger('removePair');
  }

  hasPair(stream, node) {
    let needle;
    const pid = this._pid(stream, node);
    return (needle = pid, Array.from(this.get('pairIds')).includes(needle));
  }

  _pid(stream, node) { return `${stream.id}:${node.id}`; }

  isActive(object, getPair) {
    // Returns true if all object pairs are activated on screen
    if (!object.pairs.length) { return false; }
    return object.pairs.every(item => {
      const [stream, node] = Array.from(getPair(object, item));
      return this.hasPair(stream, node);
    });
  }
}
LogScreen.initClass();

class LogScreens extends backbone.Collection {
  static initClass() {
    this.prototype.model = LogScreen;
  }
}
LogScreens.initClass();

/*
WebClient listens for log messages and stream/node announcements
from the server via socket.io.  It manipulates state in LogNodes &
LogStreams collections, which triggers view events.

*/

class WebClient {
  constructor(opts, localStorage) {
    this._initScreens = this._initScreens.bind(this);
    this._addNode = this._addNode.bind(this);
    this._addStream = this._addStream.bind(this);
    this._removeNode = this._removeNode.bind(this);
    this._removeStream = this._removeStream.bind(this);
    this._addPair = this._addPair.bind(this);
    this._newLog = this._newLog.bind(this);
    this._ping = this._ping.bind(this);
    this._disconnect = this._disconnect.bind(this);
    if (opts == null) { opts = {host: '', secure: false}; }
    if (localStorage == null) { localStorage = {}; }
    this.localStorage = localStorage;
    this.stats = {
      nodes: 0,
      streams: 0,
      messages: 0,
      start: new Date().getTime()
    };
    this.logNodes = new LogNodes;
    this.logStreams = new LogStreams;
    this.logScreens = new LogScreens;
    this.app = new ClientApplication({
      logNodes: this.logNodes,
      logStreams: this.logStreams,
      logScreens: this.logScreens,
      webClient: this
    });
    this.app.render();
    this._initScreens();
    this.socket = io.connect(opts.host, {secure: opts.secure});
    const _on = (...args) => this.socket.on(...Array.from(args || []));

    // Bind to socket events from server
    _on('add_node', this._addNode);
    _on('add_stream', this._addStream);
    _on('remove_node', this._removeNode);
    _on('remove_stream', this._removeStream);
    _on('add_pair', this._addPair);
    _on('new_log', this._newLog);
    _on('ping', this._ping);
    _on('disconnect', this._disconnect);
  }

  _initScreens() {
    this.logScreens.on('add remove addPair removePair', () => {
      return this.localStorage['logScreens'] = JSON.stringify(this.logScreens.toJSON());
    });
    const screenCache = this.localStorage['logScreens'];
    const screens = screenCache ? JSON.parse(screenCache) : [{name: 'Screen1'}];
    return Array.from(screens).map((screen) => this.logScreens.add(new this.logScreens.model(screen)));
  }

  _addNode(node) {
    this.logNodes.add(node);
    return this.stats.nodes++;
  }

  _addStream(stream) {
    this.logStreams.add(stream);
    this.stats.streams++;
    stream = this.logStreams.get(stream.name);
    stream.on('lwatch', (node, screen) => {
      return this.socket.emit('watch', screen._pid(stream, node));
    });
    return stream.on('lunwatch', (node, screen) => {
      return this.socket.emit('unwatch', screen._pid(stream, node));
    });
  }

  _removeNode(node) {
    __guard__(this.logNodes.get(node.name), x => x.destroy());
    return this.stats.nodes--;
  }

  _removeStream(stream) {
    __guard__(this.logStreams.get(stream.name), x => x.destroy());
    return this.stats.streams--;
  }

  _addPair(p) {
    const stream = this.logStreams.get(p.stream);
    const node = this.logNodes.get(p.node);
    stream.pairs.add(node);
    node.pairs.add(stream);
    return this.logScreens.each(function(screen) {
      if (screen.hasPair(stream, node)) { return screen.addPair(stream, node); }
    });
  }

  _newLog(msg) {
    let {stream, node, level, message} = msg;
    stream = this.logStreams.get(stream);
    node = this.logNodes.get(node);
    return this.logScreens.each(function(screen) {
      if (screen.hasPair(stream, node)) {
        return screen.trigger('new_log', new LogMessage({
          stream,
          node,
          level,
          message
        })
        );
      }
    });
  }

  _ping(msg) {
    let {stream, node} = msg;
    stream = this.logStreams.get(stream);
    node = this.logNodes.get(node);
    if (stream) { stream.trigger('ping', node); }
    if (node) { node.trigger('ping', stream); }
    return this.stats.messages++;
  }

  _disconnect() {
    this.logNodes.reset();
    this.logStreams.reset();
    this.stats.nodes = 0;
    return this.stats.streams = 0;
  }

  createScreen(sname) {
    const screen = new LogScreen({name: sname});
    this.logScreens.add(screen);
    return screen;
  }
}

/*
Backbone views are used to manage the UI components,
including the list of log nodes and screen panels.

* View heirarchy:
ClientApplication
  LogControlPanel
    ObjectControls
      ObjectGroupControls
        ObjectItemControls
  LogScreenPanel
    LogScreenView
    LogStatsView

TODO(msmathers): Build templates, fill out render() methods

*/

class ClientApplication extends backbone.View {
  constructor(...args) {
    {
      // Hack: trick Babel/TypeScript into allowing this before super.
      if (false) { super(); }
      let thisFn = (() => { this; }).toString();
      let thisName = thisFn.slice(thisFn.indexOf('{') + 1, thisFn.indexOf(';')).trim();
      eval(`${thisName} = this;`);
    }
    this._resize = this._resize.bind(this);
    super(...args);
  }

  static initClass() {
    this.prototype.el = '#web_client';
    this.prototype.template = _.template(templates.clientApplication);
  }
  initialize(opts) {
    ({logNodes: this.logNodes, logStreams: this.logStreams, logScreens: this.logScreens, webClient: this.webClient} = opts);
    this.controls = new LogControlPanel({
      logNodes: this.logNodes,
      logStreams: this.logStreams,
      logScreens: this.logScreens
    });
    this.screens = new LogScreensPanel({
      logScreens: this.logScreens,
      webClient: this.webClient
    });
    if (typeof window !== 'undefined' && window !== null) { $(window).resize(this._resize); }
    return this.listenTo(this.logScreens, 'add remove', this._resize);
  }

  _resize() {
    if ((typeof window === 'undefined' || window === null)) { return; }
    const width = $(window).width() - this.$el.find("#log_controls").width();
    return this.$el.find("#log_screens").width(width);
  }

  render() {
    this.$el.html(this.template());
    this.$el.append(this.controls.render().el);
    this.$el.append(this.screens.render().el);
    this._resize();
    return this;
  }
}
ClientApplication.initClass();

class LogControlPanel extends backbone.View {
  constructor(...args) {
    {
      // Hack: trick Babel/TypeScript into allowing this before super.
      if (false) { super(); }
      let thisFn = (() => { this; }).toString();
      let thisName = thisFn.slice(thisFn.indexOf('{') + 1, thisFn.indexOf(';')).trim();
      eval(`${thisName} = this;`);
    }
    this._toggleMode = this._toggleMode.bind(this);
    super(...args);
  }

  static initClass() {
    this.prototype.id = 'log_controls';
    this.prototype.template = _.template(templates.logControlPanel);
  
    this.prototype.events =
      {"click a.select_mode": "_toggleMode"};
  }
  initialize(opts) {
    ({logNodes: this.logNodes, logStreams: this.logStreams, logScreens: this.logScreens} = opts);
    this.streams = new ObjectControls({
      objects: this.logStreams,
      logScreens: this.logScreens,
      getPair(object, item) { return [object, item]; },
      id: 'log_control_streams'
    });
    return this.nodes = new ObjectControls({
      objects: this.logNodes,
      logScreens: this.logScreens,
      getPair(object, item) { return [item, object]; },
      id: 'log_control_nodes',
      attributes: {
        style: 'display: none'
      }
    });
  }

  _toggleMode(e) {
    const target = $(e.currentTarget);
    target.addClass('active').siblings().removeClass('active');
    const tid = target.attr('href');
    this.$el.find(tid).show().siblings('.object_controls').hide();
    return false;
  }

  render() {
    this.$el.html(this.template());
    this.$el.append(this.streams.render().el);
    this.$el.append(this.nodes.render().el);
    return this;
  }
}
LogControlPanel.initClass();

class ObjectControls extends backbone.View {
  constructor(...args) {
    {
      // Hack: trick Babel/TypeScript into allowing this before super.
      if (false) { super(); }
      let thisFn = (() => { this; }).toString();
      let thisName = thisFn.slice(thisFn.indexOf('{') + 1, thisFn.indexOf(';')).trim();
      eval(`${thisName} = this;`);
    }
    this._addObject = this._addObject.bind(this);
    this._filter = this._filter.bind(this);
    this._resize = this._resize.bind(this);
    super(...args);
  }

  static initClass() {
    this.prototype.className = 'object_controls';
    this.prototype.template = _.template(templates.objectControls);
  }
  initialize(opts) {
    ({objects: this.objects, getPair: this.getPair, logScreens: this.logScreens} = opts);
    this.listenTo(this.objects, 'add', this._addObject);
    this.listenTo(this.objects, 'reset', () => this.render());
    if (typeof window !== 'undefined' && window !== null) { $(window).resize(this._resize); }
    return this.filter = null;
  }

  _addObject(obj) {
    return this._insertObject(new ObjectGroupControls({
      object: obj,
      getPair: this.getPair,
      logScreens: this.logScreens
    })
    );
  }

  _insertObject(view) {
    if (this.filter) { view._filter(this.filter); }
    view.render();
    const index = this.objects.indexOf(view.object);
    if (index > 0) {
      return view.$el.insertAfter(this.$el.find(`div.groups div.group:eq(${index - 1})`));
    } else {
      return this.$el.find("div.groups").prepend(view.el);
    }
  }

  _filter(e) {
    const input = $(e.currentTarget);
    const filter = input.val();
    this.filter = filter ? new RegExp(`(${filter})`, 'ig') : null;
    return this.objects.trigger('ui_filter', this.filter);
  }

  _resize() {
    if ((typeof window === 'undefined' || window === null)) { return; }
    const height = $(window).height();
    return this.$el.find(".groups").height(height - 80);
  }

  render() {
    this.$el.html(this.template({
      title: this.id})
    );
    this.$el.find('.filter').keyup(this._filter);
    this._resize();
    return this;
  }
}
ObjectControls.initClass();

class ObjectGroupControls extends backbone.View {
  constructor(...args) {
    {
      // Hack: trick Babel/TypeScript into allowing this before super.
      if (false) { super(); }
      let thisFn = (() => { this; }).toString();
      let thisName = thisFn.slice(thisFn.indexOf('{') + 1, thisFn.indexOf(';')).trim();
      eval(`${thisName} = this;`);
    }
    this._filter = this._filter.bind(this);
    this._addItem = this._addItem.bind(this);
    super(...args);
  }

  static initClass() {
    this.prototype.className = 'group';
    this.prototype.template = _.template(templates.objectGroupControls);
  }
  initialize(opts) {
    ({object: this.object, getPair: this.getPair, logScreens: this.logScreens} = opts);
    this.object.pairs.each(this._addItem);
    this.listenTo(this.object.pairs, 'add', this._addItem);
    this.listenTo(this.object, 'destroy', () => this.remove());
    this.listenTo(this.object.collection, 'ui_filter', this._filter);
    this.header_view = new ObjectGroupHeader({
      object: this.object,
      getPair: this.getPair,
      logScreens: this.logScreens
    });
    return this.header_view.render();
  }

  _filter(filter) {
    if (filter && !this.object.get('name').match(filter)) {
      return this.$el.hide();
    } else {
      return this.$el.show();
    }
  }

  _addItem(pair) {
    return this._insertItem(new ObjectItemControls({
      item: pair,
      getPair: this.getPair,
      object: this.object,
      logScreens: this.logScreens
    })
    );
  }

  _insertItem(view) {
    view.render();
    const index = this.object.pairs.indexOf(view.item);
    if (index > 0) {
      return view.$el.insertAfter(this.$el.find(`div.items div.item:eq(${index - 1})`));
    } else {
      return this.$el.find("div.items").prepend(view.el);
    }
  }

  render() {
    this.$el.html(this.template);
    this.$el.prepend(this.header_view.el);
    return this;
  }
}
ObjectGroupControls.initClass();

class ObjectGroupHeader extends backbone.View {
  constructor(...args) {
    {
      // Hack: trick Babel/TypeScript into allowing this before super.
      if (false) { super(); }
      let thisFn = (() => { this; }).toString();
      let thisName = thisFn.slice(thisFn.indexOf('{') + 1, thisFn.indexOf(';')).trim();
      eval(`${thisName} = this;`);
    }
    this._toggleScreen = this._toggleScreen.bind(this);
    this._ping = this._ping.bind(this);
    this.render = this.render.bind(this);
    super(...args);
  }

  static initClass() {
    this.prototype.className = 'header';
    this.prototype.template = _.template(templates.objectGroupHeader);
  
    this.prototype.events =
      {"click input": "_toggleScreen"};
  }

  initialize(opts) {
    ({object: this.object, getPair: this.getPair, logScreens: this.logScreens} = opts);
    this.listenTo(this.logScreens, 'add remove', () => this.render());
    this.listenTo(this.object, 'destroy', () => this.remove());
    this.listenTo(this.object, 'lwatch lunwatch', () => this.render());
    this.listenTo(this.object.collection, 'add', () => this.render());
    return this.listenTo(this.object, 'ping', this._ping);
  }

  _toggleScreen(e) {
    const checkbox = $(e.currentTarget);
    const screen_id = checkbox.attr('title').replace(/screen-/ig, '');
    const screen = this.logScreens.get(screen_id);
    return this.object.pairs.forEach(item => {
      const [stream, node] = Array.from(this.getPair(this.object, item));
      if (checkbox.is(':checked')) {
        return screen.addPair(stream, node);
      } else {
        return screen.removePair(stream, node);
      }
    });
  }

  _ping() {
    this.diode.addClass('ping');
    return setTimeout((() => this.diode.removeClass('ping')), 20);
  }

  render() {
    this.$el.html(this.template({
      getPair: this.getPair,
      object: this.object,
      logScreens: this.logScreens
    })
    );
    this.diode = this.$el.find('.diode');
    return this;
  }
}
ObjectGroupHeader.initClass();

class ObjectItemControls extends backbone.View {
  constructor(...args) {
    {
      // Hack: trick Babel/TypeScript into allowing this before super.
      if (false) { super(); }
      let thisFn = (() => { this; }).toString();
      let thisName = thisFn.slice(thisFn.indexOf('{') + 1, thisFn.indexOf(';')).trim();
      eval(`${thisName} = this;`);
    }
    this._toggleScreen = this._toggleScreen.bind(this);
    this._ping = this._ping.bind(this);
    super(...args);
  }

  static initClass() {
    this.prototype.className = 'item';
    this.prototype.template = _.template(templates.objectItemControls);
  
    this.prototype.events =
      {"click input": "_toggleScreen"};
  }
  initialize(opts) {
    ({item: this.item, object: this.object, logScreens: this.logScreens} = opts);
    [this.stream, this.node] = Array.from(opts.getPair(this.object, this.item));
    this.listenTo(this.logScreens, 'add remove', () => this.render());
    this.listenTo(this.item, 'destroy', () => this.remove());
    this.listenTo(this.stream, 'lwatch lunwatch', () => this.render());
    return this.listenTo(this.item, 'ping', this._ping);
  }

  _toggleScreen(e) {
    const checkbox = $(e.currentTarget);
    const screen_id = checkbox.attr('title').replace(/screen-/ig, '');
    const screen = this.logScreens.get(screen_id);
    if (checkbox.is(':checked')) {
      return screen.addPair(this.stream, this.node);
    } else {
      return screen.removePair(this.stream, this.node);
    }
  }

  _ping(object) {
    if (object === this.object) {
      this.diode.addClass('ping');
      return setTimeout((() => this.diode.removeClass('ping')), 20);
    }
  }

  render() {
    this.$el.html(this.template({
      item: this.item,
      stream: this.stream,
      node: this.node,
      logScreens: this.logScreens
    })
    );
    this.diode = this.$el.find('.diode');
    return this;
  }
}
ObjectItemControls.initClass();

class LogScreensPanel extends backbone.View {
  constructor(...args) {
    {
      // Hack: trick Babel/TypeScript into allowing this before super.
      if (false) { super(); }
      let thisFn = (() => { this; }).toString();
      let thisName = thisFn.slice(thisFn.indexOf('{') + 1, thisFn.indexOf(';')).trim();
      eval(`${thisName} = this;`);
    }
    this._addLogScreen = this._addLogScreen.bind(this);
    this._resize = this._resize.bind(this);
    super(...args);
  }

  static initClass() {
    this.prototype.template = _.template(templates.logScreensPanel);
    this.prototype.id = 'log_screens';
  
    this.prototype.events =
      {"click #new_screen_button": "_newScreen"};
  }
  initialize(opts) {
    ({logScreens: this.logScreens, webClient: this.webClient} = opts);
    this.listenTo(this.logScreens, 'add', this._addLogScreen);
    this.listenTo(this.logScreens, 'add remove', this._resize);
    if (typeof window !== 'undefined' && window !== null) { $(window).resize(this._resize); }
    return this.statsView = new LogStatsView({stats: this.webClient.stats});
  }

  _newScreen(e) {
    this.logScreens.add(new this.logScreens.model({name: 'Screen1'}));
    return false;
  }

  _addLogScreen(screen) {
    const view = new LogScreenView({
      logScreens: this.logScreens,
      logScreen: screen
    });
    this.$el.find("div.log_screens").append(view.render().el);
    return false;
  }

  _resize() {
    if ((typeof window === 'undefined' || window === null)) { return; }
    const lscreens = this.logScreens;
    if (lscreens.length) {
      const height = $(window).height() - this.$el.find("div.status_bar").height() - 10;
      return this.$el.find(".log_screen .messages").each(function() {
        return $(this).height((height/lscreens.length) - 12);
      });
    }
  }

  render() {
    this.$el.html(this.template());
    this.$el.find('.stats').append(this.statsView.render().el);
    this._resize();
    return this;
  }
}
LogScreensPanel.initClass();

class LogScreenView extends backbone.View {
  constructor(...args) {
    {
      // Hack: trick Babel/TypeScript into allowing this before super.
      if (false) { super(); }
      let thisFn = (() => { this; }).toString();
      let thisName = thisFn.slice(thisFn.indexOf('{') + 1, thisFn.indexOf(';')).trim();
      eval(`${thisName} = this;`);
    }
    this._close = this._close.bind(this);
    this._clear = this._clear.bind(this);
    this.__filter = this.__filter.bind(this);
    this._filter = this._filter.bind(this);
    this._addNewLogMessage = this._addNewLogMessage.bind(this);
    this._recordScroll = this._recordScroll.bind(this);
    this._renderNewLog = this._renderNewLog.bind(this);
    this._renderMessages = this._renderMessages.bind(this);
    super(...args);
  }

  static initClass() {
    this.prototype.className = 'log_screen';
    this.prototype.template = _.template(templates.logScreenView);
    this.prototype.logTemplate = _.template(templates.logMessage);
  
    this.prototype.events = {
      "click .controls .close": "_close",
      "click .controls .clear": "_clear"
    };
  }
  initialize(opts) {
    ({logScreen: this.logScreen, logScreens: this.logScreens} = opts);
    this.listenTo(this.logScreen, 'destroy', () => this.remove());
    this.listenTo(this.logScreen, 'new_log', this._addNewLogMessage);
    this.forceScroll = true;
    return this.filter = null;
  }

  _close() {
    this.logScreen.logMessages.reset();
    this.logScreen.destroy();
    return false;
  }

  _clear() {
    this.logScreen.logMessages.reset();
    this._renderMessages();
    return false;
  }

  __filter(e) {
    const input = $(e.currentTarget);
    const _filter_buffer = input.val();
    const wait = () => {
      if (_filter_buffer === input.val()) { return this._filter(_filter_buffer); }
    };
    return setTimeout(wait, 350);
  }

  _filter(filter) {
    this.filter = filter ? new RegExp(`(${filter})`, 'ig') : null;
    return this._renderMessages();
  }

  _addNewLogMessage(lmessage) {
    this.logScreen.logMessages.add(lmessage);
    return this._renderNewLog(lmessage);
  }

  _recordScroll(e) {
    const msgs = this.$el.find('.messages');
    return this.forceScroll = (msgs.height() + msgs[0].scrollTop) === msgs[0].scrollHeight;
  }

  _renderNewLog(lmessage) {
    const _msg = lmessage.get('message');
    let msg = lmessage.render_message();
    if (this.filter) {
      msg = _msg.match(this.filter) ? msg.replace(this.filter, '<span class="highlight">$1</span>') : null;
    }
    if (msg) {
      this.msgs.append(this.logTemplate({
        lmessage,
        msg
      })
      );
      if (this.forceScroll) { return this.$el.find('.messages')[0].scrollTop = this.$el.find('.messages')[0].scrollHeight; }
    }
  }

  _renderMessages() {
    this.msgs.html('');
    return this.logScreen.logMessages.forEach(this._renderNewLog);
  }

  render() {
    this.$el.html(this.template({
      logScreens: this.logScreens})
    );
    this.$el.find('.messages').scroll(this._recordScroll);
    this.$el.find('.controls .filter input').keyup(this.__filter);
    this.msgs = this.$el.find('.msg');
    this._renderMessages();
    return this;
  }
}
LogScreenView.initClass();

class LogStatsView extends backbone.View {
  static initClass() {
    this.prototype.template = _.template(templates.logStatsView);
    this.prototype.className = 'stats';
  }
  initialize(opts) {
    ({stats: this.stats} = opts);
    this.rendered = false;
    return setInterval((() => { if (this.rendered) { return this.render(); } }), 1000);
  }

  render() {
    this.$el.html(this.template({
      stats: this.stats})
    );
    this.rendered = true;
    return this;
  }
}
LogStatsView.initClass();

exports.WebClient = WebClient;

function __guard__(value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined;
}