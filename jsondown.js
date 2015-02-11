var util = require('util');
var fs = require('fs');
var MemDOWN = require('memdown');
var encodings = require('levelup/lib/encodings');
var extend = require('xtend');

if (process.env.NODE_ENV !== 'production'){
//  require('longjohn');
}

//var niceStringify = require('./nice-stringify');
var niceStringify = require('json-stringify-safe');

function noop() {}

function FsDOWN(location, options) {
  if (!(this instanceof FsDOWN))
    return new FsDOWN(location, options);
  MemDOWN.call(this, location);

  options = options || {};

  // use encodings from levelup
  this.encodings = extend(encodings, {
    // use nice-stringify as encoder instead of JSON.stringify
    json: extend(encodings.json, {
      encode: niceStringify,
    }),
  });

  this.dataEncoding = 
    typeof options.dataEncoding === 'string' ?
      encodings[options.dataEncoding] :
      options.dataEncoding || this.encodings.json;
  ;
  this.fileEncoding = options.fileEncoding || "utf-8";

  this._isLoadingFromFile = false;
  this._isWriting = false;
  this._queuedWrites = [];
}

util.inherits(FsDOWN, MemDOWN);

FsDOWN.prototype._jsonToBatchOps = function(data) {
  return Object.keys(data).map(function(key) {
    var value = data[key];
    if (/^\$/.test(key)) {
      key = key.slice(1);
    } else {
      try {
        key = new Buffer(this.dataEncoding.decode(key));
      } catch (e) {
        throw new Error('Error parsing key ' + this.dataEncoding.encode(key) +
                        ' as a buffer');
      }
    }
    if (typeof(value) != 'string') {
      try {
        value = new Buffer(value);
      } catch (e) {
        throw new Error('Error parsing value ' + this.dataEncoding.encode(value) +
                        ' as a buffer');
      }
    }
    return {type: 'put', key: key, value: value};
  }, this);
};

FsDOWN.prototype._open = function(options, cb) {

  fs.readFile(this.location, this.fileEncoding, function(err, data) {
    if (err) {
      if (err.code == 'ENOENT') return cb(null, this);
      return cb(err);
    }
    try {
      data = this.dataEncoding.decode(data);
    } catch (e) {
      return cb(new Error('Error parsing JSON in ' + this.location +
                          ': ' + e.message));
    }
    this._isLoadingFromFile = true;
    try {
      try {
        this._batch(this._jsonToBatchOps(data), {}, noop);
      } finally {
        this._isLoadingFromFile = false;
      }
    } catch (e) {
      return cb(e);
    }
    cb(null, this);
  }.bind(this));
};

FsDOWN.prototype._writeToDisk = function(cb) {
  if (this._isWriting)
    return this._queuedWrites.push(cb);
  this._isWriting = true;
  fs.writeFile(this.location, this.dataEncoding.encode(this._store), {
    encoding: this.fileEncoding,
  }, function(err) {
    var queuedWrites = this._queuedWrites.splice(0);
    this._isWriting = false;
    if (queuedWrites.length)
      this._writeToDisk(function(err) {
        queuedWrites.forEach(function(cb) { cb(err); });
      });
    cb(err);
  }.bind(this));
};

FsDOWN.prototype._put = function(key, value, options, cb) {
  MemDOWN.prototype._put.call(this, key, value, options, noop);
  if (!this._isLoadingFromFile) this._writeToDisk(cb);
};

FsDOWN.prototype._del = function(key, options, cb) {
  MemDOWN.prototype._del.call(this, key, options, noop);
  this._writeToDisk(cb);
};

module.exports = FsDOWN;
