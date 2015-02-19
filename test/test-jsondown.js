var fs = require('fs');
var expect = require('chai').expect;
var levelup = require('levelup');
var sinon = require('sinon');
var Path = require('path');
var rimraf = require('rimraf');
var mkdirp = require('mkdirp');

var JsonDOWN = require('../')('json');

var LOCATION = __dirname + "/data";

function pathToFsPath (path) {
  return Path.join(LOCATION, path.join('/')) + ".json";
};

function removePath(path) {
  var fsPath = pathToFsPath(path);
  if (fs.existsSync(fsPath)) fs.unlinkSync(fsPath);
}

function getPath(path) {
  var fsPath = pathToFsPath(path);
  return JSON.parse(fs.readFileSync(fsPath, 'utf-8'));
}

function putPath(path, obj) {
  var fsPath = pathToFsPath(path);
  var dirname = Path.dirname(fsPath);
  mkdirp.sync(dirname);
  if (typeof(obj) == 'object')
    obj = JSON.stringify(obj);
  fs.writeFileSync(fsPath, obj, 'utf-8');
}

function clearLocation () {
  rimraf.sync(LOCATION);
}

function initDb () {
  return levelup(LOCATION, {
    db: JsonDOWN,
    valueEncoding: "json",
  });
}

describe('JsonDOWN', function() {
  beforeEach(clearLocation);
  afterEach(clearLocation);

  it('should raise error on corrupted data', function(done) {
    putPath(["key"], 'i am not valid json');
    var db = initDb();
    db.open();
    db.on('error', function(err) {
      expect(err.message).to.match(/^Error decoding value/);
      done();      
    });
  });

  it('should get existing keys', function(done) {
    putPath(['hey'], '{ "you": "there" }');
    var db = initDb();
    db.get('hey', function(err, value) {
      if (err) return done(err);
      expect(value).to.deep.eql({ you: 'there' });
      done();
    });
  });

  it('should raise error on nonexistent keys', function(done) {
    putPath(['hey'], '{ "you": "there" }');
    var db = initDb();
    db.get('nonexistent', function(err, value) {
      expect(err.notFound).to.be.true;
      done();
    });
  });

  it('should delete', function(done) {
    putPath(['whats'], '{ "up": "down" }');
    var db = initDb();
    db.del('whats', function(err) {
      if (err) return done(err);
      expect(getPath(['whats'])).to.deep.eql({});
      done();
    });
  });

  it('should put', function(done) {
    var db = initDb();
    db.put('foo', '{ "bar": "baz" }', function(err) {
      if (err) return done(err);
      expect(getPath(["foo"])).to.eql('{ "bar": "baz" }');
      done();
    });
  });

  it('should intelligently queue writes', function(done) {
    var db = initDb();
    sinon.spy(fs, 'writeFile');

    db.put('foo', '{ "bar": "baz"}');
    db.put('lol', '{ "cats": "dogs" }');
    db.put('silly', '{ "monkey": "human"}', function(err) {
      if (err) return done(err);

      expect(getPath(['foo'])).to.deep.eql({ bar: 'baz' });
      expect(getPath(['lol'])).to.deep.eql({ cats: 'dogs' });
      expect(getPath(['silly'])).to.deep.eql({ monkey: 'human' });

      expect(fs.writeFile.callCount).to.eql(3);
      db.del('lol', function(err) {
        expect(getPath(['lol'])).to.throw;
        expect(fs.writeFile.callCount).to.eql(3);
        fs.writeFile.restore();
        done();
      });
    });
  });
});
