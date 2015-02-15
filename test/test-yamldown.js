var fs = require('fs');
var should = require('should');
var levelup = require('levelup');
var yaml = require('js-yaml');
var sinon = require('sinon');

var YamlDOWN = require('../')({
  encode: yaml.safeDump,
  decode: yaml.safeLoad,
  buffer: false,
  type: 'yaml',
});

var LOCATION = '_testdb_YamlDOWN.yaml';

function removeLocation() {
  if (fs.existsSync(LOCATION)) fs.unlinkSync(LOCATION);
}

function getLocation() {
  return yaml.safeLoad(fs.readFileSync(LOCATION, 'utf-8'));
}

function putLocation(obj) {
  if (typeof(obj) == 'object')
    obj = yaml.safeDump(obj);
  fs.writeFileSync(LOCATION, obj, 'utf-8');
}

describe('YamlDOWN', function() {
  beforeEach(removeLocation);
  afterEach(removeLocation);

  it('should raise error on corrupted data', function(done) {
    putLocation('i am not : - valid yaml');
    var db = levelup(LOCATION, {db: YamlDOWN});
    db.open();
    db.on('error', function(err) {
      err.message.should.match(/^Error parsing JSON in _testdb/);
      done();      
    });
  });

  it('should raise error on corrupted key', function(done) {
    putLocation({'not_a : - _buffer': 'nope'});
    var db = levelup(LOCATION, {db: YamlDOWN});
    db.open();
    db.on('error', function(err) {
      err.message.should.eql('Error parsing key "not_a : - _buffer"\n as a buffer');
      done();      
    });
  });

  it('should raise error on corrupted value', function(done) {
    putLocation({'$hi': false});
    var db = levelup(LOCATION, {db: YamlDOWN});
    db.open();
    db.on('error', function(err) {
      err.message.should.eql('Error parsing value false\n as a buffer');
      done();      
    });
  });

  it('should get existing keys', function(done) {
    putLocation({'$hey': 'there'});
    var db = levelup(LOCATION, {db: YamlDOWN});
    db.get('hey', function(err, value) {
      if (err) return done(err);
      value.should.eql('there');
      done();
    });
  });

  it('should raise error on nonexistent keys', function(done) {
    var db = levelup(LOCATION, {db: YamlDOWN});
    db.get('nonexistent', function(err, value) {
      err.notFound.should.be.true;
      done();
    });
  });

  it('should support binary keys', function(done) {
    putLocation({'[1,2,3]': 'yo'});
    var db = levelup(LOCATION, {db: YamlDOWN});
    db.get(new Buffer([1,2,3]), function(err, value) {
      if (err) return done(err);
      value.should.eql('yo');
      done();
    });
  });

  it('should support binary values', function(done) {
    putLocation({'$hello': [1,2,3]});
    var db = levelup(LOCATION, {db: YamlDOWN});
    db.get('hello', function(err, value) {
      if (err) return done(err);
      value.should.eql(new Buffer([1,2,3]));
      done();
    });
  });

  it('should delete', function(done) {
    putLocation({'$whats': 'up'});
    var db = levelup(LOCATION, {db: YamlDOWN});
    db.del('whats', function(err) {
      if (err) return done(err);
      getLocation().should.eql({});
      done();
    });
  });

  it('should put', function(done) {
    var db = levelup(LOCATION, {db: YamlDOWN});
    db.put('foo', 'bar', function(err) {
      if (err) return done(err);
      getLocation().should.eql({$foo: 'bar'});
      done();
    });
  });

  it('should intelligently queue writes', function(done) {
    var db = levelup(LOCATION, {db: YamlDOWN});
    sinon.spy(fs, 'writeFile');
    db.put('foo', 'bar');
    db.put('lol', 'cats');
    db.put('silly', 'monkey', function(err) {
      if (err) return done(err);
      getLocation().should.eql({
        $foo: 'bar',
        $lol: 'cats',
        $silly: 'monkey'
      });
      fs.writeFile.callCount.should.eql(2);
      db.del('lol', function(err) {
        getLocation().should.eql({
          $foo: 'bar',
          $silly: 'monkey'
        });
        fs.writeFile.callCount.should.eql(3);
        fs.writeFile.restore();
        done();
      });
    });
  });
});
