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

  FsDOWN.prototype._dataToBatchOp = function (data) {
    console.log("_dataToBatchOp", data);

    return Object.keys(data).map(function(key) {
      var value = data[key];

      if (/^\$/.test(key)) {
        key = key.slice(1);
      } else {
        try {
          key = new Buffer(encoding.decode(key));
        } catch (e) {
          throw new Error('Error parsing key ' +
            encoding.encode(key) + ' as a buffer');
        }
      }
      if (typeof(value) != 'string') {
      try {
        value = new Buffer(value);
      } catch (e) {
        throw new Error('Error parsing value ' +
           encoding.encode(value) + ' as a buffer');
        }
      }
      return {type: 'put', key: key, value: value};
    });
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

      fs.readFile(entry.fullPath, 'utf8', function (err, data) {
        if (err) { return cb(err); }

        console.log("data", key, data);

        try {
          data = encoding.decode(data);
        } catch (e) {
          return cb(new Error('Error decoding file in ' +
            entry.path + ": " + e.message
          ));
        }
        
        // convert to batch op
        //var op = this._dataToBatchOp(data);
        var op = {type: 'put', key: key, value: data};

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

  FsDOWN.prototype._put = function(key, value, options, cb) {
    // check that level keys are can be filenames
    //if (level.map(function ) {
    //})
    MemDOWN.prototype._put.call(this, key, value, options, noop);
    if (this._loaded) this._write(key, cb);
  };

  FsDOWN.prototype._del = function(key, options, cb) {
    // check that level keys are can be filenames
    //if (level.map(function ) {
    //})
    MemDOWN.prototype._del.call(this, key, options, noop);
    this._write(key, cb);
  };

  return FsDOWN;
}

module.exports = fsDown;
