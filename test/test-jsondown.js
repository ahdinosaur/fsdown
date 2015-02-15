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

describe('JsonDOWN', function() {
  beforeEach(clearLocation);
  afterEach(clearLocation);

  it('should raise error on corrupted data', function(done) {
    putPath(["key"], 'i am not valid json');
    var db = levelup(LOCATION, {db: JsonDOWN});
    db.open();
    db.on('error', function(err) {
      expect(err.message).to.match(/^Error decoding file/);
      done();      
    });
  });

  it('should get existing keys', function(done) {
    putPath(['hey'], '{ "you": "there" }');
    var db = levelup(LOCATION, {db: JsonDOWN});
    console.log("get hey");
    db.get('hey', function(err, value) {
      console.log("got hey", err, value);
      if (err) return done(err);
      value.should.deep.eql({ you: 'there' });
      done();
    });
  });

  it('should raise error on nonexistent keys', function(done) {
    putPath(['hey'], '{ "you": "there" }');
    var db = levelup(LOCATION, {db: JsonDOWN});
    db.get('nonexistent', function(err, value) {
      err.notFound.should.be.true;
      done();
    });
  });

  it('should support binary values', function(done) {
    putPath(['hello'], [1,2,3]);
    var db = levelup(LOCATION, {db: JsonDOWN});
    db.get('hello', function(err, value) {
      if (err) return done(err);
      value.should.eql(new Buffer([1,2,3]));
      done();
    });
  });

  it('should delete', function(done) {
    putPath(['whats'], '{ "up": "down" }');
    var db = levelup(LOCATION, {db: JsonDOWN});
    db.del('whats', function(err) {
      if (err) return done(err);
      getPath(['whats']).should.eql({});
      done();
    });
  });

  it('should put', function(done) {
    var db = levelup(LOCATION, {db: JsonDOWN});
    db.put('foo', '{ "bar": "baz" }', function(err) {
      if (err) return done(err);
      getPath(["foo"]).should.deep.eql({bar: 'baz'});
      done();
    });
  });

  it('should intelligently queue writes', function(done) {
    var db = levelup(LOCATION, {db: JsonDOWN});
    sinon.spy(fs, 'writeFile');

    db.put('foo', '{ "bar": "baz"}');
    db.put('lol', '{ "cats": "dogs" }');
    db.put('silly', '{ "monkey": "human"}', function(err) {
      if (err) return done(err);

      getPath(['foo']).should.deep.eql({ bar: 'baz' });
      getPath(['lol']).should.deep.eql({ cats: 'dogs' });
      getPath(['silly']).should.deep.eql({ monkey: 'human' });

      fs.writeFile.callCount.should.eql(3);
      db.del('lol', function(err) {
        getPath(['lol']).should.throw;
        fs.writeFile.callCount.should.eql(3);
        fs.writeFile.restore();
        done();
      });
    });
  });
});
