var util = require('util');
var fs = require('fs');
var MemDOWN = require('memdown');
var encodings = require('levelup/lib/encodings');
var extend = require('xtend');

if (process.env.NODE_ENV !== 'production'){
//  require('longjohn');
}

// use encodings from levelup
var encodings = extend(require('levelup/lib/encodings'), {
  // use json-stringify-safe instead of JSON.stringify
  json: extend(encodings.json, {
    encode: require('json-stringify-safe'),
  }),
});

function noop() {}

function fsDown(encoding) {
  encoding = typeof encoding === 'string' ?
      encodings[encoding] : encoding
  ;

  function FsDOWN(location) {
    if (!(this instanceof FsDOWN))
      return new FsDOWN(location);
    MemDOWN.call(this, location);

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
          key = new Buffer(encoding.decode(key));
        } catch (e) {
          throw new Error('Error parsing key ' + encoding.encode(key) +
                          ' as a buffer');
        }
      }
      if (typeof(value) != 'string') {
        try {
          value = new Buffer(value);
        } catch (e) {
          throw new Error('Error parsing value ' + encoding.encode(value) +
                          ' as a buffer');
        }
      }
      return {type: 'put', key: key, value: value};
    }, this);
  };

  FsDOWN.prototype._open = function(options, cb) {

    fs.readFile(this.location, 'utf-8', function(err, data) {
      if (err) {
        if (err.code == 'ENOENT') return cb(null, this);
        return cb(err);
      }
      try {
        data = encoding.decode(data);
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
    fs.writeFile(this.location, encoding.encode(this._store), {
      encoding: 'utf-8',
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

  return FsDOWN;
}

module.exports = fsDown;
