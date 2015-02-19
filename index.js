var util = require('util');
var fs = require('fs');
var MemDOWN = require('memdown');
var encodings = require('levelup/lib/encodings');
var Sublevel = require('level-sublevel/codec');
var through = require('through2');
var extend = require('xtend');
var Queue = require('tiny-queue');
var toArray = require('stream-to-array');
var getIn = require('get-in');
var setIn = require('set-in');
var Path = require('path');

var mkdirp = require('mkdirp');
var readdirp = require('readdirp');

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

    console.log("location", location);

    MemDOWN.call(this, location);

    this._loaded = false;
    this._queues = {};
  }

  util.inherits(FsDOWN, MemDOWN);

  FsDOWN.prototype._pathToKey = function (path) {
    console.log("_pathToKey(", path, ")")
    if (path.length === 1) {
      return path[0];
    }
    var subs = [].slice.call(path);
    var key = subs.pop();
    return Sublevel.encode([subs, key])
  }

  FsDOWN.prototype._keyToPath = function (key) {
    var subsAndKey = Sublevel.decode(key)
    var subs = subsAndKey[0];
    var key = subsAndKey[1];
    return subs.concat([key]);
  }

  FsDOWN.prototype._getQueue = function (path) {
    var queue = getIn(this._queues, path);
    if (!queue) {
      queue = []
      setIn(this._queues, path, queue);
    }
    return queue
  }

  FsDOWN.prototype._isWriting = function (path) {
    return getIn(this._writing, path);
  }

  FsDOWN.prototype._setWriting = function (path, state) {
    return setIn(this._writing, path, state);
  }

  FsDOWN.prototype._encodeValue = function (value) {
    if (typeof key === 'string') {
      key = key;
    } else {
      try {
        value = encoding.encode(value);
      } catch (e) {
        throw new Error('Error encoding value ' +
            encoding.encode(value));
      }
      return value;
    }
  }

  FsDOWN.prototype._encodeKey = function (key) {
    if (typeof key === 'string') {
      key = key;
    } else {
      try {
        key = encoding.encode(key);
      } catch (e) {
        throw new Error('Error encoding key ' +
          encoding.encode(key));
      }
    }
    return key;
  }

  FsDOWN.prototype._decodeValue = function (value) {
    try {
      value = encoding.decode(value);
    } catch (e) {
      throw new Error('Error decoding value ' +
          encoding.encode(value));
    }
    return value;
  }

  FsDOWN.prototype._decodeKey = function (key) {
    try {
      key = encoding.decode(key);
    } catch (e) {
      throw new Error('Error decoding key ' +
        encoding.encode(key));
    }
    return key;
  }

  FsDOWN.prototype._dataToPut = function (key, value) {
    console.log("_dataToPut", key, value);
    key = this._encodeKey(key);
    value = this._encodeValue(value);
    return {type: 'put', key: key, value: value};
  };

  FsDOWN.prototype._open = function(options, cb) {

    var dir = readdirp({
      root: this.location,
      fileFilter: "*." + encoding.type,
    })

    //console.log("dir", dir, "*." + encoding.type);

    var ops = dir
    .on('warn', function (err) { 
      console.error('non-fatal error', err); 
      // optionally call stream.destroy() here in order to abort and cause 'close' to be emitted 
    })
    .on('error', function (err) {
      console.error('fatal error', err);
      if (err.code == 'ENOENT') return cb(null, this);
      return cb(err);
    })
    .pipe(through.obj(function (entry, enc, cb) {
      console.log("entry", entry.fullPath);

      var dirname = Path.dirname(entry.path);
      var basename = Path.basename(entry.path, "." + encoding.type);
      var path = Path.join(dirname, basename).split('/');

      var key = this._pathToKey(path);

      fs.readFile(entry.fullPath, 'utf8', function (err, value) {
        if (err) { return cb(err); }

        console.log("key", key, "value", value);

        // decode value to test
        this._decodeValue(value);

        var op = {type: 'put', key: key, value: value};

        return cb(null, op);
      }.bind(this));
    }.bind(this)))

    toArray(ops, function (err, arr) {
      if (err) { return cb(err); }

      console.log("ops", arr);

      this._batch(arr, {}, function (err) {
        if (err) { return cb(err); }

        console.log("loaded");
        this.loaded = true;

        return cb(null, this);
      }.bind(this));
    }.bind(this));
    ;
  };

  FsDOWN.prototype._write = function (key, cb) {
    console.log("writing", key);
    var path = this._keyToPath(key);

    if (this._isWriting(path)) {
      return this._getQueue(path).push(cb);
    }

    this._setWriting(path, true);

    this._get(key, {}, function (err, value) {
      if (err) { return cb(err); }

      var fsPath = path.join("/");

      fs.writeFile(fsPath, value, function (err) {
        if (err) { return cb(err); }

        this._setWriting(path, false);

        var queue = this._getQueue(path);
        var queued = queue.splice(0);
        if (queued.length) {
          this._write(function (err) {
            queued.forEach(function (cb) {
              cb(err);
            });
          }.bind(this))
        }
      }.bind(this));
    }.bind(this));
  };

  FsDOWN.prototype._get = function(key, options, cb) {
    MemDOWN.prototype._get.call(this, key, options, function (err, value) {
      if (err) { return cb(err); }
      // decode value
      value = encoding.decode(value);
      cb(null, value);
    });
  };

  FsDOWN.prototype._put = function(key, value, options, cb) {
    // TODO check that level keys can be filenames
    // encode value
    var put = this._dataToPut(key, value);
    MemDOWN.prototype._put.call(this, put.key, put.value, options, noop);
    if (this._loaded) this._write(key, cb);
  };

  FsDOWN.prototype._del = function(key, options, cb) {
    // TODO check that level keys are can be filenames
    MemDOWN.prototype._del.call(this, key, options, noop);
    this._write(key, cb);
  };

  return FsDOWN;
}

module.exports = fsDown;
